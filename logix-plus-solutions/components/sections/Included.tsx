import { ArrowRight, Check } from "lucide-react";
import { PLANS, SIGNUP_URL } from "@/lib/site";
import SectionHeading from "./SectionHeading";

export default function Included({
  title,
  highlight,
  intro,
  items,
  footnote,
  currency = "$",
}: {
  title: string;
  highlight: string;
  intro: string;
  items: string[];
  footnote?: string;
  currency?: "$" | "£";
}) {
  const starter = PLANS[0];
  // Pound figure is an approximation for display; billing is in USD.
  const price = currency === "£" ? `~£${Math.round(starter.priceUsd * 0.78)}` : `$${starter.priceUsd}`;

  return (
    <section id="included" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="No add-on fees" title={title} highlight={highlight} intro={intro} />

        <div className="reveal grid grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-3">
          <div className="bg-ink flex flex-col justify-between p-8 text-white sm:p-10">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-cyan-300">{starter.name} plan</p>
              <p className="mt-4 flex items-end gap-2">
                <span className="text-6xl font-extrabold tracking-tight">{price}</span>
                <span className="mb-2 text-slate-300">/ month</span>
              </p>
              <p className="mt-3 text-slate-300">
                {starter.users} · {starter.branches} · {starter.invoices}
              </p>
            </div>
            <a href={SIGNUP_URL} className="btn btn-brand mt-8 w-full py-4 text-base">
              Start free trial <ArrowRight className="h-5 w-5" />
            </a>
          </div>
          <div className="p-8 sm:p-10 lg:col-span-2">
            <ul className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {items.map((it) => (
                <li key={it} className="flex items-center gap-3 font-medium text-slate-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600 ring-1 ring-green-200">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {it}
                </li>
              ))}
            </ul>
            {footnote ? <p className="mt-8 border-t border-slate-100 pt-5 text-sm text-slate-500">{footnote}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
