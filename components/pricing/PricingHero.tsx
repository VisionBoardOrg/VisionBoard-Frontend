"use client";

interface PricingHeroProps {
  isAnnual: boolean;
  setIsAnnual: (isAnnual: boolean) => void;
}

export default function PricingHero({ isAnnual, setIsAnnual }: PricingHeroProps) {
  return (
    <section className="pt-12 pb-8 px-4 text-center max-w-4xl mx-auto">
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
        Price that grow as{" "}
        <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 bg-clip-text text-transparent italic font-extrabold">
          your roadmap grows
        </span>
      </h1>
      <p className="mt-4 text-base md:text-lg text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed">
        Choose the plan that&apos;s right for you. All plans include 14-day free trial. No credit card required. Upgrade or downgrade anytime.
      </p>

      {/* Monthly / Annual Toggle */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <span className={`text-sm font-semibold transition-colors ${!isAnnual ? "text-slate-900" : "text-slate-500"}`}>
          Monthly
        </span>
        
        <button
          type="button"
          role="switch"
          aria-checked={isAnnual}
          onClick={() => setIsAnnual(!isAnnual)}
          className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
            isAnnual ? "bg-blue-600" : "bg-slate-300"
          }`}
        >
          <span className="sr-only">Toggle billing frequency</span>
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              isAnnual ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold transition-colors ${isAnnual ? "text-slate-900" : "text-slate-500"}`}>
            Annual
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 uppercase tracking-wide">
            Save 20%
          </span>
        </div>
      </div>
    </section>
  );
}
