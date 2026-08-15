import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  let userIdToRestore: string | null = null;

  if (session?.user?.id) {
    userIdToRestore = session.user.id;
  } else if (parsed.success && parsed.data.email) {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (user) {
      userIdToRestore = user.id;
    }
  }

  if (!userIdToRestore) {
    return NextResponse.json(
      { error: "Invalid request. Please provide an email address or log in to restore your account." },
      { status: 400 }
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: userIdToRestore },
    data: { scheduledDeletion: null },
    select: { id: true, email: true },
  });

  return NextResponse.json({
    success: true,
    message: `Account deletion cancelled successfully for ${updatedUser.email}. Your account has been reactivated.`,
  });
}
