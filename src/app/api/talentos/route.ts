import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { CV_MAX_BYTES } from "@/lib/talentos";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Entrada do Banco de Talentos (formulário /banco-de-talentos do site).
 * Chamada servidor→servidor, protegida por LEADS_API_KEY — mesma chave dos leads.
 * O currículo chega em base64 (≤ 2 MB) e é guardado na própria linha.
 */
const Body = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefone: z.string().trim().min(8).max(40),
  cidade: z.string().trim().min(2).max(80),
  uf: z.string().trim().length(2),
  link: z.string().trim().max(300).optional(),
  areas: z.array(z.string().trim().max(120)).min(1).max(12),
  areaOutra: z.string().trim().max(120).optional(),
  formacao: z.string().trim().min(2).max(80),
  anosExperiencia: z.string().trim().min(2).max(80),
  regimes: z.array(z.string().trim().max(60)).min(1).max(8),
  disponibilidade: z.string().trim().min(2).max(80),
  viaja: z.boolean(),
  viajaAte: z.string().trim().max(80).optional(),
  equipe: z.string().trim().min(2).max(120),
  equipeNota: z.string().trim().max(800).optional(),
  faixaSalarial: z.string().trim().min(2).max(80),
  experiencias: z
    .array(
      z.object({
        empresa: z.string().trim().max(120),
        cargo: z.string().trim().max(120),
        periodo: z.string().trim().max(60),
        atividades: z.string().trim().max(1200),
      }),
    )
    .min(1)
    .max(3),
  cv: z.object({
    nome: z.string().trim().min(1).max(120),
    tipo: z.enum([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    base64: z.string().min(100),
  }),
});

function authorized(req: Request) {
  const key = process.env.LEADS_API_KEY;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key || !got) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const d = parsed.data;

  const bytes = Buffer.from(d.cv.base64, "base64");
  if (bytes.length === 0 || bytes.length > CV_MAX_BYTES) {
    return NextResponse.json({ error: "Currículo fora do limite de tamanho." }, { status: 413 });
  }

  const [row] = await db
    .insert(schema.talentos)
    .values({
      nome: d.nome,
      email: d.email.toLowerCase(),
      telefone: d.telefone,
      cidade: d.cidade,
      uf: d.uf.toUpperCase(),
      link: d.link || null,
      areas: d.areas,
      areaOutra: d.areaOutra || null,
      formacao: d.formacao,
      anosExperiencia: d.anosExperiencia,
      regimes: d.regimes,
      disponibilidade: d.disponibilidade,
      viaja: d.viaja,
      viajaAte: d.viaja ? d.viajaAte || null : null,
      equipe: d.equipe,
      equipeNota: d.equipeNota || null,
      faixaSalarial: d.faixaSalarial,
      experiencias: d.experiencias,
      cvNome: d.cv.nome,
      cvTipo: d.cv.tipo,
      cvBytes: bytes.length,
      cvBase64: d.cv.base64,
    })
    .returning({ id: schema.talentos.id });

  revalidatePath("/contatos/talentos");
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
