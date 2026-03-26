"use client";

import { useEffect, useRef } from "react";
import {
  BarChart3,
  Box,
  Calculator,
  ClipboardList,
  Clock,
  FileText,
  Globe,
  Lock,
  Smartphone,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description:
      "Gain powerful insights with live dashboards, custom reports, and AI-driven forecasts to make smarter business decisions.",
    color: "from-blue-500 to-cyan-500",
    glow: "group-hover:shadow-blue-500/20",
  },
  {
    icon: Box,
    title: "Inventory Management",
    description:
      "Track stock levels, automate reorders, manage barcodes, and eliminate stockouts with our intelligent inventory system.",
    color: "from-violet-500 to-purple-500",
    glow: "group-hover:shadow-violet-500/20",
  },
  {
    icon: FileText,
    title: "Invoicing & Billing",
    description:
      "Create professional invoices, manage payments, track receivables, and automate reminders — all in one click.",
    color: "from-emerald-500 to-teal-500",
    glow: "group-hover:shadow-emerald-500/20",
  },
  {
    icon: Users,
    title: "HR Management",
    description:
      "Streamline hiring, attendance, payroll, leaves, and performance reviews in a unified HR control center.",
    color: "from-orange-500 to-amber-500",
    glow: "group-hover:shadow-orange-500/20",
  },
  {
    icon: Calculator,
    title: "Accounting & Finance",
    description:
      "Full double-entry accounting with automated ledgers, trial balance, P&L statements, and tax compliance built-in.",
    color: "from-pink-500 to-rose-500",
    glow: "group-hover:shadow-pink-500/20",
  },
  {
    icon: ClipboardList,
    title: "Purchase Orders",
    description:
      "Manage vendors, create POs, track deliveries, and reconcile invoices seamlessly from requisition to payment.",
    color: "from-sky-500 to-indigo-500",
    glow: "group-hover:shadow-sky-500/20",
  },
  {
    icon: Smartphone,
    title: "Mobile Ready",
    description:
      "Access your business from anywhere. Our platform is fully responsive and works on every device and screen size.",
    color: "from-lime-500 to-green-500",
    glow: "group-hover:shadow-lime-500/20",
  },
  {
    icon: Lock,
    title: "Role-Based Access",
    description:
      "Granular permissions and RBAC ensure every team member sees only what they need — keeping your data secure.",
    color: "from-red-500 to-orange-500",
    glow: "group-hover:shadow-red-500/20",
  },
  {
    icon: Globe,
    title: "Multi-Branch Support",
    description:
      "Manage multiple branches, warehouses, or franchises from a single account with consolidated reporting.",
    color: "from-teal-500 to-cyan-500",
    glow: "group-hover:shadow-teal-500/20",
  },
  {
    icon: Zap,
    title: "Automation Engine",
    description:
      "Set up smart triggers and workflows to automate repetitive tasks — from alerts to document generation.",
    color: "from-yellow-500 to-amber-500",
    glow: "group-hover:shadow-yellow-500/20",
  },
  {
    icon: TrendingUp,
    title: "Sales & CRM",
    description:
      "Track leads, manage customers, forecast sales, and nurture relationships with an integrated CRM module.",
    color: "from-blue-600 to-violet-600",
    glow: "group-hover:shadow-blue-600/20",
  },
  {
    icon: Clock,
    title: "24/7 Support",
    description:
      "Our dedicated support team is always available via chat, email, or phone to help you resolve issues fast.",
    color: "from-purple-500 to-pink-500",
    glow: "group-hover:shadow-purple-500/20",
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
    <section id="features" ref={sectionRef} className="relative py-24 lg:py-32 bg-slate-900">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="reveal inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full text-sm font-medium text-violet-300 mb-4 hover:!transform-none">
            <Zap className="w-3.5 h-3.5" />
            Packed with powerful features
          </div>
          <h2 className="reveal text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
            Everything Your Business
            <br />
            <span className="gradient-text">Needs in One Place</span>
          </h2>
          <div className="section-divider reveal" />
          <p className="reveal max-w-2xl mx-auto text-slate-400 text-lg">
            Stop juggling between multiple tools. Logix Plus Solutions consolidates all your
            critical business operations into one intelligent, seamless platform.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="reveal group glass-card p-6 cursor-default"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                <div
                  className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg ${feature.glow} transition-shadow duration-300`}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-white font-semibold text-base mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
