import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FeaturesHero from "@/components/features/FeaturesHero";
import CrossTeamPlanning from "@/components/features/CrossTeamPlanning";
import ConnectedDocs from "@/components/features/ConnectedDocs";
import FeaturesCTA from "@/components/features/FeaturesCTA";

export const metadata: Metadata = {
  title: "Features — Everything Teams Need from Vision to Execution",
  description:
    "Explore AI-powered roadmap generation, interactive 2D canvas boards, OKR goal deconstruction, linked documentation, and predictive sprint health alerts.",
  openGraph: {
    title: "VisionBoard Features — AI-Powered Roadmaps, Sprints & Canvas",
    description:
      "Move from high-level vision to daily sprint execution with native AI copilots and collaborative boards.",
    url: "/features",
  },
  alternates: {
    canonical: "/features",
  },
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-offwhite text-ink font-sans flex flex-col justify-between">
      <div>
        <Header />
        <main>
          <FeaturesHero />
          <CrossTeamPlanning />
          <ConnectedDocs />
          <FeaturesCTA />
        </main>
      </div>
      <Footer />
    </div>
  );
}
