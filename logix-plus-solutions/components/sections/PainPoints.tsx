import { ArrowDown } from "lucide-react";
import Icon from "@/components/Icon";
import type { Point } from "@/lib/landing-pages";
import SectionHeading from "./SectionHeading";

export default function PainPoints({
  title = "Running a business shouldn't feel like",
  highlight = "this",
  intro,
  pains,
  closing,
}: {
  title?: string;
  highlight?: string;
  intro?: string;
  pains: Point[];
  closing: string;
}) {
  return (
    <section id="problems" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Sound familiar?" title={title} highlight={highlight} intro={intro} />

        <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${pains.length > 4 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {pains.map((p, i) => (
            <div
              key={p.title}
              className="reveal card p-6"
              style={{ transitionDelay: `${(i % 4) * 60}ms` }}
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
                <Icon name={p.icon} className="h-5 w-5" />
              </span>
              <h3 className="mb-2 text-lg font-bold text-slate-900">{p.title}</h3>
              <p className="text-[0.95rem] leading-relaxed text-slate-600">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="reveal mx-auto mt-14 flex max-w-2xl flex-col items-center text-center">
          <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
            <ArrowDown className="h-5 w-5" />
          </span>
          <p className="text-xl font-bold text-slate-900 sm:text-2xl">{closing}</p>
        </div>
      </div>
    </section>
  );
}
