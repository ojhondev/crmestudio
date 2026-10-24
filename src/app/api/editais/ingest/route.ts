import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/audit";
import { BatchSchema, beginGithubRun, finishRun, heartbeat, ingestBatch } from "@/lib/editais/ingest";
import { bearer, oidcConfig, verifyGithubOidc } from "@/lib/editais/oidc";

export const maxDuration = 60;

const Begin = z.object({
  action: z.literal("begin"),
  runId: z.number().int().positive().nullish(),
  resumeId: z.number().int().positive().nullish(),
  days: z.number().int().min(1).max(90).default(14),
  runUrl: z.string().url().max(300).nullish(),
  scheduled: z.boolean().default(false),
});
const Batch = BatchSchema.extend({ action: z.literal("batch"), runId: z.number().int().positive() });
const Finish = z.object({
  action: z.literal("finish"),
  runId: z.number().int().positive(),
  status: z.enum(["concluida", "parcial", "falhou"]),
  stats: z.record(z.string(), z.unknown()).default({}),
  error: z.string().max(500).nullish(),
  cursor: z.object({ phase: z.string().max(20), step: z.number().int().optional(), page: z.number().int().optional() }).nullish(),
});
const Body = z.discriminatedUnion("action", [Begin, Batch, Finish]);

/**
 * Recebe os resultados da varredura feita pelo GitHub Actions. SEM segredos: a autenticação é o token OIDC do próprio
 * GitHub (assinado, com repositório, branch e workflow) — ver lib/editais/oidc.ts.
 *   begin  — assume o pedido pendente (ou retoma uma rodada parcial, ou abre uma rodada agendada)
 *   batch  — lote de editais (a relevância é recalculada aqui; gravação idempotente)
 *   finish — encerra a rodada
 */
export async function POST(req: Request) {
  const auth = await verifyGithubOidc(bearer(req), oidcConfig());
  if (!auth.ok) {
    console.warn("[editais] ingestão recusada:", auth.reason);
    return NextResponse.json({ error: "Não autorizado", reason: auth.reason }, { status: 401 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Corpo inválido", detail: e instanceof z.ZodError ? e.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) : undefined }, { status: 400 });
  }

  if (body.action === "begin") {
    const run = await beginGithubRun({ runId: body.runId, resumeId: body.resumeId, days: body.days, runUrl: body.runUrl, scheduled: body.scheduled });
    return NextResponse.json({ ok: true, run: { id: run.id, days: run.days, cursor: run.cursor } });
  }

  const [run] = await db.select().from(schema.editalRuns).where(eq(schema.editalRuns.id, body.runId));
  if (!run) return NextResponse.json({ error: "Rodada inexistente" }, { status: 404 });

  if (body.action === "batch") {
    if (run.status !== "executando") return NextResponse.json({ error: `Rodada ${run.status}` }, { status: 409 });
    const r = await ingestBatch(body.items, run.id);
    await heartbeat(run.id, body.stats as never, body.cursor ?? null);
    return NextResponse.json({ ok: true, ...r, createdIds: undefined });
  }

  await finishRun(run.id, body.status, body.stats as never, body.error ?? null, body.cursor ?? null);
  await db
    .update(schema.editalSources)
    .set({ lastRunAt: new Date(), lastStatus: body.status, lastCount: Number((body.stats as { relevant?: number }).relevant ?? 0) })
    .where(eq(schema.editalSources.key, "pncp-consulta"));
  await audit(null, "editais_varredura", `Varredura completa (GitHub) ${body.status}: ${JSON.stringify(body.stats).slice(0, 200)}`, { entity: "edital", meta: { runId: run.id } });
  return NextResponse.json({ ok: true });
}
