import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

  const publicRoutes = [
    "/",
    "/features",
    "/solutions",
    "/pricing",
    "/privacy",
    "/terms",
    "/auth/login",
    "/auth/register",
  ];

  const privateRoutes = [
    "/workspace/",
    "/dashboard/",
    "/api/",
    "/admin/",
    "/account/",
    "/onboarding/",
    "/invite/",
    "/reset-password/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: publicRoutes,
        disallow: privateRoutes,
      },
      // AI Crawlers & LLM Indexing (Generative Engine Optimization - GEO)
      {
        userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"],
        allow: publicRoutes,
        disallow: privateRoutes,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
