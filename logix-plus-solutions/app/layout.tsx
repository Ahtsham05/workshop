import type { Metadata } from "next";
import "./globals.css";
import WhatsAppButton from "@/components/WhatsAppButton";
import PWARegister from "@/components/PWARegister";
import PWAInstallButton from "@/components/PWAInstallButton";

export const metadata: Metadata = {
  title: {
    default: "Logix Plus Solutions – Smart Software for Modern Businesses",
    template: "%s | Logix Plus Solutions",
  },
  description:
    "Logix Plus Solutions delivers cutting-edge business management software including ERP, inventory, HR, invoicing, and accounting tools to help companies scale smarter and faster.",
  keywords: [
    "Logix Plus Solutions",
    "business software",
    "ERP software",
    "inventory management",
    "HR software",
    "accounting software",
    "invoicing system",
    "enterprise software",
    "business management",
    "POS system",
    "Pakistan software company",
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
    locale: "en_US",
    url: "https://logixplussolutions.com",
    siteName: "Logix Plus Solutions",
    title: "Logix Plus Solutions – Smart Software for Modern Businesses",
    description:
      "Powerful, all-in-one business management software. Streamline your operations with Logix Plus Solutions – trusted by hundreds of companies.",
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
    title: "Logix Plus Solutions – Smart Software for Modern Businesses",
    description:
      "Powerful, all-in-one business management software. Streamline your operations with Logix Plus Solutions.",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Logix Plus Solutions",
              url: "https://logixplussolutions.com",
              logo: "https://logixplussolutions.com/favicon-512.png",
              description:
                "Logix Plus Solutions delivers cutting-edge business management software including ERP, inventory, HR, invoicing, and accounting tools.",
              address: {
                "@type": "PostalAddress",
                addressCountry: "PK",
              },
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer service",
                email: "info@logixplussolutions.com",
              },
              sameAs: [
                "https://www.facebook.com/logixplussolutions",
                "https://www.linkedin.com/company/logixplussolutions",
              ],
            }),
          }}
        />
        <meta name="theme-color" content="#0f172a" />
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
