import { NextResponse } from "next/server";
import { dispatchInvites } from "@/lib/waitlist/store";
import { sendInviteEmail } from "@/lib/waitlist/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: "Please provide an array of candidate IDs to invite" },
        { status: 400 }
      );
    }

    const updatedRecords = await dispatchInvites(ids);

    // Derive the origin for the invite link (e.g. https://visionboard.io)
    const origin = new URL(request.url).origin;

    // Send invite emails to all newly approved candidates
    // Failures are logged but don't fail the overall response
    const emailResults = await Promise.allSettled(
      updatedRecords.map((record) =>
        sendInviteEmail(record.email, record.fullName, record.inviteToken!, origin)
      )
    );

    const emailsSent = emailResults.filter((r) => r.status === "fulfilled" && r.value).length;
    const emailsFailed = emailResults.length - emailsSent;

    if (emailsFailed > 0) {
      console.error(
        `[dispatch-invites] ${emailsFailed} of ${emailResults.length} invite emails failed to send.`
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        invitedCount: updatedRecords.length,
        emailsSent,
        emailsFailed,
        updatedRecords,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to dispatch invitations";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

