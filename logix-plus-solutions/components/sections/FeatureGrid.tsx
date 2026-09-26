import { Check } from "lucide-react";
import Icon from "@/components/Icon";
import type { Point } from "@/lib/landing-pages";
import SectionHeading from "./SectionHeading";

export default function FeatureGrid({
  eyebrow,
  title,
  highlight,
  intro,
  features,
  outcomes,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  intro?: string;
  features: Point[];
  outcomes?: string[];
}) {
  return (
    <section id="features" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={eyebrow} title={title} highlight={highlight} intro={intro} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="reveal card card-hover p-7" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-600/20">
                <Icon name={f.icon} className="h-6 w-6" />
              </span>
              <h3 className="mb-2 text-lg font-bold text-slate-900">{f.title}</h3>
              <p className="leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>

        {outcomes?.length ? (
          <div className="reveal mt-12 grid grid-cols-1 gap-4 rounded-2xl bg-ink p-6 sm:p-8 md:grid-cols-3">
            {outcomes.map((o) => (
              <div key={o} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
                  <Check className="h-4 w-4" />
                </span>
                <p className="font-semibold text-white">{o}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
