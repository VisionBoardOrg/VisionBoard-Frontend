import { NextRequest, NextResponse } from "next/server";
import { waitlistJoinSchema } from "@/lib/validations/waitlist-schemas";
import { joinWaitlist, getTotalWaitlistCount } from "@/lib/waitlist/store";
import { sendWaitlistEmail } from "@/lib/waitlist/email";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, "waitlist-join", {
    windowMs: 15 * 60 * 1000,
    max: 5,
  });

  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const body = await request.json();
    const validated = waitlistJoinSchema.parse(body);

    const result = await joinWaitlist(validated);
    const totalCount = await getTotalWaitlistCount();

    const origin = new URL(request.url).origin;
    const referralLink = `${origin}/?ref=${result.record.referralCode}`;

    if (result.isNew) {
      try {
        await sendWaitlistEmail(
          result.record.email,
          result.record.fullName,
          result.record.position,
          referralLink
        );
      } catch (emailErr) {
        console.error("Error in waitlist email dispatch:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.record.id,
        email: result.record.email,
        fullName: result.record.fullName,
        position: result.record.position,
        totalWaitlist: totalCount,
        referralCode: result.record.referralCode,
        referralLink,
        referralCount: result.record.referralCount,
        status: result.record.status,
        // inviteToken is intentionally NOT returned here — it is delivered via email only
        isNew: result.isNew,
        vipBypass: result.vipBypass,
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "ZodError") {
      return NextResponse.json(
        { success: false, message: "Validation error", errors: (error as unknown as { errors: unknown }).errors },
        { status: 400 }
      );
    }
    console.error("[api/waitlist/join]", error);
    return NextResponse.json(
      { success: false, message: "Failed to join waitlist" },
      { status: 500 }
    );
  }
}
