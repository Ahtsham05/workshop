import type { MetadataRoute } from "next";
import { LANDING_PAGES } from "@/lib/landing-pages";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    ...LANDING_PAGES.map((p) => ({
      url: `${SITE_URL}/${p.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: p.group === "product" ? 0.9 : 0.8,
    })),
    ...["privacy-policy", "terms-and-conditions", "data-deletion"].map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
