import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "APROVO",
    short_name: "Aprovo",
    description: "Planeje. Aprove. Publique.",
    start_url: "/perfis",
    display: "standalone",
    background_color: "#F8F7FF",
    theme_color: "#6A00FF",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
