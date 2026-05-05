"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Home", href: "#home" },
  { label: "Expertise", href: "#expertise" },
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-stone-50/95 backdrop-blur-md border-b border-stone-200 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-[4.25rem]">
          <Link href="#home" className="flex items-center">
            <Image
              src="/logo-dark.png"
              alt="Logix Plus Solutions"
              width={160}
              height={60}
              className="h-10 md:h-11 w-auto object-contain"
              priority
            />
          </Link>

          <ul className="hidden md:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="px-3 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 rounded-md transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:flex items-center">
            <a
              href="#contact"
              className="btn-primary px-5 py-2.5 rounded-lg text-sm"
            >
              Start a project
            </a>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-md text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Toggle menu"
            type="button"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ${
            isOpen ? "max-h-96 pb-4" : "max-h-0"
          }`}
        >
          <div className="surface-card p-4 mt-2 flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 rounded-md transition-colors"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setIsOpen(false)}
              className="btn-primary mt-2 px-5 py-3 rounded-lg text-sm text-center"
            >
              Start a project
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
