import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import WhatsAppButton from "@/components/WhatsAppButton";
import PWARegister from "@/components/PWARegister";
import RevealObserver from "@/components/RevealObserver";
import JsonLd from "@/components/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/schema";
import { COMPANY, SITE_URL } from "@/lib/site";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const DEFAULT_TITLE = "Logix Plus — ERP, POS & Accounting Software for Small Business";
const DEFAULT_DESCRIPTION =
  "All-in-one cloud ERP & POS software: billing, inventory, accounting, HR and multi-branch reports. Used by shops, wholesalers, restaurants and schools. 14-day free trial.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: "%s" },
  description: DEFAULT_DESCRIPTION,
  applicationName: "Logix Plus",
  authors: [{ name: COMPANY, url: SITE_URL }],
  creator: COMPANY,
  publisher: COMPANY,
  category: "Business Software",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Logix Plus",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
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
  verification: {
    // Add Google Search Console / Bing tokens here once the properties are created:
    // google: "…", other: { "msvalidate.01": "…" }
    other: {
      "facebook-domain-verification": "b5kqhky9xq45g9zcwq2uji2j9rfo16",
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
  appleWebApp: { capable: true, title: "Logix Plus" },
};

export const viewport: Viewport = {
  themeColor: "#0b1533",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <JsonLd data={[organizationSchema, websiteSchema]} />
        <PWARegister />
        <RevealObserver />
        {children}
        <WhatsAppButton />
      </body>
    </html>
  );
}
