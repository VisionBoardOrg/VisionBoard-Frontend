"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SecondaryButton from "./reusables/secondaryButton";

export default function HomeHero() {
  return (
    <section className="relative pt-10 flex flex-col items-center justify-start overflow-hidden bg-offwhite">
      {/* Subtle dot grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#DBEAFE_1.5px,transparent_1.5px)] bg-size-[24px_24px] opacity-70" />

      <div className="relative z-10 flex flex-col items-center justify-center gap-6 max-w-4xl text-center px-6 mt-6">
        {/* Social proof badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-faint border border-blue-light text-blue text-xs font-semibold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Now live — no waitlist, sign up instantly</span>
        </div>

        <h1 className="text-[52px] md:text-[64px] font-extrabold tracking-[-0.03em] text-ink leading-[1.1]">
          Work <span className="text-blue">smarter</span> together with AI, from <span className="text-blue">vision</span> to <span className="text-blue">execution</span>.
        </h1>

        <p className="text-[17px] md:text-[18px] text-slate leading-[1.65] max-w-[800px] font-medium">
          Built for product managers and engineering leaders. VisionBoard combines AI-powered roadmaps, connected specs, and visual 2D board execution into a unified workspace.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
          <Link href="/auth/register">
            <button
              type="button"
              className="w-full sm:w-auto px-8 py-3 text-base font-bold bg-blue text-white rounded-xl shadow-lg hover:shadow-xl hover:bg-blue-mid transition-all flex items-center gap-2"
            >
              Start for free <ArrowRight size={18} />
            </button>
          </Link>
          <a href="#features">
            <SecondaryButton size="md" className="w-full sm:w-auto px-8 bg-white border border-blue-light text-blue shadow-sm">
              Explore Features
            </SecondaryButton>
          </a>
        </div>

        <p className="text-xs text-muted mt-1">No credit card required · Free plan available · Upgrade anytime</p>
      </div>

      {/* Wavy Background Container */}
      <div className="relative w-full h-[300px] mt-4 flex flex-col justify-end">
        <svg className="absolute bottom-0 w-full h-[300px]" viewBox="0 0 1440 300" preserveAspectRatio="none">
          <path d="M0,120 C480,380 960,380 1440,120 L1440,300 L0,300 Z" fill="var(--color-cyan)" />
          <path d="M0,150 C480,410 960,410 1440,150 L1440,300 L0,300 Z" fill="var(--color-blue)" />
          <path d="M0,200 C480,460 960,460 1440,200 L1440,300 L0,300 Z" fill="var(--color-blue-deep)" />
        </svg>
      </div>

      {/* Marquee Banner */}
      <div className="w-full bg-offwhite border-b border-border py-4 md:py-6 overflow-hidden flex whitespace-nowrap">
        <div className="animate-marquee flex gap-8 md:gap-12 text-[15px] md:text-[20px] font-bold text-slate/40 tracking-tight italic px-6">
          <span>Cross Team Planning</span>
          <span>AI Powered Roadmap</span>
          <span>Execution Visibility</span>
          <span>AI Workflow Generations</span>
          <span>Strategic Planning</span>
          <span>Real-Time Collaboration</span>
          <span>Smart Execution Tracking</span>
          <span>Progress Intelligence</span>
          <span>Cross Team Planning</span>
          <span>AI Powered Roadmap</span>
          <span>Execution Visibility</span>
          <span>AI Workflow Generations</span>
          <span>Strategic Planning</span>
          <span>Real-Time Collaboration</span>
          <span>Smart Execution Tracking</span>
          <span>Progress Intelligence</span>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes marquee {
                0% { transform: translateX(0%); }
                100% { transform: translateX(-50%); }
            }
            .animate-marquee {
                animation: marquee 20s linear infinite;
            }
        `,
        }}
      />
    </section>
  );
}