"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Mail, MessageCircle, Phone, Zap } from "lucide-react";

export default function CTA() {
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
      id="contact"
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-slate-900 overflow-hidden"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
        <div className="blob absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-r from-blue-700/10 to-violet-700/10" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main CTA box */}
        <div className="reveal glass-card p-10 md:p-16 text-center max-w-4xl mx-auto mb-20 border border-blue-500/20 bg-gradient-to-b from-blue-500/5 to-violet-500/5 hover:!transform-none">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-2xl shadow-blue-500/30 mb-6">
            <Zap className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
            Ready to Transform
            <br />
            <span className="gradient-text">Your Business?</span>
          </h2>

          <p className="text-slate-300 text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Join 500+ companies that trust Logix Plus Solutions to run their operations. Get
            started today with full access — no credit card required.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="http://https://app.logixplussolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glow group flex items-center justify-center gap-3 px-10 py-4 rounded-2xl text-base font-bold text-white"
            >
              <Zap className="w-5 h-5" />
              Launch Software Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="mailto:info@logixplussolutions.com"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white border border-white/10 hover:border-blue-400/40 hover:bg-white/5 transition-all"
            >
              <Mail className="w-5 h-5" />
              Get in Touch
            </a>
          </div>
        </div>

        {/* Contact cards */}
        <div className="grid sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
          {[
            {
              icon: Phone,
              label: "Call Us",
              value: "+92 321 1626195",
              href: "tel:+923211626195",
              color: "from-blue-500 to-cyan-500",
            },
            {
              icon: Mail,
              label: "Email Us",
              value: "info@logixplussolutions.com",
              href: "mailto:info@logixplussolutions.com",
              color: "from-violet-500 to-purple-500",
            },
            {
              icon: MessageCircle,
              label: "Live Chat",
              value: "Chat with support",
              href: "#",
              color: "from-emerald-500 to-teal-500",
            },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <a
                key={c.label}
                href={c.href}
                className="reveal glass-card p-6 text-center group"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">
                  {c.label}
                </div>
                <div className="text-white font-medium text-sm">{c.value}</div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
