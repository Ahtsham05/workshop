import { AlertTriangle, BarChart3, BookOpen, Check, LayoutDashboard, Package, Receipt, ShoppingCart, Users } from "lucide-react";

const bars = [42, 58, 50, 71, 64, 88, 76];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Illustrative product UI for the hero. Figures are sample data, labelled as such. */
export default function ProductMockup({ currency = "$" }: { currency?: string }) {
  // Sample figures; rupee amounts use a realistic shop scale shown compactly so they fit the cards.
  const money = (n: number) =>
    currency === "Rs" ? `Rs ${Math.round((n * 28) / 1000)}k` : `${currency}${n.toLocaleString("en-US")}`;

  return (
    <div className="relative" aria-label="Preview of the Logix Plus dashboard with sample data" role="img">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_40px_80px_-24px_rgba(0,0,0,0.6)]">
        {/* window bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200">
            app.logixplussolutions.com/dashboard
          </span>
        </div>

        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-36 shrink-0 border-r border-slate-100 bg-slate-50/60 p-3 sm:block">
            {[
              { i: LayoutDashboard, l: "Dashboard", a: true },
              { i: ShoppingCart, l: "POS" },
              { i: Receipt, l: "Invoices" },
              { i: Package, l: "Inventory" },
              { i: Users, l: "Customers" },
              { i: BookOpen, l: "Accounts" },
              { i: BarChart3, l: "Reports" },
            ].map(({ i: I, l, a }) => (
              <div
                key={l}
                className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                  a ? "bg-blue-600 text-white" : "text-slate-500"
                }`}
              >
                <I className="h-3.5 w-3.5" /> {l}
              </div>
            ))}
          </div>

          {/* main */}
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-800">Today · Main Branch</p>
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-green-200">
                Live
              </span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { l: "Sales", v: money(4280), d: "+12%" },
                { l: "Profit", v: money(1135), d: "+8%" },
                { l: "Cash in hand", v: money(2960), d: "Matched" },
                { l: "Receivable", v: money(890), d: "6 customers" },
              ].map((k) => (
                <div key={k.l} className="rounded-lg border border-slate-100 bg-white p-2 shadow-sm">
                  <p className="text-[10px] font-medium text-slate-400">{k.l}</p>
                  <p className="truncate text-sm font-extrabold text-slate-900">{k.v}</p>
                  <p className="text-[10px] font-semibold text-green-600">{k.d}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <div className="rounded-lg border border-slate-100 p-3 md:col-span-3">
                <p className="mb-2 text-[11px] font-bold text-slate-700">Sales this week</p>
                <div className="flex h-24 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <div key={days[i]} className="flex h-full flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-t ${i === 5 ? "bg-blue-600" : "bg-blue-200"}`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-400">{days[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 p-3 md:col-span-2">
                <p className="mb-2 text-[11px] font-bold text-slate-700">Recent invoices</p>
                {[
                  { n: "INV-1042", c: "Walk-in", s: "Paid" },
                  { n: "INV-1041", c: "Oak Street Deli", s: "Credit" },
                  { n: "INV-1040", c: "Sarah K.", s: "Paid" },
                ].map((r) => (
                  <div key={r.n} className="flex items-center justify-between border-b border-slate-50 py-1 last:border-0">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-slate-800">{r.n}</p>
                      <p className="truncate text-[9px] text-slate-400">{r.c}</p>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        r.s === "Paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating toasts */}
      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 shadow-xl ring-1 ring-slate-200 sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-bold text-slate-800">Invoice sent on WhatsApp</p>
          <p className="text-[10px] text-slate-500">INV-1042 · just now</p>
        </div>
      </div>
      <div className="absolute -right-3 -top-5 hidden items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 shadow-xl ring-1 ring-slate-200 md:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-bold text-slate-800">Low stock alert</p>
          <p className="text-[10px] text-slate-500">Bottled Water 24-pk · 4 left</p>
        </div>
      </div>
    </div>
  );
}
