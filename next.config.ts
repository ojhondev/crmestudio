import type { NextConfig } from "next";

// App interno autenticado: tudo é dinâmico por natureza, então Cache Components
// fica desligado (opcional no Next 16) e as telas renderizam a cada request.
const CHROMIUM = ["./node_modules/@sparticuz/chromium/bin/**"];

const nextConfig: NextConfig = {
  // PDF dos documentos: Chromium enxuto roda dentro da função (Vercel)
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/documentos/[id]/pdf": CHROMIUM,
    "/p/[token]/pdf": CHROMIUM,
  },
  // imagens de apresentações vão dentro do documento (já comprimidas no navegador)
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
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
