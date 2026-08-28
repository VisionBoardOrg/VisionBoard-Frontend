import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SolutionsHero from "@/components/solutions/SolutionsHero";
import RoleBasedViews from "@/components/solutions/RoleBasedViews";
import TemplateSection from "@/components/solutions/TemplateSection";
import AIFeaturesSection from "@/components/solutions/AIFeaturesSection";
import SolutionsCTA from "@/components/solutions/SolutionsCTA";
import JsonLd from "@/components/seo/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Solutions — Workspaces Built for Every Role",
  description:
    "VisionBoard aligns every role around a single truth — giving executive teams real-time strategic visibility, product teams clarity, and engineering teams room to build.",
  openGraph: {
    title: "VisionBoard Solutions — Tailored for Product, Engineering & Executives",
    description:
      "Connect high-level strategy to agile sprint execution with role-tailored dashboards and AI workflow engines.",
    url: `${siteUrl}/solutions`,
    siteName: "VisionBoard",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "VisionBoard Solutions — Tailored for Product, Engineering & Executives",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    creator: "@ariyoaresa",
    title: "VisionBoard Solutions — Tailored for Product, Engineering & Executives",
    description:
      "Connect high-level strategy to agile sprint execution with role-tailored dashboards and AI workflow engines.",
    images: [`${siteUrl}/twitter-image`],
  },
  alternates: {
    canonical: `${siteUrl}/solutions`,
  },
};

export default function SolutionsPage() {
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
        "name": "Solutions",
        "item": `${siteUrl}/solutions`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-offwhite text-ink font-sans flex flex-col justify-between">
      <JsonLd data={breadcrumbJsonLd} />
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
