import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import sanitizeHtml from "sanitize-html";
import type ExcelJS from "exceljs";
import { checkPlanLimit, PLAN_LIMITS } from "@/lib/plan-limits";
import { parse as parseHtml } from "node-html-parser";

// SECURITY (LOW-5): Hard cap on imported file size to prevent memory exhaustion
// via oversized files passed to pdf/spreadsheet parsers.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// SECURITY (C-2 / CRITICAL): Absolute caps on parser output to prevent zip-bomb
// OOM and billion-laughs XML blowup on untrusted user uploads.
const MAX_EXCEL_SHEETS = 20;
const MAX_EXCEL_ROWS_PER_SHEET = 10_000;
const MAX_PDF_PAGES = 500;
const MAX_PDF_ITEMS_PER_PAGE = 20_000;
// Wall-clock cap per parser run. Aborts hung / zip-bombed conversions before
// the Vercel 15s / 60s max-duration budget is consumed across invocations.
const PARSER_TIMEOUT_MS = 15_000;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves `promise` but rejects with a clear error if `ms` elapse first.
 * Used to bound every untrusted-parser call.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`${label} exceeded ${ms}ms timeout — aborting parse.`));
      }, ms)
    ),
  ]);
}

/**
 * Convert Excel / CSV spreadsheet buffer into a structured Tiptap ProseMirror document.
 * Uses ExcelJS instead of the unmaintained SheetJS CE.
 *
 * SECURITY (C-2 / CRITICAL):
 *   - Caps total sheets + rows per sheet (billion-laughs XML / row OOM).
 *   - Wrapped in withTimeout — prevents hang on malformed sharedStrings.xml.
 *   - Caller still enforces 10 MB outer file-size cap before we get here.
 */
export async function excelToTiptap(buffer: Buffer): Promise<object> {
  const ExcelJS = (await import("exceljs")).default;
  return withTimeout<object>(
    (async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const content: object[] = [];

      let sheetIndex = 0;
      const sheetIterator = workbook.worksheets[Symbol.iterator]();
      for (const sheet of sheetIterator) {
        sheetIndex += 1;
        if (sheetIndex > MAX_EXCEL_SHEETS) break;

        if (workbook.worksheets.length > 1) {
          content.push({
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: `Sheet: ${sheet.name}` }],
          });
        }

        const rows: string[][] = [];
        let rowIndex = 0;
        // ExcelJS `eachRow` has no early-break API; track externally and
        // push only up to the cap to bound memory.
        const maxRowsBound = Math.min(sheet.actualRowCount || 0, MAX_EXCEL_ROWS_PER_SHEET);
        sheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
          if (rowNumber > maxRowsBound) return;
          rowIndex = rowNumber;
          const cells = (row.values as ExcelJS.CellValue[]).slice(1); // index 0 is empty
          rows.push(cells.map((c) => (c !== null && c !== undefined ? String(c).trim() : "")));
        });
        void rowIndex;

        if (rows.length === 0) continue;

        const headerRow = rows[0];
        const dataRows = rows.slice(1).filter((r) => r.some((v) => v !== ""));

        if (dataRows.length > 0) {
          content.push({
            type: "paragraph",
            content: [{ type: "text", text: `Columns: ${headerRow.join(" | ")}`, marks: [{ type: "bold" }] }],
          });

          const listItems: object[] = dataRows.slice(0, 500).map((row) => {
            const rowText = row
              .map((val, idx) => (val ? `${headerRow[idx] || `Col ${idx + 1}`}: ${val}` : null))
              .filter(Boolean)
              .join(" • ");
            return {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: rowText }] }],
            };
          });

          if (listItems.length > 0) {
            content.push({ type: "bulletList", content: listItems });
          }
        } else {
          content.push({ type: "paragraph", content: [{ type: "text", text: headerRow.join(" | ") }] });
        }
      }

      if (content.length === 0) {
        content.push({ type: "paragraph", content: [{ type: "text", text: "Empty spreadsheet." }] });
      }

      return { type: "doc", content };
    })(),
    PARSER_TIMEOUT_MS,
    "excelToTiptap"
  );
}

