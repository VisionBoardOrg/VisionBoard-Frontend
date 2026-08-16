import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      plan: true,
      aiCreditsUsed: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          joinedAt: true,
          workspace: { select: { id: true, name: true, slug: true, owner: { select: { plan: true } } } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ user });
}
