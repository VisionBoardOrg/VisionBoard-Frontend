"use client";

import React from "react";

export default function PricingCTA() {
  return (
    <section className="py-16 px-4 max-w-7xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-blue-700 to-indigo-900 py-16 px-6 md:px-12 text-center text-white shadow-2xl">
        {/* Subtle background glow effect */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight">
            Ready to plan your next quarter?
          </h2>
          <p className="mt-4 text-sm md:text-base text-blue-100/90 leading-relaxed">
            Start free with VisionBoard or contact sales for custom setup. Upgrade anytime as your roadmap grows.
          </p>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              className="bg-white hover:bg-blue-50 text-blue-700 font-bold text-sm md:text-base py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-150 active:scale-[0.98]"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
