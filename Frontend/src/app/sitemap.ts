import type { MetadataRoute } from "next";

/** Public marketing site base — update when domain changes. */
const SITE_URL = "https://asanpay.in";

/**
 * Served at /sitemap.xml after deploy.
 * Add new public routes to `routes` when you ship more pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const routes: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"];
    priority: number;
  }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
    { path: "/refund-policy", changeFrequency: "yearly", priority: 0.4 },
    { path: "/grievance", changeFrequency: "yearly", priority: 0.4 },
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path === "/" ? "" : route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