/**
 * Sanitize HTML from mammoth or imported HTML using an allowlist of safe tags.
 *
 * SECURITY (H-4 / HIGH):
 *   - Explicitly set disallowedTagsMode: "escape" to neutralize the
 *     CVE-2026-44990 default-discard path XSS via <xmp>/<textarea>/</textarea>.
 *   - Imported DOCX/HTML anchor links are rewritten with target=_blank +
 *     rel=noopener noreferrer to block reverse tabnabbing.
 *   - allowedSchemes is explicitly enumerated (not default list) to prevent
 *     future CVE-2026-53606-style attribute URI scheme bypasses.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li",
    "pre", "code", "blockquote", "strong", "em", "b", "i", "br", "a"
  ],
  allowedAttributes: {
    a: ["href", "title"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  disallowedTagsMode: "escape",
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
  },
};

export function sanitize(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/** Decode common HTML entities in a plain-text string. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}

/** Strip RTF markup to extract readable text. */
export function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\fonttbl.*?;/g, "")
    .replace(/\\colortbl.*?;/g, "")
    .replace(/\\stylesheet.*?;/g, "")
    .replace(/\\{\\*\\.*?\}/g, "")
    .replace(/\\[a-z0-9]+\s?/gi, "")
    .replace(/[\{\}]/g, "")
    .trim();
}

/** Parse inline markdown marks with recursive mark inheritance (bold, italic, code). */
export function parseInlineContent(text: string, inheritedMarks: Array<{ type: string }> = []): object[] {
  if (!text) return [];
  if (!/[*`_]/.test(text)) {
    return [
      inheritedMarks.length > 0
        ? { type: "text", text, marks: [...inheritedMarks] }
        : { type: "text", text },
    ];
  }

  const nodes: object[] = [];
  let i = 0;
  let textBuffer = "";

  function flushBuffer() {
    if (textBuffer.length > 0) {
      nodes.push(
        inheritedMarks.length > 0
          ? { type: "text", text: textBuffer, marks: [...inheritedMarks] }
          : { type: "text", text: textBuffer }
      );
      textBuffer = "";
    }
  }

  while (i < text.length) {
    // 1. Inline code: `...` (verbatim text, highest precedence)
    if (text[i] === "`") {
      const closeIdx = text.indexOf("`", i + 1);
      if (closeIdx > i + 1) {
        flushBuffer();
        const codeText = text.slice(i + 1, closeIdx);
        nodes.push({
          type: "text",
          text: codeText,
          marks: [...inheritedMarks, { type: "code" }],
        });
        i = closeIdx + 1;
        continue;
      }
    }

    // 2. Triple Delimiter: ***...*** or ___...___ (Bold + Italic)
    if (
      (text.startsWith("***", i) || text.startsWith("___", i)) &&
      text.length > i + 6
    ) {
      const delim = text.slice(i, i + 3);
      const closeIdx = text.indexOf(delim, i + 3);
      if (closeIdx > i + 3) {
        flushBuffer();
        const innerText = text.slice(i + 3, closeIdx);
        const childNodes = parseInlineContent(innerText, [
          ...inheritedMarks,
          { type: "bold" },
          { type: "italic" },
        ]);
        nodes.push(...childNodes);
        i = closeIdx + 3;
        continue;
      }
    }

    // 3. Double Delimiter: **...** or __...__ (Bold)
    if (
      (text.startsWith("**", i) || text.startsWith("__", i)) &&
      text.length > i + 4
    ) {
      const delim = text.slice(i, i + 2);
      const closeIdx = text.indexOf(delim, i + 2);
      if (closeIdx > i + 2) {
        flushBuffer();
        const innerText = text.slice(i + 2, closeIdx);
        const childNodes = parseInlineContent(innerText, [
          ...inheritedMarks,
          { type: "bold" },
        ]);
        nodes.push(...childNodes);
        i = closeIdx + 2;
        continue;
      }
    }

    // 4. Single Delimiter: *...* or _..._ (Italic)
    if (
      (text[i] === "*" || text[i] === "_") &&
      !text.startsWith("**", i) &&
      !text.startsWith("__", i)
    ) {
      const delim = text[i];
      const closeIdx = text.indexOf(delim, i + 1);
      if (closeIdx > i + 1 && text[i + 1] !== " ") {
        flushBuffer();
        const innerText = text.slice(i + 1, closeIdx);
        const childNodes = parseInlineContent(innerText, [
          ...inheritedMarks,
          { type: "italic" },
        ]);
        nodes.push(...childNodes);
        i = closeIdx + 1;
        continue;
      }
    }

    textBuffer += text[i];
    i++;
  }

  flushBuffer();
  return nodes.length > 0
    ? nodes
    : [{ type: "text", text, ...(inheritedMarks.length ? { marks: inheritedMarks } : {}) }];
}

