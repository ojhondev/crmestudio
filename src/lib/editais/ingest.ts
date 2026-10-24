import "server-only";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fireEditalEvent } from "@/lib/automations-engine";
import { runScan } from "./scan";
import { titleOf } from "./pncp";
import { triage } from "./triage";
import { ESFERAS, SCORE_STORE_MIN, SITUATIONS, type Cursor, type RunStats, type RunStatus } from "./types";

/* --------------------------------- entrada validada --------------------------------- */

const str = (n: number) => z.string().trim().max(n);
const optStr = (n: number) => z.string().trim().max(n).nullish().transform((v) => v || null);
const optDate = z.string().max(40).nullish().transform((v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
});

const ItemSchema = z.object({
  externalId: str(80).min(5),
  source: str(40).default("pncp-busca"),
  object: str(12000).min(8),
  organ: str(300).default(""),
  organCnpj: optStr(20),
  unit: optStr(300),
  esfera: z.enum(ESFERAS as [string, ...string[]]).nullish().transform((v) => v ?? null),
  uf: optStr(2),
  city: optStr(120),
  ibge: optStr(10),
  modalidade: optStr(120),
  modalidadeId: z.number().int().nullish().transform((v) => v ?? null),
  situation: z.enum(SITUATIONS as [string, ...string[]]).default("aberto"),
  valueCents: z.number().int().min(0).max(1e15).nullish().transform((v) => v || null),
  publishedAt: optDate,
  openAt: optDate,
  closeAt: optDate,
  url: optStr(400),
  sourceUrl: optStr(1000),
});

export const BatchSchema = z.object({
  runId: z.number().int().positive().optional(),
  items: z.array(ItemSchema).max(300),
  cursor: z.object({ phase: z.string().max(20), step: z.number().int().optional(), page: z.number().int().optional() }).nullish(),
  stats: z.record(z.string(), z.unknown()).optional(),
});

const httpUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export type IngestResult = { received: number; kept: number; created: number; updated: number; filtered: number; createdIds: string[] };

/**
 * Grava um lote de editais. A relevância é SEMPRE recalculada aqui (a verdade está no servidor, não no que o coletor mandou).
 * Idempotente: o mesmo edital (numeroControlePNCP) nunca duplica; reenviar só atualiza prazo, situação e valor.
 */
