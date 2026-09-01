import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z
    .string({ required_error: "name is required" })
    .min(1, "name must be at least 1 character")
    .max(64, "name must be at most 64 characters"),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name } = parsed.data;
  const now = new Date();

  // Count active (non-revoked, non-expired) keys for this user
  const activeCount = await prisma.apiKey.count({
    where: {
      userId: session.user.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  if (activeCount >= 10) {
    return NextResponse.json(
      { error: "API key limit reached (max 10 active keys)" },
      { status: 403 }
    );
  }

  // Generate raw key: "vsn_live_" (9 chars) + 64 hex chars = 73 chars total
  const raw = "vsn_live_" + randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const keyPrefix = raw.slice(0, 9); // "vsn_live_"

  const apiKey = await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      name,
      keyPrefix,
      keyHash,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
    },
  });

  // rawKey is returned ONLY here — never again
  return NextResponse.json(
    { ...apiKey, rawKey: raw },
    { status: 201 }
  );
}
