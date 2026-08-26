import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://visionboard.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/features", "/solutions", "/pricing", "/privacy", "/terms", "/auth/login", "/auth/register"],
        disallow: [
          "/workspace/",
          "/dashboard/",
          "/api/",
          "/admin/",
          "/account/",
          "/onboarding/",
          "/invite/",
          "/reset-password/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
