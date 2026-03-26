"use client";

import { useEffect, useRef } from "react";
import { Quote, Star } from "lucide-react";

const testimonials = [
  {
    name: "Asad Raza",
    role: "CEO, Al-Raza Traders",
    company: "Wholesale Distribution",
    avatar: "AR",
    rating: 5,
    text: "Logix Plus Solutions completely transformed how we manage our inventory. We went from tracking everything in Excel to having real-time stock levels across 3 warehouses. Best investment we made.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    name: "Fatima Sheikh",
    role: "CFO, Nova Retail Chain",
    company: "Retail & POS",
    avatar: "FS",
    rating: 5,
    text: "The accounting module is exceptional. Month-end closing that used to take 5 days now takes a few hours. The automated reconciliation alone saved us 40 hours per month.",
    color: "from-violet-500 to-purple-500",
  },
  {
    name: "Imran Malik",
    role: "HR Director, Nexgen Manufacturing",
    company: "Manufacturing",
    avatar: "IM",
    rating: 5,
    text: "Managing 200+ employees was a nightmare before Logix. Now payroll, attendance, and leave approvals are completely automated. The support team is always responsive and helpful.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    name: "Sadia Khan",
    role: "Owner, Sadia's Boutique Network",
    company: "Fashion Retail",
    avatar: "SK",
    rating: 5,
    text: "I was skeptical at first but the team made migration painless. Within 2 weeks my staff was fully trained. Sales reporting and CRM features are simply outstanding.",
    color: "from-orange-500 to-amber-500",
  },
  {
    name: "Bilal Ahmed",
    role: "Operations Manager, CargoX Logistics",
    company: "Logistics",
    avatar: "BA",
    rating: 5,
    text: "The multi-branch feature is a game changer for us. We manage 7 city offices from one dashboard. Reporting that used to take a week is generated in minutes now.",
    color: "from-pink-500 to-rose-500",
  },
  {
    name: "Zara Hussain",
    role: "MD, MedPlus Pharmaceuticals",
    company: "Pharmaceutical",
    avatar: "ZH",
    rating: 5,
    text: "Expiry date tracking, FIFO inventory, and regulatory compliance reporting — Logix handles all our pharma-specific requirements. Highly recommend for any healthcare business.",
    color: "from-sky-500 to-indigo-500",
  },
];

export default function Testimonials() {
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
    <section
      id="testimonials"
      ref={sectionRef}
      className="relative py-24 lg:py-32 animated-bg overflow-hidden"
    >
      <div className="blob absolute top-1/4 right-0 w-80 h-80 bg-blue-700" />
      <div className="blob absolute bottom-1/4 left-0 w-72 h-72 bg-violet-700" style={{ animationDelay: "3s" }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="reveal text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">
            Customer Stories
          </p>
          <h2 className="reveal text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
            Loved by Businesses
            <br />
            <span className="gradient-text">Across Every Industry</span>
          </h2>
          <div className="section-divider reveal" />
          <p className="reveal max-w-xl mx-auto text-slate-400 text-lg">
            Don't take our word for it. Here's what real business owners say after switching to
            Logix Plus Solutions.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className="reveal glass-card p-6 flex flex-col justify-between"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {/* Quote icon */}
              <Quote className="w-8 h-8 text-blue-500/40 mb-4" />

              {/* Stars */}
              <div className="flex gap-1 mb-3">
                {Array.from({ length: t.rating }).map((_, s) => (
                  <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>

              {/* Text */}
              <p className="text-slate-300 text-sm leading-relaxed flex-1 mb-6">"{t.text}"</p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center flex-shrink-0 shadow-lg`}
                >
                  <span className="text-white text-xs font-bold">{t.avatar}</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{t.name}</div>
                  <div className="text-slate-400 text-xs">{t.role}</div>
                  <div className="text-blue-400 text-xs font-medium">{t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Overall rating banner */}
        <div className="reveal mt-12 glass-card p-6 max-w-2xl mx-auto text-center hover:!transform-none">
          <div className="flex items-center justify-center gap-1 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-6 h-6 text-amber-400 fill-amber-400" />
            ))}
          </div>
          <p className="text-white font-bold text-xl mb-1">4.9/5 Average Rating</p>
          <p className="text-slate-400 text-sm">Based on 500+ verified customer reviews</p>
        </div>
      </div>
    </section>
  );
}
