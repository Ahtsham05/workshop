"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";

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
      className="relative py-20 lg:py-28 bg-white"
    >
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="reveal surface-card p-10 md:p-14 text-center max-w-3xl mx-auto mb-16 border-stone-200">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-teal-800 mb-3">
            Next step
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-[2.5rem] font-semibold text-stone-900 mb-4 tracking-tight">
            Tell us about your CMS, SaaS, or website initiative
          </h2>
          <p className="text-stone-600 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Share context — timeline, constraints, and what success looks like. We reply within two
            business days with honest fit feedback and, where appropriate, a proposal outline.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:info@logixplussolutions.com?subject=Project%20enquiry%20%E2%80%94%20Logix%20Plus"
              className="btn-primary group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg text-base"
            >
              <Mail className="w-5 h-5" />
              Email the studio
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://app.logixplussolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-lg text-base"
            >
              Product login
            </a>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            {
              icon: Phone,
              label: "Phone",
              value: "+92 321 1626195",
              href: "tel:+923211626195",
            },
            {
              icon: Mail,
              label: "Email",
              value: "info@logixplussolutions.com",
              href: "mailto:info@logixplussolutions.com",
            },
            {
              icon: MessageCircle,
              label: "WhatsApp",
              value: "Fast responses",
              href: "https://wa.me/923211626195",
            },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <a
                key={c.label}
                href={c.href}
                target={c.href.startsWith("http") ? "_blank" : undefined}
                rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="reveal surface-card p-6 text-center hover:border-stone-300 transition-colors"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="w-11 h-11 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto mb-3 text-stone-800">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="text-stone-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  {c.label}
                </div>
                <div className="text-stone-900 font-medium text-sm break-all">{c.value}</div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
