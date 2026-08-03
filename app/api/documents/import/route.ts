import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { checkPlanLimit, PLAN_LIMITS } from "@/lib/plan-limits";
import { parse as parseHtml } from "node-html-parser";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize HTML from mammoth using an allowlist of safe tags and attributes.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "pre", "code", "blockquote", "strong", "em", "b", "i", "br"],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
};

function sanitize(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/** Decode common HTML entities in a plain-text string. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}

/** Convert a markdown / plain-text string into a Tiptap ProseMirror JSON doc. */
function textToTiptap(raw: string): object {
  const lines = raw.split(/\r?\n/);
  const content: object[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const h3 = trimmed.match(/^###\s+(.+)/);
    const h2 = trimmed.match(/^##\s+(.+)/);
    const h1 = trimmed.match(/^#\s+(.+)/);

    if (h3) {
      content.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: h3[1] }] });
    } else if (h2) {
      content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: h2[1] }] });
    } else if (h1) {
      content.push({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: h1[1] }] });
    } else if (trimmed === "") {
      content.push({ type: "paragraph" });
    } else {
      content.push({ type: "paragraph", content: [{ type: "text", text: trimmed }] });
    }
  }

  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/**
 * Convert HTML produced by mammoth into a Tiptap ProseMirror JSON doc.
 * Uses node-html-parser for proper DOM traversal instead of regex, avoiding
 * potential infinite loops on nested / malformed HTML.
 */
function htmlToTiptap(rawHtml: string): object {
  // Sanitize first — eliminate any non-allowlisted tags/attributes
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

  // 10 MB limit — check early before any DB work
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be smaller than 10 MB." }, { status: 413 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = ["txt", "md", "docx"];
  if (!allowed.includes(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a .txt, .md, or .docx file." },
      { status: 415 }
    );
  }

  // Verify file magic bytes for DOCX — extension alone can be spoofed
  if (ext === "docx") {
    const magicBuffer = await file.slice(0, 4).arrayBuffer();
    const magic = new Uint8Array(magicBuffer);
    const isZip = magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04;
    if (!isZip) {
      return NextResponse.json(
        { error: "File does not appear to be a valid .docx file." },
        { status: 415 }
      );
    }
  }

  // Run membership + workspace fetch in parallel
  const [member, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, plan: true },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // ── Plan limit checks ──────────────────────────────────────────────────────
  const docCount = await prisma.document.count({ where: { workspaceId } });
  const countCheck = checkPlanLimit(
    { plan: workspace.plan, aiCreditsUsed: docCount },
    "create_document"
  );
  if (!countCheck.allowed) {
    return NextResponse.json(
      { error: countCheck.reason, upgradePrompt: countCheck.upgradePrompt },
      { status: 403 }
    );
  }

  // Storage check using pre-computed byte counter + raw file size as proxy.
  // Uses $queryRaw so it works before and after `prisma generate` picks up
  // the storageUsedBytes column.
  const storageLimitMb = PLAN_LIMITS[workspace.plan].storageMb;
  if (storageLimitMb !== -1) {
    const incomingMb = file.size / (1024 * 1024);
    const [{ storageUsedBytes }] = await prisma.$queryRaw<[{ storageUsedBytes: bigint }]>`
      SELECT "storageUsedBytes" FROM "Workspace" WHERE id = ${workspaceId}
    `;
    const currentMb = Number(storageUsedBytes ?? 0) / (1024 * 1024);
    if (currentMb + incomingMb > storageLimitMb) {
      return NextResponse.json(
        {
          error: `This would exceed your ${storageLimitMb} MB document storage limit on the ${workspace.plan} plan.`,
          upgradePrompt: "Upgrade for more storage.",
        },
        { status: 403 }
      );
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const title = file.name.replace(/\.[^/.]+$/, "").trim() || "Imported document";
  let tiptapContent: object;

  try {
    if (ext === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.convertToHtml({ buffer });
      tiptapContent = htmlToTiptap(result.value);
    } else {
      const raw = await file.text();
      tiptapContent = textToTiptap(raw);
    }
  } catch (err) {
    console.error("[import-doc] parse error", err);
    return NextResponse.json({ error: "Failed to parse the document." }, { status: 422 });
  }

  const contentBytes = Buffer.byteLength(JSON.stringify(tiptapContent), "utf8");

  const [document] = await prisma.$transaction([
    prisma.document.create({
      data: {
        workspaceId,
        title,
        content: tiptapContent as never,
        authorId: session.user.id,
      },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        entityType: "document",
        entityId: "pending",
        action: "created",
        diff: { title, importedFrom: file.name } as never,
      },
    }),
  ]);

  // Increment storage counter via raw SQL — avoids Prisma client type mismatch
  // before `prisma generate` has been re-run after adding storageUsedBytes.
  await prisma.$executeRaw`
    UPDATE "Workspace"
    SET "storageUsedBytes" = "storageUsedBytes" + ${contentBytes}
    WHERE id = ${workspaceId}
  `;

  return NextResponse.json({ document }, { status: 201 });
}
