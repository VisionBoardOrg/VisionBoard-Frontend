import { NextResponse } from "next/server";
import {
  getAllWaitlistEntries,
  getTotalWaitlistCount,
  deleteWaitlistEntries,
  normalizePositions,
} from "@/lib/waitlist/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const roleFilter = searchParams.get("role");

  let entries = await getAllWaitlistEntries();

  if (statusFilter && statusFilter !== "ALL") {
    entries = entries.filter((e) => e.status === statusFilter);
  }

  if (roleFilter && roleFilter !== "ALL") {
    entries = entries.filter((e) => e.role === roleFilter);
  }

  return NextResponse.json({
    success: true,
    data: {
      total: await getTotalWaitlistCount(),
      entries,
    },
  });
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const ids: string[] = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: "No IDs provided" },
        { status: 400 }
      );
    }

    const deletedCount = await deleteWaitlistEntries(ids);

    return NextResponse.json({
      success: true,
      data: { deletedCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete entries";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Utility endpoint: POST /api/admin/waitlist?action=normalize
  // Reindexes all positions to remove gaps (useful after manual DB edits).
  const { searchParams } = new URL(request.url);
  if (searchParams.get("action") === "normalize") {
    await normalizePositions();
    return NextResponse.json({ success: true, message: "Positions normalized" });
  }
  return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
}
