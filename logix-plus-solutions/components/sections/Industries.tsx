import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Icon, { type IconName } from "@/components/Icon";
import SectionHeading from "./SectionHeading";

const defaultIndustries: { icon: IconName; title: string; desc: string; href?: string }[] = [
  {
    icon: "cart",
    title: "Retail & supermarkets",
    desc: "Fast barcode checkout, customer house accounts and stock alerts for stores, marts and supermarkets.",
    href: "/pos-software",
  },
  {
    icon: "truck",
    title: "Wholesale & distribution",
    desc: "Customer credit accounts, sales rep collections and bulk supplier price updates.",
    href: "/wholesale-distribution-software",
  },
  {
    icon: "chef",
    title: "Restaurants & cafés",
    desc: "Tables, kitchen display, QR ordering and reservations.",
    href: "/restaurant-pos-software",
  },
  {
    icon: "smartphone",
    title: "Mobile phone shops",
    desc: "IMEI tracking, repairs, used phones, load and bill payments.",
    href: "/mobile-shop-software",
  },
  {
    icon: "award",
    title: "Schools & academies",
    desc: "Fee vouchers, defaulters, attendance, results and SMS to parents.",
    href: "/school-management-software",
  },
  {
    icon: "building",
    title: "Services & small factories",
    desc: "Quotations, job costing, purchases, payroll and full accounts.",
    href: "/erp-software",
  },
];

export default function Industries({
  eyebrow = "Built for your industry",
  title = "Set up for the way",
  highlight = "your business works",
  intro = "Pick your business type at sign-up and Logix Plus switches on the right screens, reports and terminology — no consultant needed.",
  items: industries = defaultIndustries,
}: {
  eyebrow?: string;
  title?: string;
  highlight?: string;
  intro?: string;
  items?: { icon: IconName; title: string; desc: string; href?: string }[];
}) {
  return (
    <section id="industries" className="bg-ink relative overflow-hidden py-20 lg:py-28">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading dark eyebrow={eyebrow} title={title} highlight={highlight} intro={intro} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((ind, i) => (
            <Link
              key={ind.title}
              href={ind.href ?? "/#features"}
              className="reveal group rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-cyan-400/40 hover:bg-white/[0.07]"
              style={{ transitionDelay: `${(i % 3) * 70}ms` }}
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <Icon name={ind.icon} className="h-5 w-5" />
              </span>
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
                {ind.title}
                <ArrowRight className="h-4 w-4 text-slate-500 transition-all group-hover:translate-x-1 group-hover:text-cyan-300" />
              </h3>
              <p className="leading-relaxed text-slate-400">{ind.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
