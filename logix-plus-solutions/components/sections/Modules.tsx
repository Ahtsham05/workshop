import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Icon, { type IconName } from "@/components/Icon";
import SectionHeading from "./SectionHeading";

type Module = { icon: IconName; title: string; desc: string; bullets: string[]; href?: string };

const modules: Module[] = [
  {
    icon: "scan",
    title: "POS & billing",
    desc: "Bill in seconds with barcode scanning, then print or WhatsApp the receipt.",
    bullets: ["Thermal & A4 receipts", "Returns & exchanges", "Cash register per shift"],
    href: "/pos-software",
  },
  {
    icon: "package",
    title: "Inventory",
    desc: "Live stock in every branch, with alerts before anything runs out.",
    bullets: ["Low-stock alerts", "Transfers & adjustments", "Dead-stock reports"],
    href: "/inventory-management-software",
  },
  {
    icon: "book",
    title: "Accounting",
    desc: "Every sale and payment posts itself to the right ledger.",
    bullets: ["Customer & supplier ledgers", "Banks, cash book, wallets", "VAT / GST / sales tax"],
    href: "/accounting-software",
  },
  {
    icon: "truck",
    title: "Purchases",
    desc: "From purchase order to supplier payment, fully tracked.",
    bullets: ["Purchase orders & returns", "Reorder suggestions", "Supplier price updates"],
    href: "/erp-software",
  },
  {
    icon: "users",
    title: "HR & staff",
    desc: "Staff, attendance, payroll and sales rep commission in one place.",
    bullets: ["Payroll", "Roles & permissions", "Activity & audit log"],
    href: "/erp-software",
  },
  {
    icon: "chart",
    title: "Reports & analytics",
    desc: "Know exactly what makes money — by day, product, location and sales rep.",
    bullets: ["Profit & loss", "Top & slow products", "Branch comparison"],
    href: "/erp-software",
  },
  {
    icon: "message",
    title: "WhatsApp & SMS",
    desc: "Send invoices, statements and payment reminders where customers actually read them.",
    bullets: ["Invoice sharing", "Balance reminders", "Bulk SMS templates"],
  },
  {
    icon: "building",
    title: "Multi-branch",
    desc: "Run every shop or warehouse from one login, with control per branch.",
    bullets: ["Branch-wise stock", "Push products to branches", "Per-branch access"],
    href: "/erp-software",
  },
  {
    icon: "sparkles",
    title: "AI assistant",
    desc: "Ask questions about your business in plain language and get answers from your data.",
    bullets: ["“What did we sell today?”", "Voice in English & Urdu", "Create invoices by chat"],
  },
];

export default function Modules() {
  return (
    <section id="features" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="One system. Everything connected."
          title="Everything you need to run the business —"
          highlight="in one login"
          intro="Stop copying numbers between a billing app, Excel sheets and a register. In Logix Plus, one sale updates stock, cash, the customer's balance and your profit report at the same moment."
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m, i) => {
            const body = (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-600/20">
                    <Icon name={m.icon} className="h-6 w-6" />
                  </span>
                  {m.href ? (
                    <ArrowRight className="h-5 w-5 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-blue-600" />
                  ) : null}
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">{m.title}</h3>
                <p className="mb-5 leading-relaxed text-slate-600">{m.desc}</p>
                <ul className="mt-auto space-y-2 border-t border-slate-100 pt-4">
                  {m.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Check className="h-4 w-4 shrink-0 text-blue-600" /> {b}
                    </li>
                  ))}
                </ul>
              </>
            );
            const cls = "reveal card card-hover group flex h-full flex-col p-7";
            const style = { transitionDelay: `${(i % 3) * 70}ms` };
            return m.href ? (
              <Link key={m.title} href={m.href} className={cls} style={style}>
                {body}
              </Link>
            ) : (
              <div key={m.title} className={cls} style={style}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

