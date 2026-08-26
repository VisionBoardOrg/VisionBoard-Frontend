import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://visionboard.app";

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
    "AI roadmap generator",
    "product management software",
    "OKR tracking",
    "sprint planning",
    "agile execution",
    "AI copilot for product teams",
    "goal deconstruction",
    "collaborative canvas",
    "project management",
    "product strategy to execution",
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
    canonical: "./",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "VisionBoard",
    title: "VisionBoard — AI-Powered Workspace from Vision to Execution",
    description:
      "Transform high-level strategy and messy specs into structured milestones, interactive sprint boards, and real-time execution tracking with native AI.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "VisionBoard — AI-Powered Workspace from Vision to Execution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VisionBoard — AI-Powered Workspace from Vision to Execution",
    description:
      "Transform high-level strategy and specs into structured milestones, interactive sprint boards, and real-time execution tracking.",
    creator: "@visionboard",
    images: ["/twitter-image"],
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
        "description":
          "AI-native product management workspace connecting strategic goals and product specs to agile execution.",
        "url": siteUrl,
      },
      {
        "@type": "Organization",
        "name": "VisionBoard Inc.",
        "url": siteUrl,
        "logo": `${siteUrl}/favicon.svg`,
        "sameAs": ["https://twitter.com/visionboard"],
      },
      {
        "@type": "WebSite",
        "url": siteUrl,
        "name": "VisionBoard",
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${siteUrl}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
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
      <body className="h-full bg-offwhite text-ink" suppressHydrationWarning>
        <SessionProvider session={session} refetchOnWindowFocus={false}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
