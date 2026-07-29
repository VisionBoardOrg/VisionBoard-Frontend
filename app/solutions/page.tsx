import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SolutionsHero from "@/components/solutions/SolutionsHero";
import RoleBasedViews from "@/components/solutions/RoleBasedViews";
import TemplateSection from "@/components/solutions/TemplateSection";
import AIFeaturesSection from "@/components/solutions/AIFeaturesSection";
import SolutionsCTA from "@/components/solutions/SolutionsCTA";

export const metadata = {
  title: "Solutions | VisionBoard - Workspaces Built for Every Role",
  description:
    "VisionBoard aligns every role around a single truth, giving executive teams real-time visibility, product teams clarity, and execution teams room to build.",
};

export default function SolutionsPage() {
  return (
    <div className="min-h-screen bg-offwhite text-ink font-sans flex flex-col justify-between">
      <div>
        <Header />
        <main className="space-y-4">
          <SolutionsHero />
          <RoleBasedViews />
          <TemplateSection />
          <AIFeaturesSection />
          <SolutionsCTA />
        </main>
      </div>
      <Footer />
    </div>
  );
}
