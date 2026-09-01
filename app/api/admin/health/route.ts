import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

const START_TIME = Date.now();

async function pingDatabase(): Promise<{ latencyMs: number; status: "healthy" | "degraded" | "down" }> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    return {
      latencyMs,
      status: latencyMs < 200 ? "healthy" : latencyMs < 1000 ? "degraded" : "down",
    };
  } catch {
    return { latencyMs: -1, status: "down" };
  }
}

async function pingVectorStore(): Promise<{ status: "healthy" | "degraded" | "down"; count?: number }> {
  try {
    const count = await prisma.workspaceEmbedding.count();
    return { status: "healthy", count };
  } catch {
    return { status: "down" };
  }
}

function getMemoryUsage(): { heapUsedMb: number; heapTotalMb: number; rssМb: number } {
  try {
    const m = process.memoryUsage();
    return {
      heapUsedMb: Math.round(m.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(m.heapTotal / 1024 / 1024),
      rssМb: Math.round(m.rss / 1024 / 1024),
    };
  } catch {
    return { heapUsedMb: -1, heapTotalMb: -1, rssМb: -1 };
  }
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const uptimeSeconds = Math.round((Date.now() - START_TIME) / 1000);
    const [db, vectorStore] = await Promise.all([pingDatabase(), pingVectorStore()]);
    const memory = getMemoryUsage();

    const overallStatus =
      db.status === "down"
        ? "down"
        : db.status === "degraded"
        ? "degraded"
        : "healthy";

    return NextResponse.json({
      status: overallStatus,
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      services: {
        database: db,
        vectorStore,
        nodeRuntime: {
          status: "healthy",
          version: process.version,
          memory,
        },
      },
    });
  } catch (error) {
    console.error("[api/admin/health]", error);
    return NextResponse.json(
      { status: "down", error: "Health check failed" },
      { status: 500 }
    );
  }
}
