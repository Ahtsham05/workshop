/**
 * Single source of truth for contact details, links and plan prices shown on the site.
 * Plan prices mirror server/src/config/billing.js DEFAULT_PLANS — the live prices are editable
 * in System Admin → Plans & Settings, so update this file if they change there.
 */

export const SITE_URL = "https://logixplussolutions.com";
export const APP_URL = "https://app.logixplussolutions.com";
export const SIGNUP_URL = `${APP_URL}/sign-up`;
export const LOGIN_URL = `${APP_URL}/sign-in`;

export const BRAND = "Logix Plus";
export const COMPANY = "Logix Plus Solutions";

export const PHONE_DISPLAY = "+92 321 1626195";
export const PHONE_TEL = "+923211626195";
export const EMAIL = "info@logixplussolutions.com";
export const WHATSAPP_NUMBER = "923211626195";

export function whatsappLink(message = "Hi, I want a free demo of Logix Plus ERP & POS software.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const TRIAL_DAYS = 14;

/** PKR shown for Pakistani buyers, from BillingSettings.pkrPerUsd. */
export const PKR_PER_USD = 280;

export type Plan = {
  key: string;
  name: string;
  priceUsd: number;
  tagline: string;
  users: string;
  branches: string;
  invoices: string;
  highlights: string[];
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    priceUsd: 10,
    tagline: "For a single store getting organized",
    users: "3 users",
    branches: "1 branch",
    invoices: "1,000 invoices / month",
    highlights: [
      "POS billing & invoicing",
      "Inventory & stock alerts",
      "Barcode labels & scanning",
      "Cash book & cash register",
      "Sales, stock & daily reports",
      "School management module",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    priceUsd: 15,
    tagline: "Accounts, HR and deeper reports",
    users: "10 users",
    branches: "2 branches",
    invoices: "5,000 invoices / month",
    popular: true,
    highlights: [
      "Everything in Starter",
      "Full accounting: ledgers, wallets, banks",
      "Customer & supplier balances",
      "Profit & loss, ROI reports",
      "HR & payroll",
      "Mobile shop: repairs, IMEI, load",
    ],
  },
  {
    key: "business",
    name: "Business",
    priceUsd: 30,
    tagline: "Multi-branch control for growing teams",
    users: "25 users",
    branches: "5 branches",
    invoices: "Unlimited invoices",
    highlights: [
      "Everything in Growth",
      "Multi-branch stock & transfers",
      "Roles & permissions per staff",
      "Advanced product analytics",
      "Branch-wise comparison reports",
      "Push products & prices to all branches",
    ],
  },
];

export function pkr(usd: number) {
  return `Rs ${(usd * PKR_PER_USD).toLocaleString("en-US")}`;
}

export type Faq = { q: string; a: string };

export const HOME_FAQS: Faq[] = [
  {
    q: "What is Logix Plus?",
    a: "Logix Plus is cloud ERP and POS software for small and medium businesses. It combines point of sale billing, inventory, purchases, accounting, HR and reports in one system, and runs in the browser, on Windows desktop and on mobile.",
  },
  {
    q: "Is there a free trial?",
    a: `Yes. Every new account gets a ${TRIAL_DAYS}-day free trial with sample data already loaded, so you can try billing, stock and reports straight away. No credit card is needed to start.`,
  },
  {
    q: "Which businesses can use it?",
    a: "Retail shops, supermarkets, wholesalers and distributors, restaurants and cafés, mobile phone shops, schools, service businesses and small factories. You choose your business type during sign-up and the relevant modules are switched on.",
  },
  {
    q: "Does it work without internet?",
    a: "The Windows desktop app keeps billing when your internet drops. Invoices are saved on the computer and synced to the cloud automatically once the connection is back.",
  },
  {
    q: "Can I import my existing products and customers?",
    a: "Yes. Upload an Excel sheet of products, customers or suppliers. Logix Plus checks every row, tells you which rows have problems and imports the rest, so you do not have to type everything again.",
  },
  {
    q: "Does it handle VAT, GST and sales tax?",
    a: "Yes. You can set tax rates per product and per customer or supplier, and tax is calculated on invoices and purchases automatically. It works for US sales tax, UK VAT and GST setups.",
  },
  {
    q: "How do I pay for a subscription?",
    a: "Plans are billed monthly by credit or debit card through a secure checkout. There are no contracts or setup fees, and you can cancel at any time from your account.",
  },
  {
    q: "What happens to my data if I stop paying?",
    a: "Your data is never deleted when a plan ends. The account switches to read-only, so you can still view and export all your records, and everything unlocks again as soon as you renew.",
  },
  {
    q: "Which languages does it support?",
    a: "Logix Plus is available in English, Arabic, Urdu and Hindi, and Arabic uses a right-to-left layout. Each user can pick their own language, so your team and your customers can each work in the language they know best.",
  },
];
