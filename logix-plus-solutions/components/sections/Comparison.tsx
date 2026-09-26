import { Check, Minus, X } from "lucide-react";
import { PLANS } from "@/lib/site";
import SectionHeading from "./SectionHeading";

type Cell = true | false | "partial" | string;

const minPrice = Math.min(...PLANS.map((p) => p.priceUsd));

const rows: { label: string; manual: Cell; big: Cell; us: Cell }[] = [
  { label: "Time to get started", manual: "—", big: "Weeks to months", us: "Same day" },
  { label: "Monthly cost", manual: "Free, but costly mistakes", big: "Hundreds + setup fees", us: `From $${minPrice}` },
  { label: "Live stock in every branch", manual: false, big: true, us: true },
  { label: "Ledgers update automatically", manual: false, big: true, us: true },
  { label: "Exact daily cash reconciliation", manual: false, big: "partial", us: true },
  { label: "Keeps billing without internet", manual: true, big: "partial", us: "Windows app" },
  { label: "WhatsApp invoices & reminders", manual: false, big: false, us: true },
  { label: "English, Arabic, Urdu & Hindi", manual: "—", big: "partial", us: true },
  { label: "Easy enough for counter staff", manual: true, big: false, us: true },
];

function Value({ v, highlight = false }: { v: Cell; highlight?: boolean }) {
  if (v === true)
    return (
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${highlight ? "bg-blue-600 text-white" : "bg-green-50 text-green-600"}`}>
        <Check className="h-4 w-4" aria-label="Yes" />
      </span>
    );
  if (v === false)
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-500">
        <X className="h-4 w-4" aria-label="No" />
      </span>
    );
  if (v === "partial")
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Minus className="h-4 w-4" aria-label="Partly" />
      </span>
    );
  return <span className={`text-xs font-semibold sm:text-sm ${highlight ? "text-blue-700" : "text-slate-600"}`}>{v}</span>;
}

export default function Comparison() {
  return (
    <section id="compare" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Why Logix Plus"
          title="The control of an ERP with the"
          highlight="simplicity of a cash register"
        />
        {/* Phones: compact 3-column grid so the Logix Plus column is always visible. */}
        <div className="reveal overflow-hidden rounded-2xl border border-slate-200 shadow-sm md:hidden">
          <div className="grid grid-cols-3 bg-slate-50 text-center text-xs font-bold">
            <span className="px-2 py-3 text-slate-600">Registers &amp; Excel</span>
            <span className="px-2 py-3 text-slate-600">Big-name ERP</span>
            <span className="bg-blue-600 px-2 py-3 text-white">Logix Plus</span>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="border-t border-slate-100">
              <p className="px-4 pt-3 text-sm font-semibold text-slate-800">{r.label}</p>
              <div className="grid grid-cols-3 items-center text-center">
                <div className="px-2 py-3"><Value v={r.manual} /></div>
                <div className="px-2 py-3"><Value v={r.big} /></div>
                <div className="bg-blue-50/60 px-2 py-3"><Value v={r.us} highlight /></div>
              </div>
            </div>
          ))}
        </div>

        <div className="reveal hidden overflow-x-auto rounded-2xl border border-slate-200 shadow-sm md:block">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-sm">
                <th scope="col" className="px-5 py-4 font-semibold text-slate-500">
                  &nbsp;
                </th>
                <th scope="col" className="px-4 py-4 text-center font-bold text-slate-700">
                  Registers &amp; Excel
                </th>
                <th scope="col" className="px-4 py-4 text-center font-bold text-slate-700">
                  Big-name ERP
                </th>
                <th scope="col" className="bg-blue-600 px-4 py-4 text-center font-extrabold text-white">
                  Logix Plus
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-slate-100">
                  <th scope="row" className="px-5 py-4 text-sm font-semibold text-slate-800">
                    {r.label}
                  </th>
                  <td className="px-4 py-4 text-center">
                    <Value v={r.manual} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Value v={r.big} />
                  </td>
                  <td className="bg-blue-50/60 px-4 py-4 text-center">
                    <Value v={r.us} highlight />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
