"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PricingHero from "@/components/pricing/PricingHero";
import PricingCards from "@/components/pricing/PricingCards";
import PricingComparisonTable from "@/components/pricing/PricingComparisonTable";
import PricingFAQ from "@/components/pricing/PricingFAQ";
import PricingCTA from "@/components/pricing/PricingCTA";

interface PricingClientProps {
  isAuthenticated?: boolean;
  workspaceId?: string;
  currentPlan?: string;
}

export default function PricingClient({
  isAuthenticated = false,
  workspaceId,
  currentPlan,
}: PricingClientProps) {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-offwhite text-ink font-sans flex flex-col justify-between">
      <div>
        <Header isAuthenticated={isAuthenticated} />
        <main id="main-content" tabIndex={-1} className="space-y-4">
          <PricingHero isAnnual={isAnnual} setIsAnnual={setIsAnnual} />
          <PricingCards
            isAnnual={isAnnual}
            isAuthenticated={isAuthenticated}
            workspaceId={workspaceId}
            currentPlan={currentPlan}
          />
          <PricingComparisonTable />
          <PricingFAQ />
          <PricingCTA />
        </main>
      </div>
      <Footer />
    </div>
  );
}
