import type { NextConfig } from "next";

// Sin cacheComponents: los datos de plata se leen frescos en cada pedido,
// y cada página depende de la sesión del usuario.
// Encabezados de seguridad para todas las respuestas:
// - nadie puede mostrar la app dentro de un marco de otro sitio (evita engaños de clics),
// - el navegador no "adivina" tipos de archivo, no manda la dirección completa a otros sitios,
// - y la app no pide cámara, micrófono ni ubicación (si hace falta en la fase 2, se habilita acá).
const SEGURIDAD = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SEGURIDAD }];
  },
  // Comprobantes de hasta 5 MB (más el margen del formulario). Netlify acepta hasta 6 MB.
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
