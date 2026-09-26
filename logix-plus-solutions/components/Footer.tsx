import Link from "next/link";
import Image from "next/image";
import { LANDING_PAGES } from "@/lib/landing-pages";
import { COMPANY, EMAIL, LOGIN_URL, PHONE_DISPLAY, PHONE_TEL, SIGNUP_URL } from "@/lib/site";

const byGroup = (g: "product" | "industry" | "region") =>
  LANDING_PAGES.filter((p) => p.group === g).map((p) => ({ label: p.navLabel, href: `/${p.slug}` }));

const columns = [
  { title: "Software", links: byGroup("product") },
  { title: "Industries", links: byGroup("industry") },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/pricing" },
      ...LANDING_PAGES.filter((p) => p.group === "region").map((p) => ({ label: `POS & ERP — ${p.navLabel}`, href: `/${p.slug}` })),
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms-and-conditions" },
      { label: "Data Deletion", href: "/data-deletion" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex rounded-lg bg-white px-2 py-1.5">
              <Image src="/logo-dark.png" alt="Logix Plus Solutions" width={112} height={80} className="h-10 w-auto" />
            </Link>
            <p className="mt-5 max-w-sm leading-relaxed">
              Cloud ERP, POS and accounting software for small and medium businesses in the USA, the UK and
              worldwide.
            </p>
            <div className="mt-6 space-y-1.5 text-sm">
              <p>
                <a href={`tel:${PHONE_TEL}`} className="hover:text-white">
                  {PHONE_DISPLAY}
                </a>
              </p>
              <p>
                <a href={`mailto:${EMAIL}`} className="break-all hover:text-white">
                  {EMAIL}
                </a>
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <a href={SIGNUP_URL} className="btn btn-brand px-5 py-2.5 text-sm">
                Start free trial
              </a>
              <a href={LOGIN_URL} className="btn btn-ghost-dark px-5 py-2.5 text-sm">
                Log in
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">{col.title}</p>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {COMPANY}. All rights reserved.
          </p>
          <p>ERP · POS · Accounting · Inventory · School · Restaurant software</p>
        </div>
      </div>
    </footer>
  );
}
