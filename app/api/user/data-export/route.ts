/**
 * GET /api/user/data-export
 *
 * Returns a portable JSON file containing all personal data VisionBoard
 * holds about the authenticated user, fulfilling the GDPR/CCPA right to
 * data access and portability stated in the Privacy Policy (Section 7).
 *
 * The response is streamed as a downloadable JSON attachment.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit: 3 exports per user per 24 hours.
  // GDPR data exports are expensive (3 parallel unbounded queries) and subject
  // to abuse as a DB load vector.  Per-user key prevents one account from
  // exhausting the limit for others.
  const rl = await checkRateLimit(request, `data-export:${userId}`, {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3,
  });
  if (!rl.allowed) return rl.response!;

  // Fetch all personal data in parallel
  const [user, memberships, comments, aiLogs, activityLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        plan: true,
        aiCreditsUsed: true,
        createdAt: true,
        emailVerified: true,
        // Never include hashedPassword in exports
        accounts: {
          select: { provider: true, type: true },
        },
      },
    }),
    prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        joinedAt: true,
        workspace: {
          select: { id: true, name: true, slug: true, createdAt: true, owner: { select: { plan: true } } },
        },
      },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      select: {
        id: true,
        body: true,
        entityType: true,
        goalId: true,
        milestoneId: true,
        taskId: true,
        documentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    // AI logs: usage metadata only — no prompt or response content.
    // modelOutput is stored as a SHA-256 hash in the DB (not raw text),
    // so it is excluded from the export as it carries no user-readable value.
    prisma.aIGenerationLog.findMany({
      where: { userId },
      select: {
        id: true,
        feature: true,
        tokensUsed: true,
        accepted: true,
        createdAt: true,
        workspaceId: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityLog.findMany({
      where: { userId },
      select: { id: true, entityType: true, entityId: true, action: true, createdAt: true, workspaceId: true },
      orderBy: { createdAt: "desc" },
      take: 500, // cap to last 500 entries to keep the file manageable
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const exportPayload = {
    _meta: {
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      notice:
        "This file contains all personal data VisionBoard holds about you. " +
        "Sensitive fields (password hashes, raw AI prompts) are excluded. " +
        "Contact privacy@vision-board.tech with questions.",
    },
    profile: user,
    workspaceMemberships: memberships,
    comments,
    aiUsageLogs: aiLogs,
    activityLogs,
  };

  const json = JSON.stringify(exportPayload, null, 2);
  const filename = `visionboard-data-export-${new Date().toISOString().split("T")[0]}.json`;

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
