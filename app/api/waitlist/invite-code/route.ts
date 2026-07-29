import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { vipCodeSchema } from "@/lib/validations/waitlist-schemas";
import { validateVipCode } from "@/lib/waitlist/store";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, "vip-invite-code", {
    windowMs: 15 * 60 * 1000,
    max: 10,
  });

  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const body = await request.json();
    const validated = vipCodeSchema.parse(body);

    const isValid = validateVipCode(validated.code);

    if (!isValid) {
      return NextResponse.json(
        { success: false, message: "Invalid VIP access code" },
        { status: 400 }
      );
    }

    // Use cryptographically secure random token
    const inviteToken = `vip_pass_${randomBytes(16).toString("hex")}`;

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        inviteToken,
        redirectUrl: `/signup?inviteToken=${inviteToken}`,
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "ZodError") {
      return NextResponse.json(
        { success: false, message: "Validation error", errors: (error as unknown as { errors: unknown }).errors },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to validate VIP code";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

