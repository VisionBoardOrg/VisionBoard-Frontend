import { NextResponse } from "next/server";
import { getWaitlistByEmail, getTotalWaitlistCount, bumpPositionByShare } from "@/lib/waitlist/store";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Generate a short-lived HMAC proof token so that share bumps can only be
 * applied by someone who holds the token that was emailed to the user.
 *
 * Token format: "<email>:<expiresAt>:<hmac>"
 * - expiresAt: Unix seconds (1 hour window)
 * - hmac: HMAC-SHA256 of "<email>:<expiresAt>" keyed on AUTH_SECRET
 *
 * This stops an attacker who only knows the victim's email from stealing their
 * share boost quota — they would also need the token from the victim's email.
 */
const SHARE_TOKEN_TTL_SECONDS = 3600;

function getShareSecret(): string {
  // Reuse AUTH_SECRET; it is already required and 32+ chars
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function generateShareToken(email: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SHARE_TOKEN_TTL_SECONDS;
  const payload = `${email.toLowerCase()}:${expiresAt}`;
  const mac = createHmac("sha256", getShareSecret()).update(payload).digest("hex");
  return `${expiresAt}:${mac}`;
}

function verifyShareToken(email: string, token: string): boolean {
  try {
    const parts = token.split(":");
    if (parts.length !== 2) return false;
    const [expiresAtStr, mac] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return false;

    const payload = `${email.toLowerCase()}:${expiresAtStr}`;
    const expected = createHmac("sha256", getShareSecret()).update(payload).digest("hex");

    // Constant-time comparison to prevent timing attacks
    const macBuf = Buffer.from(mac, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (macBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(macBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const action = searchParams.get("action");
    const shareType = searchParams.get("shareType") as "linkedin" | "twitter" | "email" | null;
    const shareToken = searchParams.get("shareToken");

    if (!email) {
      const totalWaitlist = await getTotalWaitlistCount();
      return NextResponse.json({
        success: true,
        data: { totalWaitlist },
      });
    }

    // Handle position bump action — requires a valid HMAC share token
    if (action === "share" && shareType) {
      if (!shareToken || !verifyShareToken(email, shareToken)) {
        return NextResponse.json(
          { success: false, message: "Invalid or expired share token." },
          { status: 403 }
        );
      }

      const VALID_SHARE_TYPES = new Set(["linkedin", "twitter", "email"]);
      if (!VALID_SHARE_TYPES.has(shareType)) {
        return NextResponse.json(
          { success: false, message: "Invalid shareType." },
          { status: 400 }
        );
      }

      const updated = await bumpPositionByShare(email, shareType);
      if (updated) {
        const appOrigin = process.env.NEXTAUTH_URL || process.env.APP_URL || new URL(request.url).origin;
        return NextResponse.json({
          success: true,
          data: {
            position: updated.position,
            referralCount: updated.referralCount,
            referralLink: `${appOrigin}/?ref=${updated.referralCode}`,
            bumped: true,
          },
        });
      }
    }

    const record = await getWaitlistByEmail(email);

    if (!record) {
      return NextResponse.json(
        { success: false, message: "Waitlist record not found" },
        { status: 404 }
      );
    }

    const totalWaitlist = await getTotalWaitlistCount();
    const appOrigin = process.env.NEXTAUTH_URL || process.env.APP_URL || new URL(request.url).origin;
    const referralLink = `${appOrigin}/?ref=${record.referralCode}`;

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        email: record.email,
        fullName: record.fullName,
        position: record.position,
        totalWaitlist,
        referralCode: record.referralCode,
        referralLink,
        referralCount: record.referralCount,
        status: record.status,
        // inviteToken is intentionally OMITTED — it is delivered via email only.
        // Returning it here would allow anyone who knows the user's email to
        // steal their invite token and register before them.
      },
    });
  } catch (err) {
    console.error("[api/waitlist/status] GET handler error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error", data: { totalWaitlist: 0 } },
      { status: 500 }
    );
  }
}
