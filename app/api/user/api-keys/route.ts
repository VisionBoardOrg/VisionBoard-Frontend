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

type ApiKeyListRow = {
  id: string;
  name: string;
  keyPrefix: string;
  keySuffix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

function isUndefinedColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "P2022") return true;
  // Postgres native code 42703 (Prisma error wrappers vary by version)
  const msg = typeof e.message === "string" ? e.message : "";
  return /(42703|undefined_column|column .* does not exist)/i.test(msg);
}

async function listKeysForUser(userId: string): Promise<ApiKeyListRow[]> {
  try {
    const rows = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        keySuffix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      keySuffix: r.keySuffix ?? "",
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    }));
  } catch (err: unknown) {
    if (!isUndefinedColumnError(err)) throw err;
    // Column not yet added to this DB — fall back to raw SQL.
    const fallback = (await prisma.$queryRawUnsafe(
      `
      SELECT id, name, "keyPrefix", "createdAt", "lastUsedAt", "expiresAt", "revokedAt"
      FROM "ApiKey"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC;
      `,
      userId
    )) as Array<{
      id: string;
      name: string;
      keyPrefix: string;
      createdAt: Date;
      lastUsedAt: Date | null;
      expiresAt: Date | null;
      revokedAt: Date | null;
    }>;
    return fallback.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      keySuffix: "",
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    }));
  }
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await listKeysForUser(session.user.id);
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

  const raw = "vsn_live_" + randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const keyPrefix = raw.slice(0, 17);
  const keySuffix = raw.slice(-3);

  let createdId: string;
  try {
    const created = await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        name,
        keyPrefix,
        keySuffix,
        keyHash,
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (err: unknown) {
    if (!isUndefinedColumnError(err)) throw err;
    const inserted = (await prisma.$queryRawUnsafe(
      `
      INSERT INTO "ApiKey" (id, "userId", name, "keyPrefix", "keyHash", "createdAt")
      VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id;
      `,
      session.user.id,
      name,
      keyPrefix,
      keyHash
    )) as { id: string }[];
    createdId = inserted[0].id;
  }

  const rows = await listKeysForUser(session.user.id);
  const apiKey = rows.find((r) => r.id === createdId)!;

  return NextResponse.json(
    { ...apiKey, rawKey: raw },
    { status: 201 }
  );
}
