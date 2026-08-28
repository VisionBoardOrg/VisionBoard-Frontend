import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Create Account — Start Your 14-Day Free Trial",
  description: "Create your VisionBoard account and start building with AI-powered roadmaps, sprint execution, and team workspaces.",
  alternates: {
    canonical: `${siteUrl}/auth/register`,
  },
  openGraph: {
    title: "Create Account — VisionBoard Free Trial",
    description: "Create your VisionBoard account and start building with AI-powered roadmaps, sprint execution, and team workspaces.",
    url: `${siteUrl}/auth/register`,
    siteName: "VisionBoard",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Create Account — VisionBoard Free Trial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    creator: "@ariyoaresa",
    title: "Create Account — VisionBoard Free Trial",
    description: "Create your VisionBoard account and start building with AI-powered roadmaps, sprint execution, and team workspaces.",
    images: [`${siteUrl}/twitter-image`],
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
