import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FeaturesHero from "@/components/features/FeaturesHero";
import CrossTeamPlanning from "@/components/features/CrossTeamPlanning";
import ConnectedDocs from "@/components/features/ConnectedDocs";
import FeaturesCTA from "@/components/features/FeaturesCTA";
import JsonLd from "@/components/seo/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Features — Everything Teams Need from Vision to Execution",
  description:
    "Explore AI-powered roadmap generation, interactive 2D canvas boards, OKR goal deconstruction, linked documentation, and predictive sprint health alerts.",
  openGraph: {
    title: "VisionBoard Features — AI-Powered Roadmaps, Sprints & Canvas",
    description:
      "Move from high-level vision to daily sprint execution with native AI copilots and collaborative boards.",
    url: `${siteUrl}/features`,
    siteName: "VisionBoard",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "VisionBoard Features — AI-Powered Roadmaps, Sprints & Canvas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    creator: "@ariyoaresa",
    title: "VisionBoard Features — AI-Powered Roadmaps, Sprints & Canvas",
    description:
      "Move from high-level vision to daily sprint execution with native AI copilots and collaborative boards.",
    images: [`${siteUrl}/twitter-image`],
  },
  alternates: {
    canonical: `${siteUrl}/features`,
  },
};

export default function FeaturesPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": siteUrl,
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Features",
        "item": `${siteUrl}/features`,
      },
    ],
  };

  const featureListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    "name": "VisionBoard Product Features",
    "description": "Comprehensive list of AI-powered product strategy and execution tools in VisionBoard.",
    "url": `${siteUrl}/features`,
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": [
        {
          "@type": "NameValueStructure",
          "name": "AI Goal Deconstructor",
          "value": "Automatically break high-level strategic OKRs into actionable epics, user stories, and subtasks.",
        },
        {
          "@type": "NameValueStructure",
          "name": "Interactive 2D Canvas Boards",
          "value": "Infinite canvas workspace linking product strategy, user flows, and sprint task cards.",
        },
        {
          "@type": "NameValueStructure",
          "name": "Predictive Sprint Health & Velocity",
          "value": "AI-driven alert system predicting scope creep, bottleneck risks, and velocity trends.",
        },
        {
          "@type": "NameValueStructure",
          "name": "Connected Docs & PRD Workspace",
          "value": "Notion-style rich text document editor seamlessly tied to live backlog items and tasks.",
        },
      ],
    },
  };

  return (
    <div className="min-h-screen bg-offwhite text-ink font-sans flex flex-col justify-between">
      <JsonLd data={[breadcrumbJsonLd, featureListJsonLd]} />
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
