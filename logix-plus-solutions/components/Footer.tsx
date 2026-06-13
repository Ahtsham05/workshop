const footerLinks = [
  { label: "Expertise", href: "/#expertise" },
  { label: "Services", href: "/#services" },
  { label: "About", href: "/#about" },
  { label: "Contact", href: "/#contact" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms", href: "/terms-and-conditions" },
  { label: "Data Deletion", href: "/data-deletion" },
];

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div>
            <p className="font-serif text-lg font-semibold text-stone-900">Logix Plus Solutions</p>
            <p className="text-stone-600 text-sm mt-1 max-w-md">
              Custom CMS, SaaS, and website delivery for teams that value clarity and long-term
              maintainability.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {footerLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
              >
                {l.label}
              </a>
            ))}
            <a
              href="https://www.linkedin.com/company/logixplussolutions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              LinkedIn
            </a>
          </nav>
        </div>
        <div className="mt-10 pt-8 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-stone-500">
          <p>© {new Date().getFullYear()} Logix Plus Solutions. All rights reserved.</p>
          <p>
            Serving clients in Europe, the UK, and globally ·{" "}
            <a href="mailto:info@logixplussolutions.com" className="underline hover:text-stone-700">
              info@logixplussolutions.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
