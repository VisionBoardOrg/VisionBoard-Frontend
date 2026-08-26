import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SolutionsHero from "@/components/solutions/SolutionsHero";
import RoleBasedViews from "@/components/solutions/RoleBasedViews";
import TemplateSection from "@/components/solutions/TemplateSection";
import AIFeaturesSection from "@/components/solutions/AIFeaturesSection";
import SolutionsCTA from "@/components/solutions/SolutionsCTA";

export const metadata: Metadata = {
  title: "Solutions — Workspaces Built for Every Role",
  description:
    "VisionBoard aligns every role around a single truth — giving executive teams real-time strategic visibility, product teams clarity, and engineering teams room to build.",
  openGraph: {
    title: "VisionBoard Solutions — Tailored for Product, Engineering & Executives",
    description:
      "Connect high-level strategy to agile sprint execution with role-tailored dashboards and AI workflow engines.",
    url: "/solutions",
  },
  alternates: {
    canonical: "/solutions",
  },
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
