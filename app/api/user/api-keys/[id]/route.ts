import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Look up the key scoped to the authenticated user — prevents enumeration
    // of other users' key IDs by returning 404 in both "not found" and
    // "belongs to someone else" cases.
    const key = await prisma.apiKey.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!key) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    // Key is already revoked — do not modify it again
    if (key.revokedAt !== null) {
      return NextResponse.json({ error: "API key is already revoked" }, { status: 409 });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[api/user/api-keys/[id] DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
