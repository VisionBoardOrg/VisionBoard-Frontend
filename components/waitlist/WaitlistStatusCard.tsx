"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Copy,
  Check,
  Mail,
  Sparkles,
  ArrowRight,
  Zap,
  CheckCircle2,
} from "lucide-react";

interface WaitlistStatusData {
  email: string;
  fullName: string;
  position: number;
  totalWaitlist: number;
  referralCode: string;
  referralLink: string;
  referralCount: number;
  status: "PENDING" | "INVITED" | "REGISTERED" | "EXPIRED";
  inviteToken?: string;
}

interface WaitlistStatusCardProps {
  data: WaitlistStatusData;
  onReset?: () => void;
}

export default function WaitlistStatusCard({ data, onReset }: WaitlistStatusCardProps) {
  const [currentPosition, setCurrentPosition] = useState(data.position);
  const referralCount = data.referralCount;
  const [copied, setCopied] = useState(false);
  const [shareBumpMessage, setShareBumpMessage] = useState("");

  const handleCopyLink = () => {
    navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSocialShare = async (platform: "linkedin" | "twitter" | "email") => {
    // Call status endpoint to trigger position bump (+2 spots)
    try {
      const res = await fetch(`/api/waitlist/status?email=${encodeURIComponent(data.email)}&action=share&shareType=${platform}`);
      const json = await res.json();
      if (json.success && json.data) {
        setCurrentPosition(json.data.position);
        setShareBumpMessage("🎉 You jumped 2 spots in line for sharing!");
        setTimeout(() => setShareBumpMessage(""), 4000);
      }
    } catch {}

    const text = encodeURIComponent(
      `I just joined the exclusive early access waitlist for VisionBoard — AI-powered product roadmaps and execution workspace! Jump line with my link:`
    );
    const url = encodeURIComponent(data.referralLink);

    if (platform === "twitter") {
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
    } else if (platform === "linkedin") {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
    } else if (platform === "email") {
      window.location.href = `mailto:?subject=${encodeURIComponent("Join VisionBoard Early Access")}&body=${text}%20${url}`;
    }
  };

  return (
    <div className="w-full max-w-xl bg-white rounded-3xl border border-border shadow-xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Top Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-blue-faint text-blue border border-blue-light px-3 py-1 rounded-full text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Waitlist Status: Active</span>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs font-medium text-slate hover:text-blue transition-colors mr-10"
          >
            Check another email
          </button>
        )}
      </div>

      {/* Invite Granted Banner */}
      {data.status === "INVITED" || data.inviteToken ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-emerald-900">Your VIP Access is Unlocked!</h3>
            <p className="text-xs text-emerald-700 font-medium mt-0.5">
              You have been granted early access to VisionBoard. Complete your registration to launch your workspace.
            </p>
          </div>
          <Link
            href={`/signup?inviteToken=${data.inviteToken || "vip_granted"}`}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold text-xs py-2.5 px-6 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            Launch Workspace Now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        /* Position Highlight Card */
        <div className="bg-linear-to-br from-blue-deep to-blue text-white rounded-2xl p-6 text-center space-y-3 relative overflow-hidden shadow-lg">
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto text-amber-300">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-blue-light font-medium uppercase tracking-wider">Your Position in Line</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-1">
              #{currentPosition} <span className="text-sm font-semibold text-blue-light font-normal">of {data.totalWaitlist.toLocaleString()}</span>
            </h2>
          </div>
        </div>
      )}

      {shareBumpMessage && (
        <div className="bg-blue-faint border border-blue-light text-blue text-xs font-bold rounded-xl p-3 text-center animate-bounce">
          {shareBumpMessage}
        </div>
      )}

      {/* Referral Link & Social Share Loop */}
      <div className="space-y-3 bg-offwhite/60 p-4 rounded-2xl border border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-ink flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            Bump your position in line
          </span>
          <span className="text-slate font-semibold">
            {referralCount} {referralCount === 1 ? "referral" : "referrals"} (+{referralCount * 5} spots)
          </span>
        </div>

        {/* Copy Bar */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={data.referralLink}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-xs font-mono text-slate focus:outline-none"
          />
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 bg-blue text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors shrink-0 shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>

        {/* Social Share Icons */}
        <div className="pt-2 flex items-center justify-between text-xs text-slate">
          <span className="font-medium text-[11px]">Share for +2 instant spots:</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleSocialShare("linkedin")}
              className="flex items-center gap-1 bg-white hover:bg-blue-faint text-[#0A66C2] border border-border px-2.5 py-1.5 rounded-lg font-medium text-[11px] transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
              LinkedIn
            </button>
            <button
              onClick={() => handleSocialShare("twitter")}
              className="flex items-center gap-1 bg-white hover:bg-slate-100 text-ink border border-border px-2.5 py-1.5 rounded-lg font-medium text-[11px] transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              X / Twitter
            </button>
            <button
              onClick={() => handleSocialShare("email")}
              className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate border border-border px-2.5 py-1.5 rounded-lg font-medium text-[11px] transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </button>
          </div>
        </div>
      </div>

      {/* Referral Perks Summary */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-white p-3 rounded-xl border border-border">
          <p className="text-blue font-bold text-sm">1 Referral</p>
          <p className="text-slate text-[11px]">Move up 5 spots</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-border">
          <p className="text-blue font-bold text-sm">3 Referrals</p>
          <p className="text-slate text-[11px]">Top 20 VIP Queue</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-border">
          <p className="text-blue font-bold text-sm">5 Referrals</p>
          <p className="text-slate text-[11px]">Instant Access Token</p>
        </div>
      </div>
    </div>
  );
}
