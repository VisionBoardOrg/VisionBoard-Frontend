import type { Metadata } from "next";
import Header from "@/components/Header";
import HomeHero from "@/components/HomeHero";
import FeatureSection1 from "@/components/FeatureSection1";
import FeatureSection2 from "@/components/FeatureSection2";
import FeatureSection3 from "@/components/FeatureSection3";
import BottomCTA from "@/components/BottomCTA";
import Footer from "@/components/Footer";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "VisionBoard — Work smarter together with AI, from vision to execution",
  description:
    "VisionBoard connects high-level company goals, product specs, and agile sprint tracking into a single AI-native workspace. Generate roadmaps, deconstruct goals, and execute seamlessly.",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "VisionBoard — Work smarter together with AI, from vision to execution",
    description:
      "VisionBoard connects high-level company goals, product specs, and agile sprint tracking into a single AI-native workspace.",
    url: siteUrl,
    siteName: "VisionBoard",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "VisionBoard — Work smarter together with AI, from vision to execution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    creator: "@ariyoaresa",
    title: "VisionBoard — Work smarter together with AI, from vision to execution",
    description:
      "VisionBoard connects high-level company goals, product specs, and agile sprint tracking into a single AI-native workspace.",
    images: [`${siteUrl}/twitter-image`],
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-offwhite font-sans text-ink">
      <Header />
      <HomeHero />
      <FeatureSection1 />
      <FeatureSection2 />
      <FeatureSection3 />
      <BottomCTA />
      <Footer />
    </div>
  );
}
