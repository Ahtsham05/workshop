"use client";

import { useEffect, useRef } from "react";
import { Award, CheckCircle2, Handshake, Scale, Sparkles } from "lucide-react";

const values = [
  {
    icon: Scale,
    title: "Proportionate decisions",
    desc: "We recommend technology that fits governance and budget — not the loudest framework on social media.",
  },
  {
    icon: Handshake,
    title: "Transparent collaboration",
    desc: "Weekly checkpoints, shared trackers, and honest trade-offs so stakeholders stay aligned across time zones.",
  },
  {
    icon: Sparkles,
    title: "Craft without ego",
    desc: "Interfaces and APIs are refined until they are explainable — because maintainability outlasts launch-day hype.",
  },
  {
    icon: Award,
    title: "Long-term fit",
    desc: "We architect for handover: your in-house team, a future partner, or an extended engagement with us.",
  },
];

const reasons = [
  "Fixed discovery workshops before we write code",
  "Written statements of work with explicit acceptance criteria",
  "English / Urdu communication; EU-friendly contracting options",
  "Source control, CI, and environments you can audit",
  "WCAG- and performance-minded front ends by default",
  "Post-launch support windows with clear response times",
  "No lock-in: you own the repository and documentation",
  "Optional retainers for iteration after go-live",
];

export default function About() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.1 }
    );
    sectionRef.current?.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="about" ref={sectionRef} className="relative py-20 lg:py-28 bg-white">
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-start mb-20 md:mb-24">
          <div>
            <p className="reveal text-sm font-semibold uppercase tracking-[0.12em] text-teal-800 mb-3">
              Studio
            </p>
            <h2 className="reveal font-serif text-3xl sm:text-4xl md:text-[2.5rem] font-semibold text-stone-900 leading-tight mb-5">
              Built for organisations that buy software{" "}
              <span className="italic text-teal-900 font-normal">the European way</span>
            </h2>
            <div className="section-rule reveal mb-6" />
            <p className="reveal text-stone-600 text-lg leading-relaxed mb-5">
              Logix Plus Solutions is a senior-led engineering studio. We sit alongside founders,
              marketing directors, and IT leads — translating ambition into roadmaps, prototypes,
              and production systems that procurement and engineering can both stand behind.
            </p>
            <p className="reveal text-stone-600 leading-relaxed mb-8">
              Whether you are headquartered in the EU, scaling into Europe from elsewhere, or serving
              European customers from Pakistan and the Gulf, we align delivery with serious vendor
              hygiene: documentation, security basics, and respectful communication.
            </p>

            <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reasons.map((r) => (
                <div key={r} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700 text-sm leading-snug">{r}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="reveal lg:sticky lg:top-28">
            <div className="surface-card p-8 md:p-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-lg bg-stone-900 text-white flex items-center justify-center font-serif text-lg font-semibold">
                  L+
                </div>
                <div>
                  <h3 className="text-stone-900 font-semibold text-lg">Logix Plus Solutions</h3>
                  <p className="text-stone-500 text-sm">CMS · SaaS · Web</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {[
                  { n: "2019", l: "Founded" },
                  { n: "120+", l: "Projects" },
                  { n: "15+", l: "Sectors" },
                  { n: "EU", l: "Typical market" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-center"
                  >
                    <div className="stat-number text-2xl">{s.n}</div>
                    <div className="text-stone-500 text-xs font-medium mt-1">{s.l}</div>
                  </div>
                ))}
              </div>

              <p className="text-stone-600 text-sm leading-relaxed border-t border-stone-200 pt-6">
                We are intentionally small: every project is led by people who have shipped
                high-stakes software before — not passed through an anonymous account team.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mb-10 max-w-xl mx-auto">
          <h3 className="reveal font-serif text-2xl sm:text-3xl font-semibold text-stone-900 mb-2">
            How we show up
          </h3>
          <p className="reveal text-stone-600 text-sm md:text-base">
            Values that map to the way professional services are bought in European markets.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {values.map((v, i) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="reveal surface-card p-6 text-left"
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <div className="w-10 h-10 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center mb-4 text-stone-800">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <h4 className="text-stone-900 font-semibold mb-2">{v.title}</h4>
                <p className="text-stone-600 text-sm leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
