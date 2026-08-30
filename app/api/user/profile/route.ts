/**
 * PATCH /api/user/profile
 *
 * Allows authenticated users to update their own name, email, and profile image URL.
 * Email changes require the new address to not already be in use.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name:  z.string().min(1).max(100).trim().optional(),
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(255)).optional(),
  image: z.string().url().max(500).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { name, email, image } = parsed.data;

  // Nothing to update
  if (name === undefined && email === undefined && image === undefined) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // If changing email, ensure it is not already taken by another user
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json(
        { error: "That email address is already associated with another account." },
        { status: 409 },
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (name  !== undefined) updateData.name  = name;
  if (email !== undefined) updateData.email = email;
  if (image !== undefined) updateData.image = image;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { id: true, name: true, email: true, image: true },
  });

  return NextResponse.json({ user: updated });
}
