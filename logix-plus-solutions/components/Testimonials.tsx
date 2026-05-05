"use client";

import { useEffect, useRef } from "react";
import { Quote, Star } from "lucide-react";

const testimonials = [
  {
    name: "Director of Digital",
    role: "Pan-European industrial brand",
    company: "Corporate website & CMS",
    avatar: "DD",
    rating: 5,
    text: "They documented assumptions early, pushed back when scope creep appeared, and handed us a codebase our internal team could actually operate. Rare combination.",
  },
  {
    name: "Head of Product",
    role: "B2B SaaS — logistics",
    company: "Multi-tenant product",
    avatar: "HP",
    rating: 5,
    text: "Milestone-based delivery with clear acceptance tests. We used the same structure to align investors and engineering — that mattered as much as the code.",
  },
  {
    name: "Marketing Lead",
    role: "UK & DACH go-to-market",
    company: "Headless content platform",
    avatar: "ML",
    rating: 5,
    text: "Editors finally have previews and scheduling that do not break the site. Engineering gets structured content. Both sides are calmer.",
  },
  {
    name: "CTO",
    role: "Fintech services",
    company: "Customer portal",
    avatar: "CT",
    rating: 5,
    text: "Security and access control were treated as product features, not an afterthought. That was essential for our risk committee.",
  },
  {
    name: "Founder",
    role: "Vertical SaaS",
    company: "MVP to first paying users",
    avatar: "FO",
    rating: 5,
    text: "We needed speed without paint-by-numbers templates. The architecture we launched with is the one we are still extending — no emergency rewrite.",
  },
  {
    name: "IT Programme Manager",
    role: "Global manufacturing",
    company: "Legacy migration",
    avatar: "IT",
    rating: 5,
    text: "Migration from a tangled WordPress estate was unglamorous work done with patience. Stakeholders saw progress every week.",
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
      className="relative py-20 lg:py-28 bg-stone-100 border-y border-stone-200"
    >
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14 md:mb-16 text-center max-w-2xl mx-auto">
          <p className="reveal text-sm font-semibold uppercase tracking-[0.12em] text-teal-800 mb-3">
            Client perspectives
          </p>
          <h2 className="reveal font-serif text-3xl sm:text-4xl md:text-[2.5rem] font-semibold text-stone-900 tracking-tight mb-4">
            Trust built through delivery, not slides
          </h2>
          <div className="section-rule reveal mx-auto mb-5" />
          <p className="reveal text-stone-600 text-lg leading-relaxed">
            Names and logos are often under NDA. These roles and outcomes reflect the type of
            organisations that commission our work.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <div
              key={t.name + t.company}
              className="reveal surface-card p-6 flex flex-col h-full"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <Quote className="w-7 h-7 text-stone-300 mb-3" strokeWidth={1.25} />

              <div className="flex gap-1 mb-3">
                {Array.from({ length: t.rating }).map((_, s) => (
                  <Star key={s} className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                ))}
              </div>

              <p className="text-stone-700 text-sm leading-relaxed flex-1 mb-6">&ldquo;{t.text}&rdquo;</p>

              <div className="flex items-center gap-3 pt-4 border-t border-stone-200 mt-auto">
                <div className="w-10 h-10 rounded-lg bg-stone-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-stone-700 text-xs font-semibold">{t.avatar}</span>
                </div>
                <div>
                  <div className="text-stone-900 font-semibold text-sm">{t.name}</div>
                  <div className="text-stone-500 text-xs">{t.role}</div>
                  <div className="text-teal-900 text-xs font-medium">{t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="reveal mt-12 surface-card p-6 max-w-xl mx-auto text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-5 h-5 text-amber-500 fill-amber-500" />
            ))}
          </div>
          <p className="text-stone-900 font-semibold text-lg mb-1">Consistently strong feedback</p>
          <p className="text-stone-500 text-sm">
            Referrals and repeat engagements are our main source of new work.
          </p>
        </div>
      </div>
    </section>
  );
}
