import type { Metadata } from "next";
import PricingClient from "@/components/pricing/PricingClient";

export const metadata: Metadata = {
  title: "Pricing Plans — Transparent for Teams of All Sizes",
  description:
    "Explore VisionBoard subscription tiers: Free, Startup, Growth, and Enterprise. Get AI-powered roadmaps, sprint boards, and unlimited collaboration.",
  openGraph: {
    title: "VisionBoard Pricing — Flexible Plans from Free to Enterprise",
    description:
      "Start free or scale with advanced AI roadmap generation, predictive sprint velocity alerts, and unlimited workspaces.",
    url: "/pricing",
  },
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
