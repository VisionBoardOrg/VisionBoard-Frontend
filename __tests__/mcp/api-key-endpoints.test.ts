// Feature: web-mcp-integration — API key management endpoint unit tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

const mockCreate = vi.hoisted(() => vi.fn());
const mockCount = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      create: mockCreate,
      count: mockCount,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
  },
}));

import { GET, POST } from "@/app/api/user/api-keys/route";
import { DELETE } from "@/app/api/user/api-keys/[id]/route";

const SESSION = { user: { id: "user1" } };

describe("18.2: API key management endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
  });

  // ── POST ──────────────────────────────────────────────────────────────────

  it("POST: creates key and returns 201 with rawKey", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({
      id: "k1",
      name: "My Agent",
      keyPrefix: "vsn_live_",
      createdAt: new Date().toISOString(),
    });

    const req = new NextRequest("http://localhost/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Agent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("rawKey");
    expect(typeof body.rawKey).toBe("string");
    expect(body.rawKey as string).toMatch(/^vsn_live_[0-9a-f]{64}$/);
  });

  it("POST: 400 for empty name", async () => {
    const req = new NextRequest("http://localhost/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("POST: 403 when 10 active keys exist", async () => {
    mockCount.mockResolvedValue(10);
    const req = new NextRequest("http://localhost/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Eleventh Key" }),
    });
    expect((await POST(req)).status).toBe(403);
  });

  it("POST: 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "key" }),
    });
    expect((await POST(req)).status).toBe(401);
  });

  // ── GET ──────────────────────────────────────────────────────────────────

  it("GET: 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("GET: returns keys without rawKey or keyHash", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "k1",
        name: "Agent",
        keyPrefix: "vsn_live_",
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>[];
    expect(body[0]).not.toHaveProperty("rawKey");
    expect(body[0]).not.toHaveProperty("keyHash");
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  it("DELETE: 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/user/api-keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "k1" }) });
    expect(res.status).toBe(401);
  });

  it("DELETE: 404 when key not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/user/api-keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "k1" }) });
    expect(res.status).toBe(404);
  });

  it("DELETE: 409 when key already revoked", async () => {
    mockFindFirst.mockResolvedValue({ id: "k1", userId: "user1", revokedAt: new Date() });
    const req = new NextRequest("http://localhost/api/user/api-keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "k1" }) });
    expect(res.status).toBe(409);
  });

  it("DELETE: 200 and revokes key", async () => {
    mockFindFirst.mockResolvedValue({ id: "k1", userId: "user1", revokedAt: null });
    mockUpdate.mockResolvedValue({});
    const req = new NextRequest("http://localhost/api/user/api-keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "k1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
