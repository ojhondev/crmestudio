import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { SlideView } from "@/components/docs/slide-view";
import { DOC_CSS, GOOGLE_FONTS_HREF } from "./doc-css";
import { escapeHtml } from "./variables";
import type { DeckContent, DocContent } from "./types";

type Input = {
  content: DocContent;
  /** valores já resolvidos (snapshot ou contexto ao vivo) */
  map: Record<string, string>;
  /** HTML do contrato já resolvido e sanitizado */
  contractHtml?: string;
  title: string;
  number: string | null;
  studioName: string;
  origin: string;
};

const dataUrl = (file: string) => {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", file));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
};

/** HTML completo e autossuficiente do documento (o mesmo desenho da tela, sem JavaScript). */
export async function renderDocumentHtml(i: Input) {
  const head = `<meta charset="utf-8"><title>${escapeHtml(i.title)}</title><base href="${escapeHtml(i.origin)}/">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_HREF}">`;

  if (i.content.kind === "contrato") {
    const logo = dataUrl("logo.png");
    return `<!doctype html><html lang="pt-BR"><head>${head}<style>${DOC_CSS}
@page{size:A4;margin:0}html,body{margin:0;background:#fff}.rs-paper{max-width:none;padding:0}
.rs-paper h1,.rs-paper h2,.rs-paper h3{break-after:avoid}</style></head>
<body class="rs-doc"><article class="rs-paper">
<div class="rs-paper-head">${logo ? `<img src="${logo}" alt="${escapeHtml(i.studioName)}">` : `<strong>${escapeHtml(i.studioName)}</strong>`}<span>${escapeHtml(i.number ?? "")}</span></div>
${i.contractHtml ?? ""}</article></body></html>`;
  }

  // renderToStaticMarkup do build de Node (o import padrão de react-dom/server é bloqueado em rotas do App Router)
  const { renderToStaticMarkup } = await import("react-dom/server");
  const deck = i.content as DeckContent;
  const slides = deck.slides
    .map((s, idx) => renderToStaticMarkup(createElement(SlideView, { slide: s, map: i.map, index: idx, total: deck.slides.length, studioName: i.studioName })))
    .join("");
  return `<!doctype html><html lang="pt-BR"><head>${head}<style>${DOC_CSS}
@page{size:1280px 720px;margin:0}html,body{margin:0;background:#fff}.rs-slide{break-after:page;page-break-after:always}.rs-slide:last-child{break-after:auto;page-break-after:auto}</style></head>
<body class="rs-doc">${slides}</body></html>`;
}

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  const local = process.env.CHROME_PATH;
  if (local && !process.env.VERCEL) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
}

export async function htmlToPdf(html: string, kind: "contrato" | "apresentacao", footerLabel: string): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    if (kind === "apresentacao") {
      return await page.pdf({ width: "1280px", height: "720px", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" }, preferCSSPageSize: true });
    }
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "22mm", bottom: "22mm", left: "22mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font:8px Montserrat,Arial,sans-serif;color:#8a8683;display:flex;justify-content:space-between;padding:0 22mm"><span>${escapeHtml(footerLabel)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
}

export const pdfResponse = (bytes: Uint8Array, filename: string) =>
  new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
