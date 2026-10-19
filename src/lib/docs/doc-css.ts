/**
 * Folha de estilo ÚNICA dos documentos: o mesmo texto vale para o editor, a prévia, a página pública
 * e o PDF. Paleta própria (papel branco + carvão + terracota), independente do tema claro/escuro do app.
 */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap";

export const DOC_CSS = `
.rs-doc{--ink:#1c1c1c;--muted:#6a6a6a;--line:#e8e6e4;--accent:#b75928;--soft:#f7ece5;--paper:#fff;
  --sans:var(--font-montserrat,"Montserrat"),"Montserrat",ui-sans-serif,system-ui,sans-serif;--serif:var(--font-lora,"Lora"),"Lora",Georgia,serif;
  color:var(--ink);font-family:var(--serif)}
.rs-doc *{box-sizing:border-box}

/* ---------- contrato (folha de papel) ---------- */
.rs-paper{background:var(--paper);color:var(--ink);font-family:var(--serif);font-size:15px;line-height:1.75;
  width:100%;max-width:794px;margin:0 auto;padding:64px 72px;text-align:justify;hyphens:auto}
.rs-paper h1{font-family:var(--sans);font-weight:700;font-size:19px;line-height:1.4;letter-spacing:.02em;margin:0 0 6px}
.rs-paper h2{font-family:var(--sans);font-weight:600;font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;margin:30px 0 8px;color:var(--ink);text-align:left}
.rs-paper h3{font-family:var(--sans);font-weight:600;font-size:14px;margin:20px 0 6px;text-align:left}
.rs-paper p{margin:0 0 10px}
.rs-paper ul,.rs-paper ol{margin:0 0 10px;padding-left:1.4em}
.rs-paper li{margin:0 0 4px}
.rs-paper blockquote{margin:12px 0;padding:2px 0 2px 16px;border-left:3px solid var(--accent);color:var(--muted)}
.rs-paper hr{border:0;border-top:1px solid var(--line);margin:22px 0}
.rs-paper table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}
.rs-paper th,.rs-paper td{border:1px solid var(--line);padding:6px 10px;vertical-align:top;text-align:left}
.rs-paper th{background:#f5f4f3;font-family:var(--sans);font-weight:600;font-size:12.5px}
.rs-paper a{color:var(--accent)}
.rs-paper mark.doc-missing{background:#fde8c8;color:#7a3b00;border-radius:3px;padding:0 3px;font-family:var(--sans);font-size:.82em}
.rs-paper [data-page-break]{border-top:1px dashed var(--line);margin:28px 0;height:0}
.rs-paper-head{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:28px}
.rs-paper-head img{height:34px;width:auto;object-fit:contain}
.rs-paper-head span{font-family:var(--sans);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
@media (max-width:640px){.rs-paper{padding:28px 22px;font-size:14.5px;text-align:left}}

/* ---------- apresentação (slides 1280×720) ---------- */
.rs-slide{position:relative;width:1280px;height:720px;overflow:hidden;background:var(--paper);color:var(--ink);font-family:var(--sans);display:flex;flex-direction:column;padding:72px 96px}
.rs-slide h2{font-family:var(--serif);font-weight:500;font-size:60px;line-height:1.1;margin:0 0 28px;letter-spacing:-.01em}
.rs-slide .rs-kicker{font-family:var(--sans);font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);font-weight:600;margin:0 0 18px}
.rs-slide .rs-body{font-size:26px;line-height:1.55;font-weight:300;white-space:pre-line;max-width:980px}
.rs-slide .rs-foot{position:absolute;left:96px;right:96px;bottom:34px;display:flex;justify-content:space-between;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.rs-slide .rs-bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--accent)}

.rs-slide--dark{background:#1c1c1c;color:#fff}
.rs-slide--dark .rs-foot{color:#9b9794}
.rs-slide--capa{justify-content:flex-end;background-size:cover;background-position:center}
.rs-slide--capa::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(28,28,28,.2) 0%,rgba(28,28,28,.88) 100%)}
.rs-slide--capa>*{position:relative}
.rs-slide--capa h2{font-size:86px;max-width:1000px;margin-bottom:20px}
.rs-slide--capa .rs-sub{font-size:30px;font-weight:300;color:#e4e1de;max-width:900px}
.rs-slide--capa .rs-logo{position:absolute;top:64px;left:96px;height:44px;width:auto}
.rs-slide--capa .rs-line{width:90px;height:4px;background:var(--accent);margin-bottom:34px}

.rs-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:22px 28px;margin-top:6px}
.rs-card{border:1px solid var(--line);border-radius:14px;padding:26px 30px;background:#fff}
.rs-card h3{font-family:var(--serif);font-size:28px;font-weight:500;margin:0 0 8px}
.rs-card p{margin:0;font-size:20px;line-height:1.5;font-weight:300;color:#444}

.rs-img{flex:1;min-height:0;border-radius:14px;background:#f5f4f3 center/cover no-repeat;margin-top:4px}
.rs-gallery{flex:1;min-height:0;display:grid;gap:16px;margin-top:4px}
.rs-gallery--1{grid-template-columns:1fr}.rs-gallery--2{grid-template-columns:1fr 1fr}
.rs-gallery--3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}.rs-gallery--3 .rs-ph:first-child{grid-row:span 2}
.rs-gallery--4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.rs-ph{border-radius:12px;background:#f5f4f3 center/cover no-repeat;min-height:0}
.rs-caption{font-size:20px;color:var(--muted);margin-top:14px;font-weight:300}

.rs-steps{display:grid;gap:0;margin-top:4px}
.rs-step{display:grid;grid-template-columns:220px 1fr;gap:28px;align-items:baseline;padding:20px 0;border-top:1px solid var(--line)}
.rs-step:first-child{border-top:0}
.rs-step b{font-family:var(--sans);font-weight:700;font-size:24px;color:var(--accent);letter-spacing:.01em}
.rs-step span{font-size:26px;font-weight:300}
.rs-step small{display:block;font-size:19px;color:var(--muted);margin-top:4px}

.rs-rows{display:grid;margin-top:2px}
.rs-row{display:flex;justify-content:space-between;gap:30px;align-items:baseline;padding:18px 0;border-bottom:1px solid var(--line);font-size:26px;font-weight:300}
.rs-row b{font-weight:600;white-space:nowrap}
.rs-row small{display:block;font-size:18px;color:var(--muted)}
.rs-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:26px;padding:24px 32px;border-radius:14px;background:var(--soft)}
.rs-total span{font-size:20px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--accent)}
.rs-total b{font-family:var(--serif);font-weight:500;font-size:56px}

.rs-slide--encerramento{justify-content:center;align-items:center;text-align:center}
.rs-slide--encerramento h2{font-size:78px}
.rs-slide--encerramento .rs-body{text-align:center;color:#e4e1de}

/* ---------- impressão / PDF ---------- */
@media print{
  .rs-paper{max-width:none;padding:0;box-shadow:none}
  .rs-paper [data-page-break]{border:0;margin:0;break-after:page}
  .rs-paper h1,.rs-paper h2,.rs-paper h3{break-after:avoid}
  .rs-paper p,.rs-paper li,.rs-paper tr{break-inside:avoid}
  .rs-slide{break-after:page;page-break-after:always}
}
`;
