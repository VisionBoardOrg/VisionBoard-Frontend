import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Sign In — Access Your Workspace",
  description: "Sign in to VisionBoard to access your AI roadmaps, sprint boards, and collaborative canvas.",
  alternates: {
    canonical: `${siteUrl}/auth/login`,
  },
  openGraph: {
    title: "Sign In — VisionBoard Workspace",
    description: "Sign in to VisionBoard to access your AI roadmaps, sprint boards, and collaborative canvas.",
    url: `${siteUrl}/auth/login`,
    siteName: "VisionBoard",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Sign In — VisionBoard Workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ariyoaresa",
    creator: "@ariyoaresa",
    title: "Sign In — VisionBoard Workspace",
    description: "Sign in to VisionBoard to access your AI roadmaps, sprint boards, and collaborative canvas.",
    images: [`${siteUrl}/twitter-image`],
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
