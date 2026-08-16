import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FeaturesHero from "@/components/features/FeaturesHero";
import CrossTeamPlanning from "@/components/features/CrossTeamPlanning";
import ConnectedDocs from "@/components/features/ConnectedDocs";
import FeaturesCTA from "@/components/features/FeaturesCTA";

export const metadata = {
  title: "Features | VisionBoard - Move from Vision to Execution",
  description:
    "Everything teams need to move from vision to execution. AI-powered roadmaps, planning, documentation, and execution tracking designed for modern collaboration.",
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
