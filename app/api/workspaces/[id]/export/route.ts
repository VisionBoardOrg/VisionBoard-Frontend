/**
 * GET /api/workspaces/[id]/export
 *
 * Returns a full portable JSON export of the workspace's content:
 * goals, milestones, tasks, documents, board items, and members.
 *
 * Only workspace members can export. The response is a downloadable JSON file.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workspaceId } = await params;

  // Verify membership and enforce role restriction.
  // SECURITY (HIGH-6): Export dumps all document content and every member's
  // email address. Restrict to admin/owner to prevent any low-privileged member
  // (e.g. someone who joined via an open invite link) from bulk-exporting PII
  // and intellectual property.
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    include: { workspace: { select: { name: true, slug: true, createdAt: true, owner: { select: { id: true, plan: true } } } } },
  });

  if (!member) {
    return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 403 });
  }

  const isOwner = member.workspace.owner.id === session.user.id;
  const isAdmin = member.role === "admin";
  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: "Only workspace admins and owners can export workspace data." },
      { status: 403 }
    );
  }

  // Fetch all workspace content in parallel
  const [goals, documents, boardItems, members] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId },
      include: {
        milestones: {
          include: {
            tasks: {
              select: {
                id:          true,
                title:       true,
                description: true,
                status:      true,
                priority:    true,
                storyPoints: true,
                dueDate:     true,
                order:       true,
                createdAt:   true,
                updatedAt:   true,
                assignee:    { select: { id: true, name: true, email: true } },
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.document.findMany({
      where:   { workspaceId },
      select: {
        id:                true,
        title:             true,
        content:           true,
        linkedGoalId:      true,
        linkedMilestoneId: true,
        linkedTaskId:      true,
        createdAt:         true,
        updatedAt:         true,
        author:            { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.boardItem.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workspaceMember.findMany({
      where:   { workspaceId },
      select: {
        role:     true,
        joinedAt: true,
        user:     { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const exportPayload = {
    _meta: {
      exportedAt:  new Date().toISOString(),
      exportedBy:  session.user.id,
      workspaceId,
      format:      "visionboard-workspace-export-v1",
      notice:
        "This file contains the full content of your VisionBoard workspace. " +
        "Import functionality is not yet available — this export is for data portability and backup.",
    },
    workspace: {
      id:        workspaceId,
      name:      member.workspace.name,
      slug:      member.workspace.slug,
      plan:      member.workspace.owner.plan ?? "free",
      createdAt: member.workspace.createdAt,
    },
    members,
    goals,
    documents,
    boardItems,
  };

  // Minified payload — pretty-printing roughly doubles the response size for
  // large workspaces; the file is machine-consumed, so no indentation needed.
  const json = JSON.stringify(exportPayload);
  const safeName = member.workspace.slug.replace(/[^a-z0-9-]/g, "-");
  const filename = `visionboard-${safeName}-${new Date().toISOString().split("T")[0]}.json`;

  return new NextResponse(json, {
    headers: {
      "Content-Type":        "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
