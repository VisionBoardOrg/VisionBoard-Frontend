import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchWorkspaceKnowledge } from "@/lib/ai/semantic-search";
import { z } from "zod";

const schema = z.object({
  workspaceId: z.string(),
  query: z.string().min(2).max(500),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { workspaceId, query } = parsed.data;

  // Verify the caller is a member of the requested workspace
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chunks = await searchWorkspaceKnowledge(workspaceId, query, {
    limit: 8,
    minSimilarity: 0.15,
  });

  const results = chunks.map((c) => ({
    title: c.title,
    snippet:
      c.content.slice(0, 200) + (c.content.length > 200 ? "…" : ""),
    entityType: c.entityType,
    entityId: c.entityId,
    url: c.url,
  }));

  return NextResponse.json({ results });
}
