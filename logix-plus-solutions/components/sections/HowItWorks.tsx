import { ArrowRight } from "lucide-react";
import { SIGNUP_URL, TRIAL_DAYS } from "@/lib/site";
import SectionHeading from "./SectionHeading";

const steps = [
  {
    n: "1",
    title: "Create your free account",
    desc: `Sign up in two minutes and choose your business type. Your ${TRIAL_DAYS}-day trial starts with sample data so you can explore straight away.`,
  },
  {
    n: "2",
    title: "Import your products",
    desc: "Upload your item list from Excel, or let our team set it up for you. Add staff and give each person the right access.",
  },
  {
    n: "3",
    title: "Start selling today",
    desc: "Open the POS, scan your first item and print the receipt. Stock, cash and reports update from the first sale.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Go live in a day"
          title="From sign-up to first sale in"
          highlight="three steps"
          intro="No installation projects, no consultants, no long contracts."
        />
        <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.n} className="reveal relative card p-8" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-extrabold text-white ring-8 ring-blue-50">
                {s.n}
              </span>
              <h3 className="mb-2 text-xl font-bold text-slate-900">{s.title}</h3>
              <p className="leading-relaxed text-slate-600">{s.desc}</p>
            </li>
          ))}
        </ol>
        <div className="reveal mt-12 text-center">
          <a href={SIGNUP_URL} className="btn btn-brand group px-8 py-4 text-base">
            Create my free account
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
