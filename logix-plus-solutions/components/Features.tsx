"use client";

import { useEffect, useRef } from "react";
import {
  BookOpen,
  Code2,
  FileStack,
  LayoutTemplate,
  Lock,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

const features = [
  {
    icon: LayoutTemplate,
    title: "Headless & classic CMS",
    description:
      "Strapi, Contentful, Sanity, WordPress in headless mode, and custom editorial workflows — so marketing moves fast without breaking the product.",
  },
  {
    icon: Code2,
    title: "SaaS application engineering",
    description:
      "Multi-tenant patterns, auth, billing hooks, and observability baked in from day one — not bolted on after launch.",
  },
  {
    icon: Server,
    title: "Performance & hosting",
    description:
      "Edge-ready front ends, caching strategies, and infrastructure choices that stand up to GDPR-era scrutiny and traffic spikes.",
  },
  {
    icon: ShieldCheck,
    title: "Security-minded delivery",
    description:
      "Threat modelling basics, dependency hygiene, and reviewable pull requests — documentation your compliance team can actually read.",
  },
  {
    icon: Workflow,
    title: "Design systems & UI kits",
    description:
      "Reusable components and tokens so your brand stays consistent across landing pages, apps, and microsites.",
  },
  {
    icon: FileStack,
    title: "Integrations & APIs",
    description:
      "CRM, ERP, payments, and marketing automation connected through stable APIs — fewer spreadsheets, fewer mistakes.",
  },
  {
    icon: Lock,
    title: "Access control & roles",
    description:
      "Granular permissions for editors, partners, and administrators — especially important for B2B SaaS and member portals.",
  },
  {
    icon: BookOpen,
    title: "Handover you can trust",
    description:
      "Architecture notes, runbooks, and walkthrough sessions so your team or another agency can maintain the work.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted workflows (optional)",
    description:
      "Where it adds real value — content assist, internal copilots, and retrieval pipelines — introduced with clear boundaries.",
  },
];

export default function Features() {
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
    <section id="expertise" ref={sectionRef} className="relative py-20 lg:py-28 bg-white border-y border-stone-200">
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14 md:mb-16 max-w-2xl">
          <p className="reveal text-sm font-semibold uppercase tracking-[0.12em] text-teal-800 mb-3">
            Expertise
          </p>
          <h2 className="reveal font-serif text-3xl sm:text-4xl md:text-[2.5rem] font-semibold text-stone-900 tracking-tight mb-4">
            What clients hire us to deliver
          </h2>
          <div className="section-rule reveal mb-5" />
          <p className="reveal text-stone-600 text-lg leading-relaxed">
            Product-led organisations commission us for CMS roll-outs, customer-facing SaaS, and
            high-trust websites — with engineering discipline that matches procurement expectations
            in European markets.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="reveal surface-card p-6 md:p-7"
                style={{ transitionDelay: `${i * 35}ms` }}
              >
                <div className="w-10 h-10 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center mb-4 text-stone-800">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <h3 className="text-stone-900 font-semibold text-base mb-2">{feature.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
