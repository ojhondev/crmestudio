import type { NextConfig } from "next";

// App interno autenticado: tudo é dinâmico por natureza, então Cache Components
// fica desligado (opcional no Next 16) e as telas renderizam a cada request.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "app.estudiorestaura.com.br" }],
        destination: "https://gestao.estudiorestaura.com.br/:path*",
        permanent: true,
      },
    ];
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
