import type { NextConfig } from "next";

// App interno autenticado: tudo é dinâmico por natureza, então Cache Components
// fica desligado (opcional no Next 16) e as telas renderizam a cada request.
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
