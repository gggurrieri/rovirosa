import type { NextConfig } from "next";

// Sin cacheComponents: los datos de plata se leen frescos en cada pedido,
// y cada página depende de la sesión del usuario.
const nextConfig: NextConfig = {
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
