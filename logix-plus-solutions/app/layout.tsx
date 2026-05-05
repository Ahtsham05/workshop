import type { Metadata } from "next";
import "./globals.css";
import WhatsAppButton from "@/components/WhatsAppButton";
import PWARegister from "@/components/PWARegister";
import PWAInstallButton from "@/components/PWAInstallButton";

export const metadata: Metadata = {
  title: {
    default:
      "Logix Plus Solutions — Custom CMS, SaaS & Web Development Studio",
    template: "%s | Logix Plus Solutions",
  },
  description:
    "Senior-led studio for headless CMS platforms, SaaS products, and corporate websites. Clear discovery, documented delivery, and maintainable code — trusted by teams across Europe and beyond.",
  keywords: [
    "Logix Plus Solutions",
    "CMS development",
    "headless CMS",
    "SaaS development agency",
    "custom web applications",
    "Next.js agency",
    "WordPress enterprise",
    "Strapi development",
    "corporate website design",
    "web agency Europe",
    "software studio",
  ],
  authors: [{ name: "Logix Plus Solutions", url: "https://logixplussolutions.com" }],
  creator: "Logix Plus Solutions",
  publisher: "Logix Plus Solutions",
  metadataBase: new URL("https://logixplussolutions.com"),
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: "https://logixplussolutions.com",
    siteName: "Logix Plus Solutions",
    title: "Logix Plus Solutions — CMS, SaaS & Website Development",
    description:
      "We design and build CMS platforms, SaaS applications, and marketing sites with European-grade clarity, documentation, and maintainability.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Logix Plus Solutions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Logix Plus Solutions — CMS, SaaS & Website Development",
    description:
      "Custom CMS, SaaS products, and corporate websites from a senior engineering studio.",
    images: ["/og-image.png"],
    creator: "@logixplus",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/favicon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ProfessionalService",
              name: "Logix Plus Solutions",
              url: "https://logixplussolutions.com",
              logo: "https://logixplussolutions.com/favicon-512.png",
              description:
                "Software development studio specializing in CMS platforms, SaaS applications, and corporate websites with documented processes and long-term maintainability.",
              areaServed: ["European Union", "United Kingdom", "Switzerland", "Pakistan"],
              address: {
                "@type": "PostalAddress",
                addressCountry: "PK",
              },
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "sales",
                email: "info@logixplussolutions.com",
                availableLanguage: ["English", "Urdu"],
              },
              sameAs: [
                "https://www.facebook.com/logixplussolutions",
                "https://www.linkedin.com/company/logixplussolutions",
              ],
            }),
          }}
        />
        <meta name="theme-color" content="#fafaf9" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Logix Plus" />
      </head>
      <body className="antialiased">
        <PWARegister />
        {children}
        <PWAInstallButton />
        <WhatsAppButton />
      </body>
    </html>
  );
}
