"use client";

import { ArrowRight } from "lucide-react";
import SecondaryButton from "./reusables/secondaryButton";
import Link from "next/link";

export default function BottomCTA() {
  return (
    <section className="py-24 px-6 flex justify-center">
      <div className="bg-linear-to-br from-blue-deep to-cyan w-full max-w-5xl rounded-[24px] md:rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col items-center text-center text-white shadow-xl relative overflow-hidden">
        {/* Accent blob */}
        <div className="absolute top-[-50%] right-[-10%] w-[400px] h-[400px] bg-blue-light/20 blur-[80px] rounded-full pointer-events-none" />

        <h2 className="text-[36px] md:text-[48px] font-extrabold tracking-[-0.03em] mb-4 relative z-10">
          The future of team execution<br />starts here.
        </h2>
        <p className="text-blue-faint text-[16px] md:text-[18px] font-medium mb-10 max-w-[600px] relative z-10">
          Join thousands of product leaders using AI-powered roadmaps, connected docs, and visual canvas execution.
        </p>
        <Link href="/auth/register">
          <SecondaryButton
            size="md"
            className="w-full sm:w-auto px-8 bg-white border border-blue-light text-blue shadow-sm hover:bg-blue-faint transition-colors"
          >
            <span className="flex items-center gap-2">
              Get Started Free <ArrowRight size={18} />
            </span>
          </SecondaryButton>
        </Link>
        <p className="text-blue-faint/70 text-xs mt-4 relative z-10">No credit card required · Free plan available</p>
      </div>
    </section>
  );
}
