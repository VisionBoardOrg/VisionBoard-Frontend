import { ArrowRight } from "lucide-react";
import SecondaryButton from "./reusables/secondaryButton";

export default function BottomCTA() {
  return (
    <section className="py-24 px-6 flex justify-center">
      <div className="bg-linear-to-br from-blue-deep via-blue to-blue-mid w-full max-w-5xl rounded-[24px] md:rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col items-center text-center text-white shadow-xl relative overflow-hidden">
        {/* Accent blob */}
        <div
          aria-hidden="true"
          className="absolute top-[-50%] right-[-10%] w-[400px] h-[400px] bg-cyan/20 blur-[80px] rounded-full pointer-events-none"
        />

        <h2 className="text-[36px] md:text-[48px] font-extrabold tracking-[-0.03em] mb-4 relative z-10 text-white">
          The future of team execution
          <br />
          starts here.
        </h2>
        <p className="text-white/90 text-[16px] md:text-[18px] font-medium mb-10 max-w-[600px] relative z-10">
          Built for product leaders and their teams — AI-powered roadmaps, connected docs, and visual canvas execution.
        </p>
        <SecondaryButton
          href="/auth/register"
          size="lg"
          className="relative z-10 w-full sm:w-auto px-8 !bg-white !border-white !text-blue shadow-md hover:!bg-blue-faint transition-colors"
        >
          Get Started Free <ArrowRight size={18} aria-hidden="true" />
        </SecondaryButton>
        <p className="text-white/90 text-xs mt-4 relative z-10">
          No credit card required · Free plan available
        </p>
      </div>
    </section>
  );
}
