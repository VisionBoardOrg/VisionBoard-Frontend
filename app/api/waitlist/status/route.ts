import { NextResponse } from "next/server";
import { getWaitlistByEmail, getTotalWaitlistCount, bumpPositionByShare } from "@/lib/waitlist/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const action = searchParams.get("action");
  const shareType = searchParams.get("shareType") as "linkedin" | "twitter" | "email" | null;

  if (!email) {
    const totalWaitlist = await getTotalWaitlistCount();
    return NextResponse.json({
      success: true,
      data: {
        totalWaitlist,
      },
    });
  }

  // Handle position bump action
  if (action === "share" && shareType) {
    const updated = await bumpPositionByShare(email, shareType);
    if (updated) {
      const origin = new URL(request.url).origin;
      return NextResponse.json({
        success: true,
        data: {
          position: updated.position,
          referralCount: updated.referralCount,
          referralLink: `${origin}/?ref=${updated.referralCode}`,
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
  const origin = new URL(request.url).origin;
  const referralLink = `${origin}/?ref=${record.referralCode}`;

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
      inviteToken: record.inviteToken,
    },
  });
}
