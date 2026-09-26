import { LANDING_PAGES } from "./landing-pages";

/**
 * Regional hreflang cluster. The home page is x-default and each region page is the
 * version for its country. Every page in the cluster must list the same set (reciprocal).
 */
export const REGION_ALTERNATES: Record<string, string> = Object.fromEntries([
  ...LANDING_PAGES.filter((p) => p.hreflang).map((p) => [p.hreflang!, `/${p.slug}`]),
  ["x-default", "/"],
]);
