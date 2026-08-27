import type { Metadata } from "next";
import PricingClient from "@/components/pricing/PricingClient";
import JsonLd from "@/components/seo/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Pricing Plans — Transparent for Teams of All Sizes",
  description:
    "Explore VisionBoard subscription tiers: Free, Startup, Growth, and Enterprise. Get AI-powered roadmaps, sprint boards, and unlimited collaboration.",
  openGraph: {
    title: "VisionBoard Pricing — Flexible Plans from Free to Enterprise",
    description:
      "Start free or scale with advanced AI roadmap generation, predictive sprint velocity alerts, and unlimited workspaces.",
    url: `${siteUrl}/pricing`,
  },
  alternates: {
    canonical: `${siteUrl}/pricing`,
  },
};

export default function PricingPage() {
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
        "name": "Pricing",
        "item": `${siteUrl}/pricing`,
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Can I change plans at any time?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, you can upgrade, downgrade, or cancel your subscription at any time. Any changes will be applied at the start of your next billing cycle.",
        },
      },
      {
        "@type": "Question",
        "name": "What forms of payment do you accept?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "We accept all major credit cards including Visa, Mastercard, American Express, and Discover. For Enterprise plans, we also support ACH bank transfers and invoicing.",
        },
      },
      {
        "@type": "Question",
        "name": "Does unused AI credits roll over to the next month?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No, AI credits reset at the beginning of each billing cycle and do not roll over to subsequent months.",
        },
      },
      {
        "@type": "Question",
        "name": "How does annual billing work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "With annual billing, you pay upfront for a 12-month subscription and save 20% compared to paying month-to-month.",
        },
      },
      {
        "@type": "Question",
        "name": "What happens to my data if I cancel my subscription?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "If you cancel, your account data will remain accessible in read-only mode for 30 days, allowing you to export all your roadmaps before permanent deletion.",
        },
      },
    ],
  };

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "VisionBoard Product Management Workspace",
    "description": "AI-powered product management workspace connecting strategic goals and product specs to agile execution.",
    "brand": {
      "@type": "Brand",
      "name": "VisionBoard",
    },
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "USD",
      "lowPrice": "0",
      "highPrice": "49",
      "offerCount": "3",
      "offers": [
        {
          "@type": "Offer",
          "name": "Free Tier",
          "price": "0",
          "priceCurrency": "USD",
          "url": `${siteUrl}/pricing`,
        },
        {
          "@type": "Offer",
          "name": "Startup Tier",
          "price": "19",
          "priceCurrency": "USD",
          "url": `${siteUrl}/pricing`,
        },
        {
          "@type": "Offer",
          "name": "Growth Tier",
          "price": "49",
          "priceCurrency": "USD",
          "url": `${siteUrl}/pricing`,
        },
      ],
    },
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd, productJsonLd]} />
      <PricingClient />
    </>
  );
}
