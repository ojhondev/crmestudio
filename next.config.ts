import type { NextConfig } from "next";

// App interno autenticado: tudo é dinâmico por natureza, então Cache Components
// fica desligado (opcional no Next 16) e as telas renderizam a cada request.
const CHROMIUM = ["./node_modules/@sparticuz/chromium/bin/**"];

const nextConfig: NextConfig = {
  // PDF dos documentos: Chromium enxuto roda dentro da função (Vercel)
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/documentos/*/pdf": CHROMIUM,
    "/p/*/pdf": CHROMIUM,
  },
  // imagens de apresentações vão dentro do documento (já comprimidas no navegador)
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  async redirects() {
    // endereços antigos (app. e gestao.) levam ao endereço atual do CRM
    return ["app.estudiorestaura.com.br", "gestao.estudiorestaura.com.br"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://crm.estudiorestaura.com.br/:path*",
      permanent: true,
    }));
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