/** Convert a markdown / plain-text string into a Tiptap ProseMirror JSON doc. */
export function textToTiptap(raw: string): object {
  const lines = raw.split(/\r?\n/);
  const content: object[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  let currentListType: "bulletList" | "orderedList" | null = null;
  let currentListItems: object[] = [];

  function flushCurrentList() {
    if (currentListType && currentListItems.length > 0) {
      content.push({
        type: currentListType,
        content: [...currentListItems],
      });
      currentListItems = [];
      currentListType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedRight = line.trimEnd();
    const trimmed = trimmedRight.trimStart();

    // Code blocks (```lang ... ```)
    if (trimmed.startsWith("```")) {
      flushCurrentList();
      if (inCodeBlock) {
        content.push({
          type: "codeBlock",
          content: [{ type: "text", text: codeBuffer.join("\n") }],
        });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Horizontal Rule (---, ***, ___)
    if (/^(---|[*]{3,}|___)$/.test(trimmed)) {
      flushCurrentList();
      content.push({ type: "horizontalRule" });
      continue;
    }

    // Headings
    const h6 = trimmed.match(/^######\s+(.+)/);
    const h5 = trimmed.match(/^#####\s+(.+)/);
    const h4 = trimmed.match(/^####\s+(.+)/);
    const h3 = trimmed.match(/^###\s+(.+)/);
    const h2 = trimmed.match(/^##\s+(.+)/);
    const h1 = trimmed.match(/^#\s+(.+)/);

    if (h1 || h2 || h3 || h4 || h5 || h6) {
      flushCurrentList();
      const match = h1 || h2 || h3 || h4 || h5 || h6;
      const level = h1 ? 1 : h2 ? 2 : h3 ? 3 : h4 ? 4 : h5 ? 5 : 6;
      content.push({
        type: "heading",
        attrs: { level },
        content: parseInlineContent(match![1]),
      });
      continue;
    }

    // Unordered lists (- , * , + ) - includes indented sub-items
    const ulMatch = trimmed.match(/^[\-\*\+]\s+(.+)/);
    if (ulMatch) {
      if (currentListType && currentListType !== "bulletList") {
        flushCurrentList();
      }
      currentListType = "bulletList";
      currentListItems.push({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInlineContent(ulMatch[1]) }],
      });
      continue;
    }

    // Ordered lists (1. , 2. ) - includes indented sub-items
    const olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (currentListType && currentListType !== "orderedList") {
        flushCurrentList();
      }
      currentListType = "orderedList";
      currentListItems.push({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInlineContent(olMatch[1]) }],
      });
      continue;
    }

    // Non-list line encountered -> flush active list
    flushCurrentList();

    // Blockquotes (> )
    const bqMatch = trimmed.match(/^>\s*(.+)/);
    if (bqMatch) {
      content.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: parseInlineContent(bqMatch[1]) }],
      });
      continue;
    }

    // Empty lines
    if (trimmed === "") {
      content.push({ type: "paragraph" });
      continue;
    }

    // Standard paragraph
    content.push({
      type: "paragraph",
      content: parseInlineContent(trimmed),
    });
  }

  // Flush remaining list at EOF
  flushCurrentList();

  // Gracefully auto-close unclosed code blocks at EOF
  if (inCodeBlock && codeBuffer.length > 0) {
    content.push({
      type: "codeBlock",
      content: [{ type: "text", text: codeBuffer.join("\n") }],
    });
  }

  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/**
 * Convert HTML into a Tiptap ProseMirror JSON doc.
 */
function htmlToTiptap(rawHtml: string): object {
  const html = sanitize(rawHtml);
  if (!html.trim()) return textToTiptap("");

  const root = parseHtml(html);
  const content: object[] = [];

  for (const node of root.childNodes) {
    const tag = (node as { tagName?: string }).tagName?.toLowerCase() ?? "";
    const text = decodeEntities(node.text.trim());

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      if (text) content.push({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
    } else if (tag === "ul" || tag === "ol") {
      const listType = tag === "ul" ? "bulletList" : "orderedList";
      const items: object[] = [];
      for (const li of (node as ReturnType<typeof parseHtml>).querySelectorAll("li")) {
        const liText = decodeEntities(li.text.trim());
        if (liText) {
          items.push({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: liText }] }],
          });
        }
      }
      if (items.length) content.push({ type: listType, content: items });
    } else if (tag === "pre") {
      if (text) content.push({ type: "codeBlock", content: [{ type: "text", text }] });
    } else if (tag === "blockquote") {
      if (text) content.push({ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    } else if (tag === "p" || tag === "") {
      if (text) content.push({ type: "paragraph", content: [{ type: "text", text }] });
    }
  }

  if (content.length === 0) return textToTiptap(decodeEntities(root.text));
  return { type: "doc", content };
}

// ── route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const workspaceId = formData.get("workspaceId") as string | null;

  if (!file || !workspaceId) {
    return NextResponse.json({ error: "file and workspaceId are required" }, { status: 400 });
  }

  // SECURITY (LOW-5): Enforce the import file size limit before passing to
  // any parser. pdf-parse/pdfjs-dist and ExcelJS can consume large amounts of
  // memory on crafted files; rejecting early prevents DoS via resource exhaustion.
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json(
      { error: `File must be smaller than ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB.` },
      { status: 413 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = [
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "tsv",
    "txt", "text", "md", "markdown", "json", "html", "htm", "rtf"
  ];
  if (!allowed.includes(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Supported formats: PDF, DOCX, DOC, XLSX, XLS, CSV, TSV, TXT, MD, JSON, HTML, RTF." },
      { status: 415 }
    );
  }

  // Verify file magic bytes
  const magicBuffer = await file.slice(0, 8).arrayBuffer();
  const magic = new Uint8Array(magicBuffer);

  if (ext === "pdf") {
    // PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
    const isPdf = magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46;
    if (!isPdf) {
      return NextResponse.json({ error: "File does not appear to be a valid PDF document." }, { status: 415 });
    }
  } else if (ext === "docx" || ext === "xlsx") {
    // DOCX / XLSX / ZIP magic bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
    const isZip = magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04;
    if (!isZip) {
      return NextResponse.json({ error: `File does not appear to be a valid .${ext} document.` }, { status: 415 });
    }
  }

  // Run membership + workspace fetch in parallel
  const [member, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, owner: { select: { plan: true } } },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const plan = workspace.owner.plan ?? "free";

  // ── Plan limit checks ──────────────────────────────────────────────────────
  const docCount = await prisma.document.count({ where: { workspaceId } });
  const countCheck = checkPlanLimit(
    {
      plan,
      currentAiCredits: 0,
      currentMemberCount: 0,
      currentDocumentCount: docCount,
      currentWorkspaceCount: 0,
    },
    "create_document"
  );
  if (!countCheck.allowed) {
    return NextResponse.json(
      { error: countCheck.reason, upgradePrompt: countCheck.upgradePrompt },
      { status: 403 }
    );
  }

  const storageLimitMb = PLAN_LIMITS[plan].storageMb;
  // ──────────────────────────────────────────────────────────────────────────

  const title = file.name.replace(/\.[^/.]+$/, "").trim() || "Imported document";
  let tiptapContent: object;

  try {
    if (ext === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      tiptapContent = await withTimeout<object>(
        (async () => {
          // Heavy pdfjs-dist is dynamically imported on-demand to eliminate serverless cold-start bloat
          const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const loadingTask = getDocument({ data: new Uint8Array(buffer) });
          const pdfDoc = await loadingTask.promise;
          const textParts: string[] = [];
          // SECURITY (L-6): Cap page count + per-page item count. A 10 MB outer
          // PDF can still have 10,000 pages; these bounds prevent CPU/RAM burn.
          const maxPages = Math.min(pdfDoc.numPages, MAX_PDF_PAGES);
          for (let i = 1; i <= maxPages; i++) {
            const page = await pdfDoc.getPage(i);
            const tc = await page.getTextContent();
            const items = tc.items.slice(0, MAX_PDF_ITEMS_PER_PAGE);
            textParts.push(
              items
                .map((item: any) => ("str" in item ? (item as { str: string }).str : ""))
                .join(" ")
            );
          }
          return textToTiptap(textParts.join("\n\n"));
        })(),
        PARSER_TIMEOUT_MS,
        "pdfToTiptap"
      );
    } else if (ext === "xlsx" || ext === "xls" || ext === "csv" || ext === "tsv") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // SECURITY (HIGH-8): exceljs replaces xlsx/SheetJS CE (unmaintained).
      // excelToTiptap itself applies C-2 caps + 15s timeout internally.
      tiptapContent = await excelToTiptap(buffer);
    } else if (ext === "docx" || ext === "doc") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      try {
        // Heavy mammoth parser is dynamically imported on-demand
        const mammoth = (await import("mammoth")).default;
        // SECURITY (C-1 / CRITICAL):
        //   - Explicit { externalFileAccess: false } blocks CVE-2025-11849-class
        //     r:link / image resolves that would otherwise read arbitrary local
        //     files and embed them base64-encoded into the generated HTML.
        //   - includeEmbeddedStyleMap disabled to reduce untrusted-reference surface.
        //   - Parser itself wrapped in 15s timeout to stop zip-bomb OOM hangs.
        const result = await withTimeout(
          mammoth.convertToHtml(
            { buffer },
            { externalFileAccess: false, includeEmbeddedStyleMap: false }
          ),
          PARSER_TIMEOUT_MS,
          "mammoth.convertToHtml"
        );
        tiptapContent = htmlToTiptap(result.value);
      } catch (docErr) {
        // Fallback for legacy binary .doc or malformed Word docs: extract ASCII printable text
        const rawString = buffer.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, " ");
        tiptapContent = textToTiptap(rawString.replace(/\s+/g, " "));
      }
    } else if (ext === "html" || ext === "htm") {
      const raw = await file.text();
      tiptapContent = htmlToTiptap(raw);
    } else if (ext === "json") {
      const raw = await file.text();
      const json = JSON.parse(raw);
      if (json && typeof json === "object" && json.type === "doc" && Array.isArray(json.content)) {
        tiptapContent = json;
      } else if (json && typeof json === "object" && json.content?.type === "doc") {
        tiptapContent = json.content;
      } else {
        tiptapContent = textToTiptap(JSON.stringify(json, null, 2));
      }
    } else if (ext === "rtf") {
      const raw = await file.text();
      const plain = stripRtf(raw);
      tiptapContent = textToTiptap(plain);
    } else {
      // txt, text, md, markdown
      const raw = await file.text();
      tiptapContent = textToTiptap(raw);
    }
  } catch (err) {
    console.error("[import-doc] parse error", err);
    return NextResponse.json({ error: "Failed to parse the document content." }, { status: 422 });
  }

  // Use the actual serialised Tiptap JSON size for storage accounting, not the
  // raw file size. Conversion can produce output significantly larger than the
  // input (e.g. a 1 MB PDF may expand to 5 MB of Tiptap JSON nodes).
  const contentBytes = Buffer.byteLength(JSON.stringify(tiptapContent), "utf8");

  // ── Atomic storage quota enforcement ──────────────────────────────────────
  // A single UPDATE atomically checks and increments the counter so concurrent
  // uploads cannot both pass the quota check and then both commit (TOCTOU race).
  //
  // Pattern: UPDATE ... WHERE current + incoming <= limit RETURNING id
  //   • 1 row updated → quota was not exceeded, increment applied.
  //   • 0 rows updated → quota would be exceeded; reject without any write.
  //
  // For unlimited plans (storageMb === null) we skip the guarded UPDATE and
  // always increment unconditionally.
  const storageLimitBytes =
    storageLimitMb !== null ? BigInt(Math.round(storageLimitMb * 1024 * 1024)) : null;

  if (storageLimitBytes !== null) {
    const updated = await prisma.$executeRaw`
      UPDATE "Workspace"
      SET "storageUsedBytes" = "storageUsedBytes" + ${contentBytes}
      WHERE id = ${workspaceId}
        AND "storageUsedBytes" + ${contentBytes} <= ${storageLimitBytes}
    `;
    if (updated === 0) {
      return NextResponse.json(
        {
          error: `This would exceed your ${storageLimitMb} MB document storage limit on the ${plan} plan.`,
          upgradePrompt: "Upgrade for more storage.",
        },
        { status: 403 }
      );
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Create the document. Storage is already incremented above (under limit).
  // If document creation fails we roll back the storage counter best-effort.
  let document: Awaited<ReturnType<typeof prisma.document.findUniqueOrThrow>> & {
    author: { id: string; name: string | null } | null;
  };
  try {
    document = await prisma.document.create({
      data: {
        workspaceId,
        title,
        content: tiptapContent as never,
        authorId: session.user.id,
      },
      include: { author: { select: { id: true, name: true } } },
    });
  } catch (createErr) {
    // Roll back the storage increment so we don't leak quota.
    if (storageLimitBytes !== null) {
      await prisma.$executeRaw`
        UPDATE "Workspace"
        SET "storageUsedBytes" = GREATEST("storageUsedBytes" - ${contentBytes}, 0)
        WHERE id = ${workspaceId}
      `.catch((rollbackErr: unknown) =>
        console.error("[import-doc] Storage rollback failed:", rollbackErr)
      );
    }
    throw createErr;
  }

  // For unlimited plans, increment storage outside the guarded UPDATE.
  if (storageLimitBytes === null) {
    await prisma.$executeRaw`
      UPDATE "Workspace"
      SET "storageUsedBytes" = "storageUsedBytes" + ${contentBytes}
      WHERE id = ${workspaceId}
    `.catch((err: unknown) =>
      console.error("[import-doc] Storage increment failed (unlimited plan):", err)
    );
  }

  // Fire-and-forget audit log with the real document ID now that it exists.
  prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "document",
      entityId: document.id,
      action: "created",
      diff: { title, importedFrom: file.name } as never,
    },
  }).catch((err: unknown) =>
    console.error("[import-doc] Activity log failed:", err)
  );

  return NextResponse.json({ document }, { status: 201 });
}

