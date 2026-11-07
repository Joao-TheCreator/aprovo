import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "APROVO · feed planejado e aprovado",
    short_name: "Aprovo",
    description: "Monte o feed do cliente, mande o link e receba o sim. A gente publica.",
    start_url: "/perfis",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0816",
    theme_color: "#0B0816",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["productivity", "social", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
