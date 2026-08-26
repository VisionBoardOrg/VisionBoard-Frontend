import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account — Start Your 14-Day Free Trial",
  description: "Create your VisionBoard account and start building with AI-powered roadmaps, sprint execution, and team workspaces.",
  alternates: {
    canonical: "/auth/register",
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
