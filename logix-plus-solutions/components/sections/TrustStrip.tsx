import { Globe2, Languages, MonitorSmartphone, Timer } from "lucide-react";
import { PLANS, TRIAL_DAYS } from "@/lib/site";

const businesses = [
  "Supermarkets",
  "Grocery & convenience stores",
  "Wholesalers",
  "Distributors",
  "Restaurants & cafés",
  "Mobile phone shops",
  "Schools & academies",
  "Garment stores",
  "Hardware stores",
  "Electronics shops",
  "Beauty & cosmetics stores",
  "Auto parts stores",
  "Small factories",
  "Service businesses",
];

export default function TrustStrip() {
  const facts = [
    { icon: Timer, v: `${TRIAL_DAYS}-day`, l: "free trial" },
    { icon: MonitorSmartphone, v: "Web + Windows", l: "and mobile" },
    { icon: Languages, v: "Multi-language", l: "English, Arabic, Urdu, Hindi" },
    { icon: Globe2, v: `From $${Math.min(...PLANS.map((p) => p.priceUsd))}`, l: "per month" },
  ];

  return (
    <section className="border-b border-slate-200 bg-white" aria-label="Who Logix Plus is for">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {facts.map(({ icon: I, v, l }) => (
            <div key={l} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <I className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-slate-900 sm:text-lg">{v}</p>
                <p className="text-sm text-slate-500">{l}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden border-t border-slate-100 bg-slate-50 py-4">
        <div className="marquee flex w-max gap-10 whitespace-nowrap text-sm font-semibold text-slate-400">
          {[...businesses, ...businesses].map((b, i) => (
            <span key={i} aria-hidden={i >= businesses.length}>
              {b}
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-50" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-50" />
      </div>
    </section>
  );
}
