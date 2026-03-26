"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Play, Star, TrendingUp, Users, Zap } from "lucide-react";

const stats = [
  { value: "500+", label: "Happy Clients", icon: Users },
  { value: "99.9%", label: "Uptime SLA", icon: TrendingUp },
  { value: "50+", label: "Features", icon: Star },
  { value: "24/7", label: "Support", icon: Zap },
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
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden animated-bg grid-pattern"
    >
      {/* Decorative blobs */}
      <div className="blob absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600 -translate-x-1/2 -translate-y-1/2" />
      <div
        className="blob absolute top-3/4 right-1/4 w-80 h-80 bg-violet-600 translate-x-1/2"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="blob absolute top-1/2 right-1/3 w-64 h-64 bg-cyan-500"
        style={{ animationDelay: "4s" }}
      />

      {/* Glowing orb behind CTA */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-gradient-to-r from-blue-500/10 to-violet-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 text-center">
        {/* Badge */}
        <div className="reveal inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full text-sm font-medium text-blue-300 mb-8 hover:!transform-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Trusted by 500+ businesses worldwide
        </div>

        {/* Headline */}
        <h1 className="reveal text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.1] mb-6">
          Run Your Business
          <br />
          <span className="gradient-text">10× Smarter</span>
        </h1>

        {/* Subheadline */}
        <p className="reveal max-w-2xl mx-auto text-lg sm:text-xl text-slate-300 leading-relaxed mb-10">
          Logix Plus Solutions brings you an all-in-one platform for{" "}
          <span className="text-blue-300 font-semibold">ERP, inventory, HR, invoicing</span>,
          and accounting — designed to automate workflows and accelerate growth.
        </p>

        {/* CTA Buttons */}
        <div className="reveal flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <a
            href="https://app.logixplussolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-glow group flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-bold text-white shadow-2xl"
          >
            <Zap className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            Launch Software
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>

          <a
            href="#features"
            className="group flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-semibold text-white border border-white/10 hover:border-blue-400/40 hover:bg-white/5 transition-all duration-300"
          >
            <span className="w-9 h-9 rounded-xl bg-white/10 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
              <Play className="w-4 h-4 ml-0.5" />
            </span>
            See Features
          </a>
        </div>

        {/* Stats row */}
        <div className="reveal grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="glass-card p-4 flex flex-col items-center gap-2 hover:!transform-none"
              >
                <Icon className="w-5 h-5 text-blue-400" />
                <div className="stat-number text-2xl md:text-3xl">{stat.value}</div>
                <div className="text-xs text-slate-400 font-medium">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500 text-xs animate-bounce">
          <span>Scroll down</span>
          <div className="w-5 h-8 rounded-full border-2 border-slate-600 flex items-start justify-center pt-1">
            <div className="w-1 h-2 bg-slate-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}
