import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Create Account — Start Free",
  description: "Create your VisionBoard account free with 10 AI credits/month — no credit card needed.",
  alternates: {
    canonical: `${siteUrl}/auth/register`,
  },
  openGraph: {
    title: "Create Account — VisionBoard",
    description: "Create your VisionBoard account free with 10 AI credits/month — no credit card needed.",
    url: `${siteUrl}/auth/register`,
    siteName: "VisionBoard",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Create Account — VisionBoard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    creator: "@ariyoaresa",
    title: "Create Account — VisionBoard",
    description: "Create your VisionBoard account free with 10 AI credits/month — no credit card needed.",
    images: [`${siteUrl}/twitter-image`],
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
