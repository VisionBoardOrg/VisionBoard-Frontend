import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  // F-30: adjustFontFallback generates a metric-matched system-font fallback so
  // the layout shift (FOUT) on first load is minimised — no visible reflow
  // when the web font swaps in.
  adjustFontFallback: true,
  fallback: ["system-ui", "ui-sans-serif", "sans-serif"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "VisionBoard — AI-Powered Workspace from Vision to Execution",
    template: "%s | VisionBoard",
  },
  description:
    "VisionBoard connects strategic company goals and product specs directly to agile execution with AI-powered roadmaps, automated goal deconstruction, and real-time sprint tracking.",
  applicationName: "VisionBoard",
  authors: [{ name: "VisionBoard Inc." }],
  generator: "Next.js",
  keywords: [
    // Alternative & Switching Intent
    "Jira alternative",
    "AI Jira alternative",
    "Linear alternative with roadmaps",
    "Productboard alternative",
    "Aha alternative",
    "Miro alternative for product management",
    // AI-Native Workflows
    "AI product management software",
    "AI roadmap generator",
    "AI PRD generator",
    "AI goal deconstruction",
    "predictive sprint velocity tool",
    "AI copilot for product managers",
    // Strategy to Execution Workflows
    "OKR to sprint mapping",
    "product strategy to execution workspace",
    "simple friendly product management tool",
    "interactive canvas",
    "agile board",
    "backlog organizer",
    "product management platform for startups",
    "VisionBoard",
    "Vision Board",
  ],
  referrer: "origin-when-cross-origin",
  creator: "VisionBoard Inc.",
  publisher: "VisionBoard Inc.",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: siteUrl,
    languages: {
      "en-US": siteUrl,
      "en-GB": siteUrl,
      "x-default": siteUrl,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "VisionBoard",
    title: "VisionBoard — AI-Powered Workspace from Vision to Execution",
    description:
      "Transform high-level strategy and specs into structured milestones, interactive sprint boards, and real-time execution tracking with native AI.",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "VisionBoard — AI-Powered Workspace from Vision to Execution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    title: "VisionBoard — AI-Powered Workspace from Vision to Execution",
    description:
      "Transform high-level strategy and specs into structured milestones, interactive sprint boards, and real-time execution tracking.",
    creator: "@ariyoaresa",
    images: [`${siteUrl}/twitter-image`],
  },
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_YANDEX_VERIFICATION
      ? { yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION }
      : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  // Structured Data (JSON-LD) for Search Engine Rich Snippets
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "VisionBoard",
        "operatingSystem": "Web Browser",
        "applicationCategory": "BusinessApplication, Productivity",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "128",
          "bestRating": "5",
          "worstRating": "1",
        },
        "featureList": [
          "AI Goal Deconstruction",
          "Interactive 2D Canvas Boards",
          "Linked PRD & Spec Documentation",
          "Predictive Sprint Health & Velocity Alerts",
          "Real-time Multi-user Collaboration",
        ],
        "description":
          "AI-native product management workspace connecting strategic goals and product specs to agile execution.",
        "url": siteUrl,
      },
      {
        "@type": "Organization",
        "name": "VisionBoard Inc.",
        "url": siteUrl,
        "logo": `${siteUrl}/favicon.svg`,
        "sameAs": [
          "https://github.com/VisionBoardOrg",
          "https://x.com/ariyoaresa",
          "https://instagram.com/ariyoaresa",
        ],
      },
      {
        "@type": "WebSite",
        "url": siteUrl,
        "name": "VisionBoard",
      },
    ],
  };

  return (
    <html
      lang="en"
      className={`${jakarta.variable} font-sans h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="h-full bg-offwhite text-ink">
        <SessionProvider session={session} refetchOnWindowFocus={false}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
