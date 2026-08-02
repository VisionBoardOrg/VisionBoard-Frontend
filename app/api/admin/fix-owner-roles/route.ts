import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/fix-owner-roles
 *
 * One-time migration: ensures every workspace owner has role="admin"
 * in their WorkspaceMember record. Safe to call multiple times.
 * Only callable by the authenticated user — fixes their own memberships only.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all workspaces owned by this user where their member role is NOT admin
  const wrongMemberships = await prisma.workspaceMember.findMany({
    where: {
      userId: session.user.id,
      workspace: { ownerId: session.user.id },
      NOT: { role: "admin" },
    },
    select: { id: true, workspaceId: true, role: true },
  });

  if (wrongMemberships.length === 0) {
    return NextResponse.json({ fixed: 0, message: "All owner roles are already correct." });
  }

  // Fix them all
  await prisma.workspaceMember.updateMany({
    where: {
      id: { in: wrongMemberships.map((m) => m.id) },
    },
    data: { role: "admin" },
  });

  return NextResponse.json({
    fixed: wrongMemberships.length,
    message: `Fixed ${wrongMemberships.length} workspace(s): owner role set to admin.`,
    workspaces: wrongMemberships.map((m) => m.workspaceId),
  });
}
