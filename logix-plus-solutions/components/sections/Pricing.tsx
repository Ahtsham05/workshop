import { ArrowRight, Check, CreditCard, Landmark, Lock, Smartphone } from "lucide-react";
import { PLANS, SIGNUP_URL, TRIAL_DAYS, pkr, whatsappLink } from "@/lib/site";
import SectionHeading from "./SectionHeading";

export default function Pricing({
  showPkr = false,
  showGbp = false,
  headingLevel = 2,
}: {
  showPkr?: boolean;
  /** UK pages: add an approximate pound figure; billing stays in USD. */
  showGbp?: boolean;
  headingLevel?: 1 | 2;
}) {
  return (
    <section id="pricing" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {headingLevel === 1 ? (
          <div className="reveal mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="eyebrow mb-3">Pricing</p>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              Simple pricing. <span className="text-gradient">Every plan includes POS &amp; inventory.</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600">
              Start with a {TRIAL_DAYS}-day free trial — no credit card. Upgrade, downgrade or cancel any time.
            </p>
          </div>
        ) : (
          <SectionHeading
            eyebrow="Pricing"
            title="Less than the cost of one"
            highlight="counting mistake a month"
            intro={`Every plan starts with a ${TRIAL_DAYS}-day free trial. No setup fees, no contract — upgrade, downgrade or cancel any time.`}
          />
        )}

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <div
              key={plan.key}
              className={`reveal relative flex flex-col rounded-2xl p-8 ${
                plan.popular
                  ? "bg-ink text-white shadow-2xl shadow-blue-900/30 ring-2 ring-blue-500 lg:-my-4 lg:py-12"
                  : "card"
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {plan.popular ? (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Most popular
                </span>
              ) : null}
              <h3 className={`text-xl font-extrabold ${plan.popular ? "text-white" : "text-slate-900"}`}>{plan.name}</h3>
              <p className={`mt-1 text-sm ${plan.popular ? "text-slate-300" : "text-slate-500"}`}>{plan.tagline}</p>

              <div className="mt-6 flex items-end gap-1.5">
                <span className={`text-5xl font-extrabold tracking-tight ${plan.popular ? "text-white" : "text-slate-950"}`}>
                  {showPkr ? pkr(plan.priceUsd) : `$${plan.priceUsd}`}
                </span>
                <span className={`mb-1.5 text-sm font-medium ${plan.popular ? "text-slate-300" : "text-slate-500"}`}>/ month</span>
              </div>
              <p className={`mt-1 text-sm ${plan.popular ? "text-slate-400" : "text-slate-500"}`}>
                {showPkr
                  ? `or $${plan.priceUsd} by card`
                  : showGbp
                    ? `≈ £${Math.round(plan.priceUsd * 0.78)} / month · billed in USD`
                    : "Billed monthly · cancel any time"}
              </p>

              <div
                className={`mt-6 grid grid-cols-3 gap-2 rounded-xl p-3 text-center text-xs font-semibold ${
                  plan.popular ? "bg-white/5 text-slate-200" : "bg-slate-50 text-slate-700"
                }`}
              >
                <span>{plan.users}</span>
                <span>{plan.branches}</span>
                <span>{plan.invoices.replace(" / month", "/mo")}</span>
              </div>

              <ul className="mb-8 mt-6 space-y-3">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-[0.95rem]">
                    <Check className={`mt-0.5 h-5 w-5 shrink-0 ${plan.popular ? "text-cyan-300" : "text-blue-600"}`} />
                    <span className={plan.popular ? "text-slate-200" : "text-slate-700"}>{h}</span>
                  </li>
                ))}
              </ul>

              <a
                href={SIGNUP_URL}
                className={`btn mt-auto w-full py-3.5 text-base ${plan.popular ? "btn-brand" : "btn-ghost"}`}
              >
                Start free trial <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>

        <div className="reveal mx-auto mt-12 flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 md:flex-row md:items-center">
          <div>
            <p className="text-lg font-bold text-slate-900">More branches, users or a custom module?</p>
            <p className="mt-1 text-slate-600">
              Enterprise plans with unlimited branches and users, and custom development for your workflow.
            </p>
          </div>
          <a
            href={whatsappLink("Hi, I'd like a quote for an Enterprise / custom Logix Plus plan.")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost shrink-0 px-6 py-3"
          >
            Talk to sales
          </a>
        </div>

        <div className="reveal mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> All major credit &amp; debit cards
          </span>
          {showPkr ? (
            <>
              <span className="flex items-center gap-2">
                <Landmark className="h-4 w-4" /> Bank transfer
              </span>
              <span className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> JazzCash &amp; Easypaisa
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4" /> Secure encrypted checkout
              </span>
              <span className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> No contract, cancel online
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
