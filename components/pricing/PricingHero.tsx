"use client";

interface PricingHeroProps {
  isAnnual: boolean;
  setIsAnnual: (isAnnual: boolean) => void;
}

export default function PricingHero({ isAnnual, setIsAnnual }: PricingHeroProps) {
  return (
    <section className="pt-12 pb-8 px-4 text-center max-w-4xl mx-auto">
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
        Pricing that grows as{" "}
        <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 bg-clip-text text-transparent italic font-extrabold">
          your roadmap grows
        </span>
      </h1>
      <p className="mt-4 text-base md:text-lg text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed">
        Choose the plan that&apos;s right for you. All plans include 14-day free trial. No credit card required. Upgrade or downgrade anytime.
      </p>

      {/* Monthly / Annual Toggle (native <input type="checkbox" switch> per switch guide) */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setIsAnnual(false)}
          aria-pressed={!isAnnual}
          className={`text-sm font-semibold transition-colors cursor-pointer rounded-md px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${!isAnnual ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          Monthly
        </button>

        <input
          id="pricing-annual-switch"
          type="checkbox"
          role="switch"
          {...({ switch: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          checked={isAnnual}
          onChange={(e) => setIsAnnual(e.target.checked)}
          aria-label="Toggle annual billing"
          className="native-switch"
        />

        <div className="flex items-center gap-2">
          <label
            htmlFor="pricing-annual-switch"
            className={`text-sm font-semibold transition-colors cursor-pointer rounded-md px-1.5 py-1 ${isAnnual ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
          >
            Annual
          </label>
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 uppercase tracking-wide">
            Save 20%
          </span>
        </div>
      </div>
    </section>
  );
}
