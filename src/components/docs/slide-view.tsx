import type { CSSProperties } from "react";
import { resolveText } from "@/lib/docs/variables";
import type { Slide } from "@/lib/docs/types";

/** Só aceita imagens https, do próprio site ou embutidas (data:image). */
export function safeImg(url: string | undefined) {
  if (!url) return undefined;
  const u = url.trim();
  if (!/^(https:\/\/|\/[^/]|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(u)) return undefined;
  return u.replace(/["\\\n\r]/g, "");
}
const bg = (url: string | undefined): CSSProperties | undefined => {
  const u = safeImg(url);
  return u ? { backgroundImage: `url("${u}")` } : undefined;
};

/**
 * Um slide de 1280×720. Componente puro (sem estado): serve o editor, a página pública e o PDF.
 * Variáveis {{...}} são resolvidas aqui com o mapa recebido.
 */
export function SlideView({ slide, map, index, total, studioName }: { slide: Slide; map: Record<string, string>; index: number; total: number; studioName: string }) {
  const r = (s: string | undefined) => resolveText(s ?? "", map);
  const foot = (
    <div className="rs-foot">
      <span>{studioName}</span>
      <span>
        {index + 1} / {total}
      </span>
    </div>
  );

  switch (slide.layout) {
    case "capa":
      return (
        <div className="rs-slide rs-slide--capa rs-slide--dark" style={bg(slide.images?.[0])}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rs-logo" src="/logo-white.png" alt={studioName} />
          <div className="rs-line" />
          <h2>{r(slide.title)}</h2>
          {slide.subtitle && <p className="rs-sub">{r(slide.subtitle)}</p>}
        </div>
      );
    case "encerramento":
      return (
        <div className="rs-slide rs-slide--dark rs-slide--encerramento">
          <div className="rs-line" style={{ width: 90, height: 4, background: "var(--accent)", marginBottom: 34 }} />
          <h2>{r(slide.title)}</h2>
          {slide.body && <p className="rs-body">{r(slide.body)}</p>}
        </div>
      );
    case "texto":
      return (
        <div className="rs-slide">
          <div className="rs-bar" />
          <h2>{r(slide.title)}</h2>
          {slide.body && <p className="rs-body">{r(slide.body)}</p>}
          {foot}
        </div>
      );
    case "lista":
    case "condicoes":
      return (
        <div className="rs-slide">
          <div className="rs-bar" />
          <h2>{r(slide.title)}</h2>
          {slide.body && <p className="rs-body" style={{ marginBottom: 22, fontSize: 22 }}>{r(slide.body)}</p>}
          <div className="rs-cards">
            {(slide.items ?? []).slice(0, 6).map((it, i) => (
              <div className="rs-card" key={i}>
                <h3>{r(it.title)}</h3>
                {it.text && <p>{r(it.text)}</p>}
              </div>
            ))}
          </div>
          {foot}
        </div>
      );
    case "imagem":
      return (
        <div className="rs-slide">
          <div className="rs-bar" />
          <h2 style={{ fontSize: 48, marginBottom: 18 }}>{r(slide.title)}</h2>
          <div className="rs-img" style={bg(slide.images?.[0])} />
          {slide.body && <p className="rs-caption">{r(slide.body)}</p>}
          {foot}
        </div>
      );
    case "galeria": {
      const imgs = (slide.images ?? []).filter(Boolean).slice(0, 4);
      const n = Math.max(1, imgs.length);
      return (
        <div className="rs-slide">
          <div className="rs-bar" />
          <h2 style={{ fontSize: 48, marginBottom: 18 }}>{r(slide.title)}</h2>
          <div className={`rs-gallery rs-gallery--${n}`}>
            {(imgs.length ? imgs : [""]).map((u, i) => (
              <div className="rs-ph" key={i} style={bg(u)} />
            ))}
          </div>
          {foot}
        </div>
      );
    }
    case "cronograma":
      return (
        <div className="rs-slide">
          <div className="rs-bar" />
          <h2>{r(slide.title)}</h2>
          <div className="rs-steps">
            {(slide.items ?? []).slice(0, 6).map((it, i) => (
              <div className="rs-step" key={i}>
                <b>{r(it.value)}</b>
                <span>
                  {r(it.title)}
                  {it.text && <small>{r(it.text)}</small>}
                </span>
              </div>
            ))}
          </div>
          {foot}
        </div>
      );
    case "investimento":
      return (
        <div className="rs-slide">
          <div className="rs-bar" />
          <h2>{r(slide.title)}</h2>
          <div className="rs-rows">
            {(slide.items ?? []).slice(0, 6).map((it, i) => (
              <div className="rs-row" key={i}>
                <span>
                  {r(it.title)}
                  {it.text && <small>{r(it.text)}</small>}
                </span>
                <b>{r(it.value)}</b>
              </div>
            ))}
          </div>
          {slide.total && (
            <div className="rs-total">
              <span>Total</span>
              <b>{r(slide.total)}</b>
            </div>
          )}
          {foot}
        </div>
      );
  }
}
