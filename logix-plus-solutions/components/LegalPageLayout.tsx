import Link from "next/link";
import Image from "next/image";
import Footer from "@/components/Footer";

export default function LegalPageLayout({
  title,
  subtitle,
  lastUpdated,
  wide = false,
  hero,
  children,
}: {
  title: string;
  subtitle?: string;
  lastUpdated: string;
  wide?: boolean;
  hero?: React.ReactNode;
  children: React.ReactNode;
}) {
  const containerClass = wide ? "max-w-4xl" : "max-w-3xl";

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
        <div className={`${containerClass} mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between`}>
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/logo-dark.png"
              alt="Logix Plus Solutions"
              width={140}
              height={48}
              className="h-9 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy-policy"
              className="hidden sm:inline text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <article className={`${containerClass} mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14`}>
        <header className="mb-10 pb-8 border-b border-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 mb-3">
            Logix Plus Solutions · Legal
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-4 text-base md:text-lg text-stone-600 leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          ) : null}
          <p className="mt-4 text-sm text-stone-500">Last updated: {lastUpdated}</p>
        </header>

        {hero ? <div className="mb-10">{hero}</div> : null}

        <div className="legal-prose">{children}</div>
      </article>

      <Footer />
    </main>
  );
}
