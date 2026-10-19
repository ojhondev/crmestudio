import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Restaura Gestão — Estúdio Restaura",
    short_name: "Restaura",
    description: "CRM, atendimento, agenda, financeiro e documentos do Estúdio Restaura.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#c8452c",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Negócios", url: "/negocios" },
      { name: "Atendimento", url: "/atendimento" },
      { name: "Agenda", url: "/agenda" },
    ],
  };
}
