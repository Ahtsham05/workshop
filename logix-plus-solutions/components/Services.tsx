"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, BarChart3, Box, Calculator, Users } from "lucide-react";

const services = [
  {
    icon: Box,
    title: "Inventory & POS",
    tagline: "Never run out of stock",
    description:
      "Our intelligent inventory system tracks stock in real-time, manages barcodes, triggers auto-reorder alerts, and integrates directly with your POS terminals for lightning-fast transactions.",
    features: ["Barcode scanning", "Auto reorder alerts", "Multi-warehouse", "POS integration"],
    color: "from-blue-500 to-cyan-400",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
    accent: "text-blue-400",
  },
  {
    icon: Calculator,
    title: "Accounting Suite",
    tagline: "Financial clarity at every step",
    description:
      "Full-featured double-entry accounting with automated journal entries, chart of accounts, tax management, and instant financial statements — no accountant experience required.",
    features: ["Double-entry ledger", "Tax management", "P&L statements", "Balance sheet"],
    color: "from-violet-500 to-purple-400",
    bg: "bg-violet-500/5",
    border: "border-violet-500/20",
    accent: "text-violet-400",
  },
  {
    icon: Users,
    title: "Human Resources",
    tagline: "Empower your people",
    description:
      "End-to-end HR management covering recruitment, onboarding, attendance tracking, payroll processing, leave management, and performance appraisals in one unified system.",
    features: ["Payroll automation", "Attendance tracking", "Leave management", "Performance KPIs"],
    color: "from-emerald-500 to-teal-400",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
    accent: "text-emerald-400",
  },
  {
    icon: BarChart3,
    title: "Business Intelligence",
    tagline: "Data-driven decisions",
    description:
      "Transform raw business data into actionable intelligence with custom dashboards, automated reports, trend analysis, and predictive insights tailored to your industry.",
    features: ["Custom dashboards", "Automated reports", "Trend analysis", "Export to Excel/PDF"],
    color: "from-orange-500 to-amber-400",
    bg: "bg-orange-500/5",
    border: "border-orange-500/20",
    accent: "text-orange-400",
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
      className="relative py-24 lg:py-32 animated-bg overflow-hidden"
    >
      <div className="blob absolute -top-20 right-0 w-96 h-96 bg-violet-700" />
      <div className="blob absolute bottom-0 left-10 w-80 h-80 bg-blue-700" style={{ animationDelay: "3s" }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="reveal text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">
            Our Core Services
          </p>
          <h2 className="reveal text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
            Modular Solutions That
            <br />
            <span className="gradient-text">Grow With You</span>
          </h2>
          <div className="section-divider reveal" />
          <p className="reveal max-w-xl mx-auto text-slate-400 text-lg">
            Pick the modules you need today and expand as your business grows — no complicated
            migrations, no vendor lock-in.
          </p>
        </div>

        {/* Services grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {services.map((service, i) => {
            const Icon = service.icon;
            return (
              <div
                key={service.title}
                className={`reveal glass-card p-8 ${service.bg} border ${service.border}`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-start gap-5">
                  <div
                    className={`flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center shadow-xl`}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-widest ${service.accent} mb-1`}>
                      {service.tagline}
                    </p>
                    <h3 className="text-xl font-bold text-white mb-3">{service.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-5">
                      {service.description}
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {service.features.map((f) => (
                        <li
                          key={f}
                          className={`text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/8 ${service.accent}`}
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-white/5 flex justify-end">
                  <a
                    href="http://https://app.logixplussolutions.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 text-sm font-semibold ${service.accent} hover:opacity-80 transition-opacity group`}
                  >
                    Explore module
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
