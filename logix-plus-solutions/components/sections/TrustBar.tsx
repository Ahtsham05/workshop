import { Check } from "lucide-react";

/** Short proof points under a flagship page's hero. */
export default function TrustBar({ items }: { items: string[] }) {
  return (
    <section className="border-b border-slate-200 bg-white" aria-label="Why switch">
      <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-x-6 gap-y-3 px-4 py-7 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        {items.map((t) => (
          <li key={t} className="flex items-center gap-2.5 text-[0.95rem] font-semibold text-slate-800">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              <Check className="h-3.5 w-3.5" />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
