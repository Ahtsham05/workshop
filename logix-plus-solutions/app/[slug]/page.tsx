import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Hero from "@/components/sections/Hero";
import TrustStrip from "@/components/sections/TrustStrip";
import PainPoints from "@/components/sections/PainPoints";
import FeatureGrid from "@/components/sections/FeatureGrid";
import HowItWorks from "@/components/sections/HowItWorks";
import Pricing from "@/components/sections/Pricing";
import Faq from "@/components/sections/Faq";
import FinalCta from "@/components/sections/FinalCta";
import TrustBar from "@/components/sections/TrustBar";
import Included from "@/components/sections/Included";
import Industries from "@/components/sections/Industries";
import { LANDING_PAGES, getLandingPage } from "@/lib/landing-pages";
import { REGION_ALTERNATES } from "@/lib/alternates";
import { breadcrumbSchema, softwareSchema } from "@/lib/schema";
import { SITE_URL } from "@/lib/site";

export const dynamicParams = false;

const REGION_RELATED = [
  "pos-software",
  "inventory-management-software",
  "accounting-software",
  "erp-software",
  "mobile-shop-software",
  "wholesale-distribution-software",
];

export function generateStaticParams() {
  return LANDING_PAGES.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = getLandingPage(params.slug);
  if (!page) return {};
  const url = `/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: {
      canonical: url,
      ...(page.hreflang ? { languages: REGION_ALTERNATES } : {}),
    },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url: `${SITE_URL}${url}`,
      locale: page.locale ?? "en_US",
    },
    twitter: { title: page.metaTitle, description: page.metaDescription },
  };
}

export default function LandingPageRoute({ params }: { params: { slug: string } }) {
  const page = getLandingPage(params.slug);
  if (!page) notFound();

  const url = `${SITE_URL}/${page.slug}`;
  const international = page.hreflang === "en-US" || page.hreflang === "en-GB";
  const currency = page.showPkr ? "Rs" : page.hreflang === "en-GB" ? "£" : "$";
  // Region pages link to retail-relevant software pages, never to other countries.
  const related =
    page.group === "region"
      ? REGION_RELATED.map((slug) => getLandingPage(slug)!).filter(Boolean)
      : LANDING_PAGES.filter((p) => p.slug !== page.slug && (p.group === page.group || p.group === "product")).slice(0, 6);

  return (
    <>
      <JsonLd
        data={[
          softwareSchema({ name: `Logix Plus ${page.navLabel}`, description: page.metaDescription, url }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: page.navLabel, path: `/${page.slug}` },
          ]),
        ]}
      />
      <Navbar />
      <main>
        <Hero
          eyebrow={page.eyebrow}
          title={page.h1}
          highlight={page.h1Highlight}
          intro={page.intro}
          currency={currency}
          breadcrumb={
            <nav aria-label="Breadcrumb" className="reveal mb-5 flex items-center gap-1.5 text-sm text-slate-400">
              <Link href="/" className="hover:text-white">
                Home
              </Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-300">{page.navLabel}</span>
            </nav>
          }
        />
        {page.trustBar ? <TrustBar items={page.trustBar} /> : <TrustStrip />}
        <PainPoints
          title="If this sounds like your business,"
          highlight="you're not alone"
          pains={page.pains}
          closing={page.closing ?? `Logix Plus ${page.navLabel} was built to fix exactly these problems.`}
        />
        <FeatureGrid
          eyebrow="What you get"
          title="Everything you need,"
          highlight="nothing you don't"
          features={page.features}
          outcomes={page.outcomes}
        />
        {page.included ? <Included {...page.included} currency={currency === "£" ? "£" : "$"} /> : null}
        {page.verticals ? (
          <Industries
            eyebrow="Who it's for"
            title={page.verticals.title}
            highlight={page.verticals.highlight}
            intro=""
            items={page.verticals.items}
          />
        ) : null}
        <HowItWorks />
        <Pricing showPkr={page.showPkr} showGbp={page.hreflang === "en-GB"} />
        <Faq faqs={page.faqs} title={page.faqTitle ?? `${page.navLabel}: common questions`} />

        <section className="border-t border-slate-200 bg-slate-50 py-16" aria-labelledby="related-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="related-heading" className="mb-6 text-xl font-bold text-slate-900">
              Explore more of Logix Plus
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/${r.slug}`}
                    className="group card card-hover flex items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800"
                  >
                    {r.navLabel}
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-blue-600" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <FinalCta showPhone={!international} />
      </main>
      <Footer />
    </>
  );
}