export async function ingestBatch(raw: unknown[], runId: number | null, opts: { notify?: boolean } = {}): Promise<IngestResult> {
  const parsed = raw.map((r) => ItemSchema.safeParse(r)).flatMap((r) => (r.success ? [r.data] : []));
  const result: IngestResult = { received: raw.length, kept: 0, created: 0, updated: 0, filtered: 0, createdIds: [] };
  if (!parsed.length) return result;

  type Row = typeof schema.editais.$inferInsert;
  const scored = new Map<string, Row>();
  for (const it of parsed) {
    const t = triage(it.object, `${it.organ} ${it.unit ?? ""}`);
    if (t.score < SCORE_STORE_MIN) {
      result.filtered++;
      continue;
    }
    scored.set(it.externalId, {
      externalId: it.externalId,
      source: it.source,
      title: titleOf(it.object),
      object: it.object,
      organ: it.organ || it.unit || "Órgão não informado",
      organCnpj: it.organCnpj,
      unit: it.unit,
      esfera: it.esfera,
      uf: it.uf?.toUpperCase() ?? null,
      city: it.city,
      ibge: it.ibge,
      modalidade: it.modalidade,
      kind: t.kind,
      kindWhy: t.kindWhy,
      score: t.score,
      matched: t.matched.slice(0, 20),
      valueCents: it.valueCents,
      publishedAt: it.publishedAt,
      openAt: it.openAt,
      closeAt: it.closeAt,
      situation: it.situation,
      url: httpUrl(it.url),
      sourceUrl: httpUrl(it.sourceUrl),
      runId,
    });
  }
  result.kept = scored.size;
  if (!scored.size) return result;

  const ids = [...scored.keys()];
  const existing = await db
    .select({ id: schema.editais.id, externalId: schema.editais.externalId, closeAt: schema.editais.closeAt, situation: schema.editais.situation, valueCents: schema.editais.valueCents })
    .from(schema.editais)
    .where(inArray(schema.editais.externalId, ids));
  const have = new Map(existing.map((e) => [e.externalId, e]));
  const now = new Date();

  const fresh = [...scored.values()].filter((r) => !have.has(r.externalId));
  if (fresh.length) {
    const inserted = await db
      .insert(schema.editais)
      .values(fresh)
      .onConflictDoNothing({ target: schema.editais.externalId })
      .returning({ id: schema.editais.id, score: schema.editais.score });
    result.created = inserted.length;
    result.createdIds = inserted.map((r) => r.id);
  }

  for (const row of scored.values()) {
    const cur = have.get(row.externalId);
    if (!cur) continue;
    const changes: string[] = [];
    const newClose = row.closeAt ? new Date(row.closeAt) : null;
    if ((cur.closeAt?.getTime() ?? null) !== (newClose?.getTime() ?? null) && newClose) {
      changes.push(`Prazo de propostas alterado${cur.closeAt ? ` de ${cur.closeAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""} para ${newClose.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
    }
    if (cur.situation !== row.situation) changes.push(`Situação no portal: ${cur.situation} → ${row.situation}`);
    if (row.valueCents && cur.valueCents && Math.abs(row.valueCents - cur.valueCents) > 100) changes.push("Valor estimado atualizado");
    const { runId: _r, ...rest } = row;
    void _r;
    await db
      .update(schema.editais)
      .set({ ...rest, lastSeenAt: now, ...(changes.length ? { updatedAt: now } : {}) })
      .where(eq(schema.editais.id, cur.id));
    if (changes.length) {
      await db.insert(schema.editalEvents).values(changes.map((body) => ({ editalId: cur.id, type: "portal", body })));
    }
    result.updated++;
  }

  // avisos / automações para os novos relevantes (sem derrubar a gravação)
  if (result.createdIds.length && opts.notify !== false) {
    const top = await db
      .select({ id: schema.editais.id })
      .from(schema.editais)
      .where(inArray(schema.editais.id, result.createdIds))
      .orderBy(desc(schema.editais.score))
      .limit(25);
    for (const t of top) await fireEditalEvent(["edital_new"], t.id);
  }
  return result;
}

/* ------------------------------------ rodadas ------------------------------------ */

const STALE_MIN = 25;
const REQUEST_STALE_H = 6;

/** Rodadas travadas (sem sinal de vida há muito tempo) viram "falhou"/"parcial"; pedidos antigos demais expiram. */
export async function sweepStaleRuns() {
  const cut = new Date(Date.now() - STALE_MIN * 60_000);
  await db
    .update(schema.editalRuns)
    .set({ status: "parcial", finishedAt: new Date(), error: "A rodada parou de responder; será retomada do ponto em que estava." })
    .where(and(eq(schema.editalRuns.status, "executando"), lt(sql`coalesce(${schema.editalRuns.heartbeatAt}, ${schema.editalRuns.startedAt}, ${schema.editalRuns.requestedAt})`, cut)));
  await db
    .update(schema.editalRuns)
    .set({ status: "falhou", finishedAt: new Date(), error: "Ninguém atendeu o pedido a tempo." })
    .where(and(eq(schema.editalRuns.status, "solicitada"), eq(schema.editalRuns.mode, "completa"), lt(schema.editalRuns.requestedAt, new Date(Date.now() - REQUEST_STALE_H * 3600e3))));
}

export async function createRun(v: { mode: "rapida" | "completa"; trigger: "painel" | "agendada" | "github"; status: RunStatus; days: number; by?: { id: string; name: string } | null; parentId?: number | null; runUrl?: string | null }) {
  const [r] = await db
    .insert(schema.editalRuns)
    .values({
      mode: v.mode,
      trigger: v.trigger,
      status: v.status,
      days: v.days,
      requestedById: v.by?.id ?? null,
      requestedByName: v.by?.name ?? null,
      parentId: v.parentId ?? null,
      runUrl: v.runUrl ?? null,
      startedAt: v.status === "executando" ? new Date() : null,
      heartbeatAt: v.status === "executando" ? new Date() : null,
    })
    .returning();
  return r;
}

export async function finishRun(id: number, status: RunStatus, stats: RunStats, error?: string | null, cursor?: Cursor | null) {
  await db
    .update(schema.editalRuns)
    .set({ status, finishedAt: new Date(), stats: stats as Record<string, unknown>, error: error ?? null, cursor: cursor ?? null })
    .where(eq(schema.editalRuns.id, id));
}

/** O que o GitHub Actions precisa saber: há pedido pendente? há rodada interrompida para retomar? */
export async function pendingForGithub() {
  await sweepStaleRuns();
  const [req] = await db
    .select()
    .from(schema.editalRuns)
    .where(and(eq(schema.editalRuns.status, "solicitada"), eq(schema.editalRuns.mode, "completa")))
    .orderBy(schema.editalRuns.requestedAt)
    .limit(1);
  const [partial] = await db
    .select()
    .from(schema.editalRuns)
    .where(and(eq(schema.editalRuns.status, "parcial"), eq(schema.editalRuns.mode, "completa"), sql`${schema.editalRuns.cursor} is not null`, sql`${schema.editalRuns.finishedAt} > now() - interval '12 hours'`))
    .orderBy(desc(schema.editalRuns.id))
    .limit(1);
  return {
    pending: req ? { id: req.id, days: req.days, requestedBy: req.requestedByName, requestedAt: req.requestedAt.toISOString() } : null,
    resume: partial ? { id: partial.id, days: partial.days, cursor: partial.cursor } : null,
  };
}

/** O GitHub assume um pedido (ou retoma uma rodada parcial, ou abre uma nova rodada agendada). */
export async function beginGithubRun(o: { runId?: number | null; resumeId?: number | null; days: number; runUrl?: string | null; scheduled: boolean }) {
  await sweepStaleRuns();
  const now = new Date();
  if (o.runId) {
    const [r] = await db
      .update(schema.editalRuns)
      .set({ status: "executando", startedAt: now, heartbeatAt: now, runUrl: o.runUrl ?? null, trigger: "github", error: null })
      .where(and(eq(schema.editalRuns.id, o.runId), eq(schema.editalRuns.status, "solicitada")))
      .returning();
    if (r) return r;
  }
  if (o.resumeId) {
    const [r] = await db
      .update(schema.editalRuns)
      .set({ status: "executando", heartbeatAt: now, runUrl: o.runUrl ?? null, error: null, finishedAt: null })
      .where(and(eq(schema.editalRuns.id, o.resumeId), eq(schema.editalRuns.status, "parcial")))
      .returning();
    if (r) return r;
  }
  return createRun({ mode: "completa", trigger: o.scheduled ? "agendada" : "github", status: "executando", days: o.days, runUrl: o.runUrl });
}

export async function heartbeat(runId: number, stats: RunStats | undefined, cursor: Cursor | null | undefined) {
  await db
    .update(schema.editalRuns)
    .set({ heartbeatAt: new Date(), ...(stats ? { stats: stats as Record<string, unknown> } : {}), ...(cursor ? { cursor: cursor as Record<string, unknown> } : {}) })
    .where(eq(schema.editalRuns.id, runId));
}

/* ------------------------------ varredura rápida (CRM) ------------------------------ */

const QUICK_BUDGET_MS = 48_000;

/**
 * Varredura rápida direto na função da Vercel (teto de 60s): só a busca do portal, com as consultas mais produtivas.
 * Roda depois de responder à pessoa (`after`) e atualiza a rodada, que a tela acompanha por polling.
 */
export async function runQuickScan(runId: number, days: number) {
  const deadline = Date.now() + QUICK_BUDGET_MS;
  const totals = { created: 0, updated: 0 };
  let last: RunStats = {};
  try {
    const res = await runScan({
      mode: "rapida",
      days,
      deadline,
      sink: async (items, cursor, stats) => {
        last = stats;
        if (items.length) {
          const r = await ingestBatch(items, runId);
          totals.created += r.created;
          totals.updated += r.updated;
        }
        await heartbeat(runId, { ...stats, ...totals }, cursor);
      },
    });
    const stats = { ...res.stats, ...totals };
    await finishRun(runId, res.completed ? "concluida" : "parcial", stats, res.completed ? null : res.error);
    await db.update(schema.editalSources).set({ lastRunAt: new Date(), lastStatus: res.completed ? "ok" : "parcial", lastCount: stats.relevant ?? 0 }).where(eq(schema.editalSources.key, "pncp-busca"));
    return stats;
  } catch (e) {
    await finishRun(runId, "falhou", { ...last, ...totals }, e instanceof Error ? e.message : "erro");
    return null;
  }
}

export async function ensureSources() {
  await db
    .insert(schema.editalSources)
    .values([
      { key: "pncp-busca", name: "PNCP — busca do portal (rápida)" },
      { key: "pncp-consulta", name: "PNCP — consulta oficial de propostas abertas (completa)" },
    ])
    .onConflictDoNothing();
}

/* ------------------------- pedido pelo botão + GitHub opcional ------------------------- */

/** Dispara o workflow no GitHub, se existirem GITHUB_DISPATCH_TOKEN + GITHUB_REPO (opcional; sem isso o agendamento de 30 min atende). */
export async function dispatchWorkflow(days: number): Promise<{ ok: boolean; note: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO || "ojhondev/crmestudio";
  if (!token) return { ok: false, note: "sem GITHUB_DISPATCH_TOKEN: o GitHub atende o pedido na próxima verificação (até ~30 min)" };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/editais.yml/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "crm-estudio-restaura" },
      body: JSON.stringify({ ref: "main", inputs: { dias: String(days), fonte: "tudo" } }),
      signal: AbortSignal.timeout(8000),
    });
    return res.status === 204 ? { ok: true, note: "workflow disparado no GitHub" } : { ok: false, note: `GitHub respondeu ${res.status}` };
  } catch {
    return { ok: false, note: "não consegui falar com o GitHub" };
  }
}

