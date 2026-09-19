import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAiMetrics } from "@/lib/admin/admin-data";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10)));

  try {
    const data = await getAiMetrics(days);
    if (!data) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/admin/ai-metrics]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
