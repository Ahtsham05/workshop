import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logix Plus — ERP & POS Software",
    short_name: "Logix Plus",
    description:
      "All-in-one ERP, POS and accounting software for small and medium businesses.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1533",
    theme_color: "#0b1533",
    categories: ["business", "productivity", "finance"],
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
      { name: "Pricing", short_name: "Pricing", description: "Plans and prices", url: "/pricing" },
      { name: "Features", short_name: "Features", description: "What Logix Plus does", url: "/#features" },
      { name: "Contact", short_name: "Contact", description: "Get a free demo", url: "/#contact" },
    ],
  };
}
