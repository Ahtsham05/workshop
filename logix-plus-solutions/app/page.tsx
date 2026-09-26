import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Hero from "@/components/sections/Hero";
import TrustStrip from "@/components/sections/TrustStrip";
import PainPoints from "@/components/sections/PainPoints";
import Modules from "@/components/sections/Modules";
import Industries from "@/components/sections/Industries";
import HowItWorks from "@/components/sections/HowItWorks";
import Comparison from "@/components/sections/Comparison";
import Pricing from "@/components/sections/Pricing";
import Faq from "@/components/sections/Faq";
import FinalCta from "@/components/sections/FinalCta";
import { softwareSchema } from "@/lib/schema";
import { HOME_FAQS, SITE_URL } from "@/lib/site";
import { REGION_ALTERNATES } from "@/lib/alternates";
import type { Point } from "@/lib/landing-pages";

const TITLE = "ERP, POS & Accounting Software for Small Business | Logix Plus";
const DESCRIPTION =
  "Logix Plus is all-in-one cloud ERP & POS software: fast billing, inventory, accounting, HR and multi-branch reports for shops, wholesalers, restaurants and schools. Free 14-day trial.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "erp software",
    "pos software",
    "accounting software",
    "inventory management software",
    "billing software",
    "cloud erp for small business",
    "point of sale system",
    "retail pos",
    "pos system for small business usa",
    "pos system uk",
    "epos uk",
  ],
  alternates: {
    canonical: "/",
    languages: REGION_ALTERNATES,
  },
  openGraph: { title: TITLE, description: DESCRIPTION, url: SITE_URL },
  twitter: { title: TITLE, description: DESCRIPTION },
};

const pains: Point[] = [
  { icon: "wallet", title: "The cash never matches", desc: "Every night the drawer is short or over, and nobody can say which sale, refund or expense caused it." },
  { icon: "eyeoff", title: "You don't know your real profit", desc: "Sales look good, but after purchases, expenses and credit you can't tell if you actually made money." },
  { icon: "package", title: "Stock goes missing or runs out", desc: "Best sellers run out without warning while slow items tie up cash on the shelves." },
  { icon: "book", title: "Customers owe you — but how much?", desc: "Customer credit lives in a notebook or spreadsheet. Balances get disputed and payments are forgotten." },
  { icon: "userx", title: "Staff mistakes you can't prove", desc: "Wrong prices, unapproved discounts and deleted bills leave no trail to follow." },
  { icon: "clock", title: "Hours of paperwork every night", desc: "Totalling bills, updating Excel and writing up accounts after a full day of work." },
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={softwareSchema({ description: DESCRIPTION, url: SITE_URL })} />
      <Navbar />
      <main>
        <Hero
          eyebrow="ERP · POS · Accounting — one simple system"
          title="Stop running your business on registers, Excel and"
          highlight="guesswork."
          intro="Logix Plus is the all-in-one ERP and POS software that bills customers in seconds, tracks every item of stock, keeps your accounts up to date and shows your real profit — for shops, wholesalers, restaurants and schools."
        />
        <TrustStrip />
        <PainPoints
          pains={pains}
          intro="These problems cost small businesses money every single day — quietly, and usually without anyone noticing until it's too late."
          closing="Logix Plus fixes every one of these in one system your whole team can use from day one."
        />
        <Modules />
        <Industries />
        <HowItWorks />
        <Comparison />
        <Pricing />
        <Faq faqs={HOME_FAQS} />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
