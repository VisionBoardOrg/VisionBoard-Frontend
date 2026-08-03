import { NextResponse } from "next/server";
import {
  getAllWaitlistEntries,
  deleteWaitlistEntries,
  normalizePositions,
} from "@/lib/waitlist/store";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import { cookies } from "next/headers";

/** Shared admin auth check — must pass on every handler in this route. */
async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get("admin_session")?.value;
  if (!(await verifyAdminSession(adminCookie))) {
    return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const roleFilter   = searchParams.get("role");

  // Pagination — defaults: page 1, 100 items, max 500
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",   10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
  const skip  = (page - 1) * limit;

  let entries = await getAllWaitlistEntries();

  if (statusFilter && statusFilter !== "ALL") {
    entries = entries.filter((e) => e.status === statusFilter);
  }
  if (roleFilter && roleFilter !== "ALL") {
    entries = entries.filter((e) => e.role === roleFilter);
  }

  const total = entries.length;
  const paginated = entries.slice(skip, skip + limit);

  return NextResponse.json({
    success: true,
    data: {
      total,
      page,
      limit,
      entries: paginated,
    },
  });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

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
    console.error("[api/admin/waitlist DELETE]", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete entries" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  // Utility endpoint: POST /api/admin/waitlist?action=normalize
  // Reindexes all positions to remove gaps (useful after manual DB edits).
  const { searchParams } = new URL(request.url);
  if (searchParams.get("action") === "normalize") {
    await normalizePositions();
    return NextResponse.json({ success: true, message: "Positions normalized" });
  }
  return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
}
