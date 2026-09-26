import { ArrowRight, Check, MessageCircle } from "lucide-react";
import ProductMockup from "@/components/ProductMockup";
import { SIGNUP_URL, TRIAL_DAYS, whatsappLink } from "@/lib/site";

export default function Hero({
  eyebrow,
  title,
  highlight,
  intro,
  currency,
  breadcrumb,
}: {
  eyebrow: string;
  title: string;
  highlight: string;
  intro: string;
  currency?: string;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <section id="home" className="hero-bg relative overflow-hidden pb-20 pt-28 lg:pb-28 lg:pt-36">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <div className="lg:col-span-6">
          {breadcrumb}
          <p className="reveal mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-cyan-200 sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            {eyebrow}
          </p>
          <h1 className="reveal text-balance text-[2.25rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
            {title} <span className="text-gradient-light">{highlight}</span>
          </h1>
          <p className="reveal mt-6 max-w-xl text-lg leading-relaxed text-slate-300">{intro}</p>

          <div className="reveal mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={SIGNUP_URL} className="btn btn-brand group px-7 py-4 text-base">
              Start {TRIAL_DAYS}-day free trial
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost-dark px-7 py-4 text-base"
            >
              <MessageCircle className="h-5 w-5 text-green-400" />
              Book a free demo
            </a>
          </div>

          <ul className="reveal mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
            {["No credit card needed", "Set up in one day", "Cancel any time"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-cyan-400" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="reveal lg:col-span-6">
          <ProductMockup currency={currency} />
        </div>
      </div>
    </section>
  );
}
