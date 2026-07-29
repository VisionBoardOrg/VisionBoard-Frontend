"use client";

import React, { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PricingHero from "@/components/pricing/PricingHero";
import PricingCards from "@/components/pricing/PricingCards";
import PricingComparisonTable from "@/components/pricing/PricingComparisonTable";
import PricingFAQ from "@/components/pricing/PricingFAQ";
import PricingCTA from "@/components/pricing/PricingCTA";

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-offwhite text-ink font-sans flex flex-col justify-between">
      <div>
        <Header />
        <main className="space-y-4">
          <PricingHero isAnnual={isAnnual} setIsAnnual={setIsAnnual} />
          <PricingCards isAnnual={isAnnual} />
          <PricingComparisonTable />
          <PricingFAQ />
          <PricingCTA />
        </main>
      </div>
      <Footer />
    </div>
  );
}
