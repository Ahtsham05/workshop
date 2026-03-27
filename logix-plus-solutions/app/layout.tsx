import type { Metadata } from "next";
import "./globals.css";

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
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png" }],
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
              logo: "https://logixplussolutions.com/logo.png",
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
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
