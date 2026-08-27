import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Access Your Workspace",
  description: "Sign in to VisionBoard to access your AI roadmaps, sprint boards, and collaborative canvas.",
  alternates: {
    canonical: "/auth/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
