import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logix Plus Solutions",
    short_name: "Logix Plus",
    description:
      "Smart business software for ERP, inventory, HR, invoicing, and accounting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/favicon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Home",
        short_name: "Home",
        description: "Open Logix Plus website",
        url: "/#home",
      },
      {
        name: "Features",
        short_name: "Features",
        description: "See platform features",
        url: "/#features",
      },
      {
        name: "Launch App",
        short_name: "Launch",
        description: "Open main product app",
        url: "https://app.logixplussolutions.com",
      },
    ],
  };
}
