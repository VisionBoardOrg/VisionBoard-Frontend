import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/notification-preferences";
import { z } from "zod";

const updateSchema = z.object({
  emailEnabled: z.boolean().optional(),
  tasks: z.boolean().optional(),
  mentions: z.boolean().optional(),
  comments: z.boolean().optional(),
  goalsMilestones: z.boolean().optional(),
  quotasBilling: z.boolean().optional(),
  systemAlerts: z.boolean().optional(),
  typeOverrides: z.record(z.boolean()).nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preferences = await getUserNotificationPreferences(session.user.id);
    return NextResponse.json({ preferences });
  } catch (err) {
    console.error("[GET /api/user/notification-preferences] Error:", err);
    return NextResponse.json(
      { error: "Failed to load notification preferences" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await updateUserNotificationPreferences(
      session.user.id,
      parsed.data
    );

    return NextResponse.json({ success: true, preferences: updated });
  } catch (err) {
    console.error("[PATCH /api/user/notification-preferences] Error:", err);
    return NextResponse.json(
      { error: "Failed to update notification preferences" },
      { status: 500 }
    );
  }
}
