import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminOverview } from "@/lib/admin/admin-data";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const data = await getAdminOverview();
    if (!data) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/admin/overview]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
