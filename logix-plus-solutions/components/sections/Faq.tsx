import { Plus } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import { faqSchema } from "@/lib/schema";
import type { Faq as FaqItem } from "@/lib/site";
import SectionHeading from "./SectionHeading";

export default function Faq({ faqs, title = "Questions business owners ask" }: { faqs: FaqItem[]; title?: string }) {
  return (
    <section id="faq" className="bg-white py-20 lg:py-28">
      <JsonLd data={faqSchema(faqs)} />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="FAQ" title={title} />
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="faq reveal group card overflow-hidden open:border-blue-200 open:shadow-sm">
              <summary className="flex items-center justify-between gap-4 px-6 py-5 text-left">
                <h3 className="text-base font-bold text-slate-900 sm:text-lg">{f.q}</h3>
                <span className="faq-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-transform duration-200">
                  <Plus className="h-4 w-4" />
                </span>
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
