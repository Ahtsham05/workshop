"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Calendar, Globe2, Layers } from "lucide-react";

const stats = [
  { value: "120+", label: "Shipped projects", icon: Layers },
  { value: "EU & UK", label: "Typical clients", icon: Globe2 },
  { value: "2–8 wk", label: "Discovery → MVP", icon: Calendar },
];

export default function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    const reveals = heroRef.current?.querySelectorAll(".reveal");
    reveals?.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="home"
      ref={heroRef}
      className="relative min-h-screen flex flex-col justify-center overflow-hidden hero-panel"
    >
      <div
        className="pointer-events-none absolute inset-0 grid-pattern-light opacity-40"
        aria-hidden
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-24 md:pb-28">
        <div className="max-w-3xl">
          <p className="reveal text-sm font-semibold uppercase tracking-[0.12em] text-teal-800 mb-5">
            Digital product & web studio
          </p>

          <h1 className="reveal font-serif text-4xl sm:text-5xl md:text-[3.25rem] font-semibold tracking-tight text-stone-900 leading-[1.12] mb-6">
            CMS platforms, SaaS products, and{" "}
            <span className="gradient-text">enterprise-grade websites</span>
          </h1>

          <p className="reveal text-lg md:text-xl text-stone-600 leading-relaxed mb-10 max-w-2xl">
            We partner with founders and marketing teams who need clarity, not chaos: documented
            architecture, predictable milestones, and code your internal team can inherit — aligned
            with how serious European organisations prefer to buy technology.
          </p>

          <div className="reveal flex flex-col sm:flex-row gap-3 sm:items-center mb-14">
            <a
              href="#contact"
              className="btn-primary group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg text-base"
            >
              Discuss your brief
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="#expertise"
              className="btn-outline inline-flex items-center justify-center px-7 py-3.5 rounded-lg text-base"
            >
              See how we work
            </a>
          </div>

          <div className="reveal grid sm:grid-cols-3 gap-4 max-w-2xl border-t border-stone-200 pt-10">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex gap-3 items-start">
                  <div className="mt-0.5 rounded-md bg-stone-200/80 p-2 text-stone-700">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="stat-number text-xl md:text-2xl">{stat.value}</div>
                    <div className="text-sm text-stone-500 font-medium">{stat.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
