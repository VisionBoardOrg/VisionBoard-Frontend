"use client";

import SecondaryButton from "@/components/reusables/secondaryButton";
import Link from "next/link";

export default function SolutionsCTA() {
  return (
    <section className="py-20 px-6 md:px-12 bg-offwhite border-t border-border flex justify-center">
      <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 w-full max-w-5xl rounded-[24px] md:rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col items-center text-center text-white shadow-xl relative overflow-hidden">
        {/* Background glow overlay */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />

        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 relative z-10">
          Find the workspace built for your role.
        </h2>
        
        <p className="text-blue-100 text-base md:text-lg max-w-xl mb-8 relative z-10">
          Start building aligned, visible, and high-impact product roadmaps today.
        </p>

        <Link href="/auth/register">
          <SecondaryButton
            size="lg"
            className="w-full sm:w-auto px-10 bg-white hover:bg-blue-50 text-blue font-bold shadow-md hover:scale-[1.02] transition-transform border-none cursor-pointer"
          >
            Get Started Free
          </SecondaryButton>
        </Link>
      </div>
    </section>
  );
}

