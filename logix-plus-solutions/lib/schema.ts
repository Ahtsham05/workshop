import { COMPANY, EMAIL, PHONE_TEL, PLANS, SITE_URL, TRIAL_DAYS, type Faq } from "./site";

/** schema.org JSON-LD builders. Only facts that are true — no invented ratings or review counts. */

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: COMPANY,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon-512.png`,
  email: EMAIL,
  telephone: PHONE_TEL,
  address: { "@type": "PostalAddress", addressLocality: "Faisalabad", addressCountry: "PK" },
  areaServed: ["Worldwide", "PK", "GB", "US", "AE", "SA"],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: PHONE_TEL,
      email: EMAIL,
      availableLanguage: ["English", "Urdu"],
      areaServed: "Worldwide",
    },
  ],
  sameAs: [
    "https://www.facebook.com/logixplussolutions",
    "https://www.linkedin.com/company/logixplussolutions",
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: "Logix Plus",
  publisher: { "@id": `${SITE_URL}/#organization` },
  inLanguage: "en",
};

export function softwareSchema(opts: { name?: string; description: string; url: string; category?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts.name ?? "Logix Plus ERP & POS",
    description: opts.description,
    url: opts.url,
    applicationCategory: opts.category ?? "BusinessApplication",
    applicationSubCategory: "ERP, POS and Accounting Software",
    operatingSystem: "Web, Windows, Android, iOS",
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...PLANS.map((p) => p.priceUsd)),
      highPrice: Math.max(...PLANS.map((p) => p.priceUsd)),
      offerCount: PLANS.length,
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.priceUsd,
        priceCurrency: "USD",
        url: `${SITE_URL}/pricing`,
        description: `${p.tagline}. ${TRIAL_DAYS}-day free trial.`,
      })),
    },
  };
}

export function faqSchema(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
