import type { NextConfig } from "next";

// Sin cacheComponents: los datos de plata se leen frescos en cada pedido,
// y cada página depende de la sesión del usuario.
const nextConfig: NextConfig = {
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
