import type { MetadataRoute } from "next";

// Lo que el celular necesita para instalar la app con su ícono y abrirla a pantalla completa.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tracker",
    short_name: "Tracker",
    description: "Viajes y cobros de transporte de autos",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f5f9",
    theme_color: "#0369a1",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
