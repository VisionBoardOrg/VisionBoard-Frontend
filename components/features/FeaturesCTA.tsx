"use client";

import Link from "next/link";

export default function FeaturesCTA() {
  return (
    <section className="py-20 px-6 flex justify-center max-w-7xl mx-auto">
      <div className="bg-gradient-to-r from-blue-deep via-blue to-[#0EA5E9] w-full max-w-5xl rounded-[28px] sm:rounded-[36px] py-16 px-8 sm:px-14 flex flex-col items-center text-center text-white shadow-xl relative overflow-hidden">
        {/* Decorative subtle light blur accent */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/10 blur-3xl rounded-full pointer-events-none" />

        <h2 className="text-[36px] sm:text-[44px] md:text-[50px] font-extrabold tracking-[-0.03em] leading-tight mb-4 relative z-10">
          Turn strategy into visible
          <br className="hidden sm:inline" /> execution.
        </h2>
        <p className="text-blue-faint text-[16px] sm:text-[18px] font-medium mb-8 max-w-[560px] relative z-10 leading-relaxed">
          Join early teams building smarter workflows with VisionBoard.
        </p>

        <Link href="/auth/register">
          <button
            type="button"
            className="bg-white text-blue hover:bg-blue-faint text-[16px] font-bold px-8 py-3.5 rounded-xl shadow-md transition-all cursor-pointer relative z-10"
          >
            Get Started Free
          </button>
        </Link>
      </div>
    </section>
  );
}
