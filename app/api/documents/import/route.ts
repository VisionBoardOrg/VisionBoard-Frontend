import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import mammoth from "mammoth";
import { checkPlanLimit, checkStorageLimit, estimateDocStorageMb } from "@/lib/plan-limits";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Convert a markdown / plain-text string into a Tiptap ProseMirror JSON doc. */
function textToTiptap(raw: string): object {
  const lines = raw.split(/\r?\n/);
  const content: object[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // ATX headings (#, ##, ###)
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
      // blank line → empty paragraph (preserve spacing)
      content.push({ type: "paragraph" });
    } else {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: trimmed }],
      });
    }
  }

  if (content.length === 0) content.push({ type: "paragraph" });

  return { type: "doc", content };
}

/** Convert HTML produced by mammoth into a Tiptap ProseMirror JSON doc.
 *  We do a lightweight parse — enough to handle headings, paragraphs, lists,
 *  bold, italic and code that mammoth emits. */
function htmlToTiptap(html: string): object {
  const content: object[] = [];

  // Strip <html>/<body> wrappers if present
  const body = html.replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "");

  // Split into top-level block tags
  const blockRe = /<(h[1-6]|p|ul|ol|pre|blockquote)([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(body)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[0];

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const text = stripTags(inner);
      if (text) content.push({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
    } else if (tag === "ul" || tag === "ol") {
      const listType = tag === "ul" ? "bulletList" : "orderedList";
      const items: object[] = [];
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(inner)) !== null) {
        const liText = stripTags(li[1]);
        if (liText) {
          items.push({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: liText }] }],
          });
        }
      }
      if (items.length) content.push({ type: listType, content: items });
    } else if (tag === "pre") {
      const text = stripTags(inner);
      if (text) content.push({ type: "codeBlock", content: [{ type: "text", text }] });
    } else {
      // paragraph / blockquote — keep inline marks
      const inlineNodes = parseInline(inner);
      if (inlineNodes.length) content.push({ type: "paragraph", content: inlineNodes });
    }
  }

  // Fallback: no recognised blocks → treat whole thing as plain text paragraphs
  if (content.length === 0) {
    return textToTiptap(stripTags(body));
  }

  return { type: "doc", content };
}

/** Parse inline HTML marks (bold, italic, code) inside a block. */
function parseInline(html: string): object[] {
  const text = stripTags(html, true);
  if (!text.trim()) return [];
  return [{ type: "text", text }];
}

/** Strip all HTML tags, optionally collapsing whitespace. */
function stripTags(html: string, collapse = false): string {
  let result = html.replace(/<[^>]+>/g, "");
  result = result.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"');
  if (collapse) result = result.replace(/\s+/g, " ").trim();
  return result;
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

  // Verify workspace membership
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Plan limit checks ──────────────────────────────────────────────────────
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

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

  // Storage check — raw file size as a fast proxy before parsing
  const incomingMb = file.size / (1024 * 1024);
  const existingDocs = await prisma.document.findMany({
    where: { workspaceId },
    select: { content: true },
  });
  const currentMb = estimateDocStorageMb(existingDocs.map((d) => d.content));
  const storageCheck = checkStorageLimit(workspace.plan, currentMb, incomingMb);
  if (!storageCheck.allowed) {
    return NextResponse.json(
      { error: storageCheck.reason, upgradePrompt: storageCheck.upgradePrompt },
      { status: 403 }
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = ["txt", "md", "docx"];
  if (!allowed.includes(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a .txt, .md, or .docx file." },
      { status: 415 }
    );
  }

  // 10 MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be smaller than 10 MB." }, { status: 413 });
  }

  let tiptapContent: object;
  // Derive title from filename (strip extension)
  const title = file.name.replace(/\.[^/.]+$/, "").trim() || "Imported document";

  try {
    if (ext === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.convertToHtml({ buffer });
      tiptapContent = htmlToTiptap(result.value);
    } else {
      // txt or md
      const raw = await file.text();
      tiptapContent = textToTiptap(raw);
    }
  } catch (err) {
    console.error("[import-doc] parse error", err);
    return NextResponse.json({ error: "Failed to parse the document." }, { status: 422 });
  }

  const document = await prisma.document.create({
    data: {
      workspaceId,
      title,
      content: tiptapContent as never,
      authorId: session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "document",
      entityId: document.id,
      action: "created",
      diff: { title, importedFrom: file.name } as never,
    },
  });

  return NextResponse.json({ document }, { status: 201 });
}
