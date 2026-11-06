import sharp, { type OverlayOptions } from "sharp";
import { LOGO_B64 } from "./watermark-logo";

/**
 * Marca d'água das fotos do Estúdio Restaura.
 * Duas camadas, para valer também em prints e downloads diretos:
 *  1. logo no canto inferior direito (legível, com sombra suave);
 *  2. trama diagonal muito discreta repetida por toda a imagem (difícil de recortar).
 */
const logoBuf = Buffer.from(LOGO_B64, "base64");
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

/** Logo na largura `width`, com opacidade `alpha` e sombra escura desfocada. */
async function mark(width: number, alpha: number) {
  const base = await sharp(logoBuf).resize({ width: Math.max(40, Math.round(width)) }).ensureAlpha().png().toBuffer();
  const light = await sharp(base).linear([1, 1, 1, alpha], [0, 0, 0, 0]).png().toBuffer();
  const pad = Math.round(width * 0.05) + 2;
  const shadow = await sharp(base)
    .linear([0, 0, 0, alpha * 0.85], [0, 0, 0, 0])
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: clear })
    .blur(Math.max(0.8, width * 0.012))
    .png()
    .toBuffer();
  return sharp(shadow).composite([{ input: light, left: pad, top: pad }]).png().toBuffer();
}

/** Aplica a marca e devolve a imagem no mesmo formato (JPEG/WebP/PNG) da entrada, ou no `format` pedido. */
export async function applyWatermark(input: Buffer, format?: "jpeg" | "webp" | "png"): Promise<Buffer> {
  const img = sharp(input, { failOn: "none" });
  const meta = await img.metadata();
  const { width = 0, height = 0 } = meta;
  if (!width || !height) return input;
  const short = Math.min(width, height);

  // 1) logo no canto
  const cornerW = Math.max(110, Math.min(width * 0.2, short * 0.32));
  const corner = await mark(cornerW, 0.78);
  const cm = await sharp(corner).metadata();
  const margin = Math.round(short * 0.025);

  // 2) trama diagonal discreta
  const patW = Math.max(120, short * 0.17);
  const pat = await mark(patW, 0.17);
  const rotated = await sharp(pat).rotate(-28, { background: clear }).png().toBuffer();
  const rm = await sharp(rotated).metadata();
  const gapX = Math.round(patW * 0.9);
  const gapY = Math.round(patW * 0.55);
  const tile = await sharp(rotated)
    .extend({ top: 0, left: 0, right: gapX, bottom: gapY, background: clear })
    .png()
    .toBuffer();

  const layers: OverlayOptions[] = [];
  if ((rm.width ?? 0) + gapX < width && (rm.height ?? 0) + gapY < height) layers.push({ input: tile, tile: true, left: 0, top: 0 });
  layers.push({
    input: corner,
    left: Math.max(0, Math.round(width - (cm.width ?? 0) - margin)),
    top: Math.max(0, Math.round(height - (cm.height ?? 0) - margin)),
  });

  const out = sharp(input, { failOn: "none" }).composite(layers);
  const f = format ?? (meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpeg");
  if (f === "png") return out.png({ compressionLevel: 9 }).toBuffer();
  if (f === "webp") return out.webp({ quality: 86 }).toBuffer();
  return out.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}
