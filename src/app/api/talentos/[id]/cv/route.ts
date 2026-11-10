import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, has } from "@/lib/auth";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Baixa o currículo de um talento. Só para quem acessa "Leads e contatos" (nada de link público). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.mustChangePassword || user.ownOnly || !has(user, "contatos")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const [t] = await db
    .select({ nome: schema.talentos.nome, cvNome: schema.talentos.cvNome, cvTipo: schema.talentos.cvTipo, cvBase64: schema.talentos.cvBase64 })
    .from(schema.talentos)
    .where(eq(schema.talentos.id, id))
    .limit(1);
  if (!t) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const ext = EXT[t.cvTipo] ?? "pdf";
  const base = `curriculo-${t.nome}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60);
  const body = Buffer.from(t.cvBase64, "base64");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": t.cvTipo,
      "Content-Disposition": `attachment; filename="${base}.${ext}"`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
