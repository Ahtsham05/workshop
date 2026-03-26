"use client";

import { useEffect, useRef } from "react";
import { Award, CheckCircle2, Rocket, Shield, Target } from "lucide-react";

const values = [
  { icon: Target, title: "Mission-Driven", desc: "Empowering businesses with intelligent software that removes complexity and drives results." },
  { icon: Shield, title: "Security First", desc: "Enterprise-grade security with end-to-end encryption, regular audits, and 99.9% uptime guarantee." },
  { icon: Rocket, title: "Constant Innovation", desc: "We ship new features weekly, staying ahead of market trends and customer needs." },
  { icon: Award, title: "Quality Obsessed", desc: "Every feature is rigorously tested and refined based on real-world customer feedback." },
];

const reasons = [
  "No per-user pricing — flat, predictable plans",
  "Dedicated onboarding specialist for every client",
  "Local language support (Urdu & English)",
  "Data hosted in Pakistan & internationally",
  "Free migration from legacy systems",
  "White-label options available",
  "Customizable workflows to fit your industry",
  "Regular free product training sessions",
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
    <section id="about" ref={sectionRef} className="relative py-24 lg:py-32 bg-slate-900">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top: Who we are */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
          <div>
            <p className="reveal text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">
              Who We Are
            </p>
            <h2 className="reveal text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight mb-6">
              Built by Operators,
              <br />
              <span className="gradient-text">for Business Owners</span>
            </h2>
            <div className="section-divider reveal !mx-0" />
            <p className="reveal text-slate-300 text-lg leading-relaxed mb-6">
              Logix Plus Solutions was born out of frustration with overpriced, overcomplicated
              enterprise software. We built the platform we always wished existed — one that
              actually understands how real businesses operate.
            </p>
            <p className="reveal text-slate-400 leading-relaxed mb-8">
              Our team of engineers, designers, and business experts work tirelessly to deliver
              software that is powerful enough for large enterprises yet simple enough for small
              businesses. From Karachi to Lahore, from retail to manufacturing — we serve them all.
            </p>

            {/* Why choose us list */}
            <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reasons.map((r) => (
                <div key={r} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300 text-sm">{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual side */}
          <div className="reveal relative">
            <div className="relative glass-card p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-500/20 to-violet-500/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />

              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-2xl shadow-blue-500/30 mb-4">
                  <span className="text-white font-black text-2xl">L+</span>
                </div>
                <h3 className="text-white font-bold text-xl">Logix Plus Solutions</h3>
                <p className="text-slate-400 text-sm mt-1">Software that means business</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { n: "2019", l: "Founded" },
                  { n: "500+", l: "Clients" },
                  { n: "12+", l: "Industries" },
                  { n: "10+", l: "Countries" },
                ].map((s) => (
                  <div key={s.l} className="bg-white/5 rounded-xl p-4 text-center border border-white/5">
                    <div className="stat-number text-2xl">{s.n}</div>
                    <div className="text-slate-400 text-xs mt-1">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 glass-card px-4 py-3 flex items-center gap-3 hover:!transform-none shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Award className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-white text-sm font-bold">Top Rated 2024</div>
                <div className="text-slate-400 text-xs">Business Software Award</div>
              </div>
            </div>
          </div>
        </div>

        {/* Core values */}
        <div className="text-center mb-12">
          <h3 className="reveal text-2xl sm:text-3xl font-bold text-white mb-3">
            Our Core <span className="gradient-text">Values</span>
          </h3>
          <p className="reveal text-slate-400 max-w-xl mx-auto">
            These principles guide every decision we make — from product design to customer support.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {values.map((v, i) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="reveal glass-card p-6 text-center"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h4 className="text-white font-semibold mb-2">{v.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
