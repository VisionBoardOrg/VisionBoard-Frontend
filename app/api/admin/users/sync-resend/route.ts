import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { syncAllUsersFromDatabase } from "@/lib/resend-sync";

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const summary = await syncAllUsersFromDatabase();
    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/admin/users/sync-resend]", error);
    return NextResponse.json(
      { error: "Failed to sync users to Resend", details: message },
      { status: 500 }
    );
  }
}
