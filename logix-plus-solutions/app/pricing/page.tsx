import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Pricing from "@/components/sections/Pricing";
import Comparison from "@/components/sections/Comparison";
import Faq from "@/components/sections/Faq";
import FinalCta from "@/components/sections/FinalCta";
import { breadcrumbSchema, softwareSchema } from "@/lib/schema";
import { HOME_FAQS, PLANS, SITE_URL, TRIAL_DAYS } from "@/lib/site";

const prices = PLANS.map((p) => `$${p.priceUsd}`).join(", ");
const TITLE = "Pricing — ERP & POS Software Plans | Logix Plus";
const DESCRIPTION = `Logix Plus plans at ${prices} per month . POS, inventory and reports on every plan. ${TRIAL_DAYS}-day free trial, no card needed.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/pricing` },
  twitter: { title: TITLE, description: DESCRIPTION },
};

const pricingFaqs = [
  HOME_FAQS.find((f) => f.q.startsWith("Is there a free trial"))!,
  HOME_FAQS.find((f) => f.q.startsWith("How do I pay"))!,
  HOME_FAQS.find((f) => f.q.startsWith("What happens to my data"))!,
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrades apply immediately. Downgrades take effect at the end of the period you've paid for, and nothing is deleted — you just can't add more than the lower plan allows.",
  },
  {
    q: "Are there setup or hidden fees?",
    a: "No. You pay the monthly plan price only. Help with setup and importing your products is included.",
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          softwareSchema({ description: DESCRIPTION, url: `${SITE_URL}/pricing` }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        ]}
      />
      <Navbar alwaysSolid />
      <main className="pt-16 lg:pt-[4.5rem]">
        <Pricing headingLevel={1} />
        <Comparison />
        <Faq faqs={pricingFaqs} title="Pricing questions" />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
