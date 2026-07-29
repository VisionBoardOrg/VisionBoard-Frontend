"use client";

import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import SecondaryButton from "./reusables/secondaryButton";
import WaitlistModal from "./waitlist/WaitlistModal";

export default function BottomCTA() {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

  return (
    <section className="py-24 px-6 flex justify-center">
      <div className="bg-linear-to-br from-blue-deep to-cyan w-full max-w-5xl rounded-[32px] p-16 flex flex-col items-center text-center text-white shadow-xl relative overflow-hidden">
        {/* Accent blob */}
        <div className="absolute top-[-50%] right-[-10%] w-[400px] h-[400px] bg-blue-light/20 blur-[80px] rounded-full pointer-events-none" />

        <h2 className="text-[36px] md:text-[48px] font-extrabold tracking-[-0.03em] mb-4 relative z-10">
          The future of team execution<br />starts here.
        </h2>
        <p className="text-blue-faint text-[16px] md:text-[18px] font-medium mb-10 max-w-[600px] relative z-10">
          Join 1,480+ product leaders securing early access to AI-powered roadmaps, connected docs, and visual canvas execution.
        </p>
        <SecondaryButton
          size="md"
          onClick={() => setIsWaitlistOpen(true)}
          className="w-full sm:w-auto px-8 bg-white border border-blue-light text-blue shadow-sm hover:bg-blue-faint transition-colors"
        >
          <span className="flex items-center gap-2">
            Join Early Access Waitlist <ArrowRight size={18} />
          </span>
        </SecondaryButton>

        <WaitlistModal
          isOpen={isWaitlistOpen}
          onClose={() => setIsWaitlistOpen(false)}
        />
      </div>
    </section>
  );
}
