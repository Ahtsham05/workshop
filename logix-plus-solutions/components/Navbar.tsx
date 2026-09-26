"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Menu, X } from "lucide-react";
import { LANDING_PAGES } from "@/lib/landing-pages";
import { LOGIN_URL, SIGNUP_URL } from "@/lib/site";

const products = LANDING_PAGES.filter((p) => p.group === "product");
const industries = LANDING_PAGES.filter((p) => p.group === "industry");
const regions = LANDING_PAGES.filter((p) => p.group === "region");

const mainLinks = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/#contact" },
];

export default function Navbar({ alwaysSolid = false }: { alwaysSolid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = alwaysSolid || scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Logix Plus home">
          <span className={`flex h-10 items-center rounded-lg px-1.5 ${solid ? "" : "bg-white"}`}>
            <Image src="/logo-dark.png" alt="Logix Plus Solutions" width={112} height={80} className="h-9 w-auto" priority />
          </span>
        </Link>

        <ul className={`hidden items-center gap-1 lg:flex ${solid ? "text-slate-700" : "text-slate-200"}`}>
          <li className="group relative">
            <button
              type="button"
              className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                solid ? "hover:text-slate-950" : "hover:text-white"
              }`}
              aria-haspopup="true"
            >
              Solutions <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-1/2 top-full w-[40rem] -translate-x-1/2 pt-3 opacity-0 transition-all duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="grid grid-cols-3 gap-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-2xl">
                {[
                  { title: "Software", items: products },
                  { title: "Industries", items: industries },
                  { title: "Regions", items: regions },
                ].map((col) => (
                  <div key={col.title}>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{col.title}</p>
                    <ul className="space-y-1">
                      {col.items.map((p) => (
                        <li key={p.slug}>
                          <Link
                            href={`/${p.slug}`}
                            className="block rounded-md px-2 py-1.5 text-sm font-medium hover:bg-blue-50 hover:text-blue-700"
                          >
                            {p.navLabel}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </li>
          {mainLinks.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  solid ? "hover:text-slate-950" : "hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={LOGIN_URL}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              solid ? "text-slate-700 hover:text-slate-950" : "text-slate-200 hover:text-white"
            }`}
          >
            Log in
          </a>
          <a href={SIGNUP_URL} className="btn btn-brand px-5 py-2.5 text-sm">
            Start free trial
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`rounded-lg p-2 lg:hidden ${solid ? "text-slate-800" : "text-white"}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-6 pt-2 lg:hidden">
          <ul className="space-y-1">
            {mainLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-4 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Solutions</p>
          <ul className="grid grid-cols-1 gap-1 min-[400px]:grid-cols-2">
            {[...products, ...industries, ...regions].map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  {p.navLabel}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <a href={LOGIN_URL} className="btn btn-ghost py-3 text-sm">
              Log in
            </a>
            <a href={SIGNUP_URL} className="btn btn-brand py-3 text-sm">
              Start free trial
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
