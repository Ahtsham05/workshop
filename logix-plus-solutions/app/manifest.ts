import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logix Plus Solutions",
    short_name: "Logix Plus",
    description:
      "Custom CMS platforms, SaaS development, and corporate websites — senior-led engineering studio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#fafaf9",
    categories: ["business", "productivity", "developer tools"],
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
        name: "Expertise",
        short_name: "Expertise",
        description: "What we deliver",
        url: "/#expertise",
      },
      {
        name: "Contact",
        short_name: "Contact",
        description: "Start a project",
        url: "/#contact",
      },
    ],
  };
}