/** Pedido do botão: registra a solicitação (o GitHub atende), tenta o disparo imediato e cria a rodada rápida. */
export async function requestScan(by: { id: string; name: string }, days = 14) {
  await ensureSources();
  await sweepStaleRuns();
  const [open] = await db
    .select()
    .from(schema.editalRuns)
    .where(or(and(eq(schema.editalRuns.status, "solicitada"), eq(schema.editalRuns.mode, "completa")), and(eq(schema.editalRuns.status, "executando"), eq(schema.editalRuns.mode, "completa"))))
    .orderBy(desc(schema.editalRuns.id))
    .limit(1);
  const request = open ?? (await createRun({ mode: "completa", trigger: "painel", status: "solicitada", days, by }));
  const dispatch = open ? { ok: false, note: "já havia um pedido em andamento" } : await dispatchWorkflow(days);
  const [busy] = await db
    .select({ id: schema.editalRuns.id })
    .from(schema.editalRuns)
    .where(and(eq(schema.editalRuns.mode, "rapida"), eq(schema.editalRuns.status, "executando"), sql`${schema.editalRuns.startedAt} > now() - interval '2 minutes'`))
    .limit(1);
  let quick: typeof request | null = null;
  if (!busy) quick = await createRun({ mode: "rapida", trigger: "painel", status: "executando", days, by, parentId: request.id });
  if (!open) await audit(by, "editais_busca", `Pediu a busca de editais de restauro (${days} dias)`, { entity: "edital", meta: { runId: request.id, dispatch: dispatch.note } });
  return { request, quick, dispatch, alreadyOpen: !!open };
}

