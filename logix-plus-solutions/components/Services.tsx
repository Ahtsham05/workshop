"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Globe, Layers, Rocket } from "lucide-react";

const services = [
  {
    icon: Layers,
    title: "CMS & content platforms",
    tagline: "Editorial freedom, technical guardrails",
    description:
      "We implement and extend content platforms so your team can publish and experiment safely — from multilingual corporate sites to documentation portals and partner extranets.",
    features: ["Information architecture", "Editor UX & previews", "Migration from legacy CMS", "SEO & structured data"],
  },
  {
    icon: Rocket,
    title: "SaaS product builds",
    tagline: "From validated concept to recurring revenue",
    description:
      "We ship B2B and vertical SaaS with clear tenancy boundaries, subscription-aware UX, and instrumentation your investors expect — without sacrificing maintainability.",
    features: ["Roadmap & milestones", "Auth & organisations", "Billing-ready architecture", "Staging & release cadence"],
  },
  {
    icon: Globe,
    title: "Websites & campaign engines",
    tagline: "Conversion-focused, fast, accessible",
    description:
      "Marketing sites that load quickly, meet accessibility expectations, and integrate with your stack — whether you need a flagship European presence or a portfolio of sector landing pages.",
    features: ["Performance budgets", "WCAG-minded patterns", "Analytics & consent", "Component libraries"],
  },
];

export default function Services() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.1 }
    );
    sectionRef.current?.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative py-20 lg:py-28 bg-stone-100 border-b border-stone-200"
    >
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14 md:mb-16 text-center max-w-2xl mx-auto">
          <p className="reveal text-sm font-semibold uppercase tracking-[0.12em] text-teal-800 mb-3">
            Engagement models
          </p>
          <h2 className="reveal font-serif text-3xl sm:text-4xl md:text-[2.5rem] font-semibold text-stone-900 tracking-tight mb-4">
            Three ways teams work with us
          </h2>
          <div className="section-rule reveal mx-auto mb-5" />
          <p className="reveal text-stone-600 text-lg leading-relaxed">
            Each engagement starts with a short discovery phase: goals, constraints, and success
            metrics — so proposals are fixed-scope where possible and transparent when research is
            required.
          </p>
        </div>

        <div className="grid md:grid-cols-1 gap-6 max-w-3xl mx-auto md:max-w-none">
          {services.map((service, i) => {
            const Icon = service.icon;
            return (
              <article
                key={service.title}
                className="reveal surface-card p-8 md:p-10 md:flex md:gap-10 md:items-start"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-stone-900 text-white flex items-center justify-center mb-6 md:mb-0">
                  <Icon className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-800 mb-1">
                    {service.tagline}
                  </p>
                  <h3 className="font-serif text-xl md:text-2xl font-semibold text-stone-900 mb-3">
                    {service.title}
                  </h3>
                  <p className="text-stone-600 text-sm md:text-base leading-relaxed mb-6">
                    {service.description}
                  </p>
                  <ul className="flex flex-wrap gap-2 mb-6">
                    {service.features.map((f) => (
                      <li
                        key={f}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#contact"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-teal-900 hover:text-teal-700 transition-colors group"
                  >
                    Request a tailored estimate
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
