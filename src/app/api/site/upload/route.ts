import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { siteDb, siteSchema } from "@/lib/site-db";

export const runtime = "nodejs";

const MAX = 4 * 1024 * 1024; // o navegador já comprime; limite do corpo na Vercel é ~4,5 MB
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

/** Envia uma imagem (já comprimida no navegador) para o Blob do site e registra na biblioteca. */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.mustChangePassword || !has(user, "site", "edit")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const token = process.env.SITE_BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Armazenamento de mídia do site não configurado." }, { status: 500 });

  const type = (request.headers.get("content-type") || "").split(";")[0];
  const ext = TYPES[type];
  if (!ext) return NextResponse.json({ error: "Envie uma imagem JPG, PNG ou WebP." }, { status: 415 });

  const input = Buffer.from(await request.arrayBuffer());
  if (!input.byteLength) return NextResponse.json({ error: "Arquivo vazio." }, { status: 422 });
  if (input.byteLength > MAX) return NextResponse.json({ error: "Imagem ainda grande demais depois de comprimir (máx. 4 MB)." }, { status: 413 });

  const url = new URL(request.url);
  const label = (url.searchParams.get("name") || "imagem").replace(/\.[a-z0-9]+$/i, "").slice(0, 120);
  const slug =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "imagem";

  try {
    const pathname = `uploads/${Date.now()}-${slug}.${ext}`;
    const blob = await put(pathname, input, { access: "public", contentType: type, token });
    const [row] = await siteDb.insert(siteSchema.media).values({ url: blob.url, pathname, label }).returning();
    await audit(user, "site_midia_enviada", `Enviou a imagem “${label}” para o site`, { entity: "site_midia", entityId: String(row.id) });
    return NextResponse.json({ url: blob.url, id: row.id, bytes: input.byteLength });
  } catch (err) {
    console.error("[site/upload]", err);
    return NextResponse.json({ error: "Falha ao enviar a imagem." }, { status: 500 });
  }
}
