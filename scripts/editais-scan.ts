/**
 * Varredura de editais de restauro (PNCP) — roda no GitHub Actions (.github/workflows/editais.yml) ou localmente.
 *
 *   # no GitHub Actions (sem segredos: autentica com o token OIDC do próprio GitHub):
 *   npx tsx scripts/editais-scan.ts --days 14 --source tudo
 *
 *   # teste local SEM enviar nada (só mostra o que acharia):
 *   node node_modules/tsx/dist/cli.mjs scripts/editais-scan.ts --dry --days 14 --source busca --out .tmp/scan.json
 *
 *   # teste local gravando direto no banco do .env.local (cuidado: o banco local = produção):
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/editais-scan.ts --local --days 14
 *
 * Opções: --days N (janela por data de publicação, padrão 14) · --source busca|consulta|tudo (padrão tudo)
 *         --mode auto|force (auto: só roda se houver pedido pendente, rodada para retomar ou execução diária/manual)
 *         --target URL (padrão https://crm.estudiorestaura.com.br) · --limit-ms N (teto de duração)
 *
 * Retomável: a cada lote o CRM guarda o ponto em que a varredura estava; se o job cair, a próxima execução continua dali.
 * Sem dependências de Next/banco (exceto no modo --local): só fetch e as regras de src/lib/editais.
 */
import fs from "node:fs";
import { runScan, type Scored } from "../src/lib/editais/scan";
import type { Cursor, EditalInput, RunStats } from "../src/lib/editais/types";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d = "") => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};

const TARGET = (opt("target") || process.env.EDITAIS_TARGET || "https://crm.estudiorestaura.com.br").replace(/\/$/, "");
const AUDIENCE = process.env.EDITAIS_OIDC_AUDIENCE || "https://crm.estudiorestaura.com.br";
const DAILY_CRON = process.env.EDITAIS_DAILY_CRON || "17 9 * * *";
const days = Math.max(1, Math.min(90, Number(opt("days", "14")) || 14));
const source = opt("source", "tudo");
const mode = opt("mode", "auto");
const budgetMs = Number(opt("limit-ms", String(5 * 3600e3)));
const dry = flag("dry");
const local = flag("local");
const out = opt("out");

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Token OIDC novo a cada chamada (vale poucos minutos). */
async function oidcToken(): Promise<string> {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error("Sem ACTIONS_ID_TOKEN_REQUEST_URL: o job precisa de `permissions: id-token: write` (e só funciona no GitHub Actions).");
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}audience=${encodeURIComponent(AUDIENCE)}`, { headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OIDC ${res.status}`);
  const j = (await res.json()) as { value?: string };
  if (!j.value) throw new Error("OIDC sem token");
  return j.value;
}

async function api<T = Record<string, unknown>>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${TARGET}${path}`, {
        method: init?.method ?? "GET",
        headers: { authorization: `Bearer ${await oidcToken()}`, "content-type": "application/json" },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(55000),
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text) as T;
      if (res.status < 500 && res.status !== 429) throw new Error(`CRM ${res.status}: ${text.slice(0, 300)}`);
      lastErr = new Error(`CRM ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && /^CRM 4\d\d/.test(e.message) && !/429/.test(e.message)) throw e;
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error("falha ao falar com o CRM");
}

const plain = (it: Scored): EditalInput => {
  const { score, kind, kindWhy, matched, relevant, ...rest } = it;
  void [score, kind, kindWhy, matched, relevant];
  return rest;
};

async function main() {
  const started = Date.now();
  const deadline = started + budgetMs;
  const sources = source === "busca" ? (["busca"] as const) : source === "consulta" ? (["consulta"] as const) : (["busca", "consulta"] as const);

  /* ---------------- teste local sem enviar ---------------- */
  if (dry) {
    const all: Scored[] = [];
    const res = await runScan({ mode: "completa", days, sources: [...sources], deadline, log, sink: async (items) => void all.push(...items) });
    log(`FIM (dry): ${JSON.stringify(res.stats)} completo=${res.completed}${res.error ? ` erro=${res.error}` : ""}`);
    if (out) fs.writeFileSync(out, JSON.stringify(all, null, 1));
    return;
  }

  /* ---------------- teste local gravando direto no banco ---------------- */
  if (local) {
    await import("./_server-only.cjs");
    const ing = await import("../src/lib/editais/ingest");
    await ing.ensureSources();
    const run = await ing.createRun({ mode: "completa", trigger: "agendada", status: "executando", days });
    const tot = { created: 0, updated: 0 };
    const res = await runScan({
      mode: "completa",
      days,
      sources: [...sources],
      deadline,
      log,
      sink: async (items, cursor, stats) => {
        if (items.length) {
          const r = await ing.ingestBatch(items.map(plain), run.id);
          tot.created += r.created;
          tot.updated += r.updated;
        }
        await ing.heartbeat(run.id, { ...stats, ...tot }, cursor);
      },
    });
    await ing.finishRun(run.id, res.completed ? "concluida" : "parcial", { ...res.stats, ...tot }, res.error ?? null, res.cursor);
    log(`FIM (local, run ${run.id}): ${JSON.stringify({ ...res.stats, ...tot })}`);
    return;
  }

  /* ---------------- GitHub Actions → CRM ---------------- */
  const event = process.env.EVENT_NAME || process.env.GITHUB_EVENT_NAME || "";
  const schedule = process.env.EVENT_SCHEDULE || "";
  const daily = event === "workflow_dispatch" || (event === "schedule" && schedule === DAILY_CRON);
  const pend = await api<{ pending: { id: number; days: number; requestedBy: string | null } | null; resume: { id: number; days: number; cursor: Cursor | null } | null }>("/api/editais/pending");
  log(`pendente: ${pend.pending ? `pedido #${pend.pending.id} de ${pend.pending.requestedBy ?? "?"}` : "nenhum"} · retomar: ${pend.resume ? `#${pend.resume.id}` : "nada"} · diária/manual: ${daily}`);
  if (mode !== "force" && !pend.pending && !pend.resume && !daily) {
    log("Nada a fazer nesta verificação.");
    return;
  }

  const runUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  const begin = await api<{ run: { id: number; days: number; cursor: Cursor | null } }>("/api/editais/ingest", {
    method: "POST",
    body: { action: "begin", runId: pend.pending?.id ?? null, resumeId: pend.pending ? null : (pend.resume?.id ?? null), days: pend.pending?.days ?? pend.resume?.days ?? days, runUrl, scheduled: daily && !pend.pending },
  });
  const runId = begin.run.id;
  const resumeCursor = pend.pending ? null : (begin.run.cursor ?? null);
  log(`Rodada #${runId} (${resumeCursor ? `retomando de ${JSON.stringify(resumeCursor)}` : "do começo"}), janela ${begin.run.days} dias`);

  let created = 0;
  let updated = 0;
  let lastStats: RunStats = {};
  let lastCursor: Cursor | null = resumeCursor;
  let failure: string | null = null;
  try {
    const res = await runScan({
      mode: "completa",
      days: begin.run.days,
      sources: [...sources],
      deadline,
      cursor: resumeCursor,
      log,
      sink: async (items, cursor, stats) => {
        lastStats = stats;
        lastCursor = cursor;
        for (let i = 0; i < Math.max(items.length, 1); i += 80) {
          const chunk = items.slice(i, i + 80).map(plain);
          if (!chunk.length && i > 0) break;
          const r = await api<{ created?: number; updated?: number }>("/api/editais/ingest", { method: "POST", body: { action: "batch", runId, items: chunk, cursor, stats: { ...stats, created, updated } } });
          created += r.created ?? 0;
          updated += r.updated ?? 0;
        }
      },
    });
    lastStats = res.stats;
    lastCursor = res.cursor;
    failure = res.completed ? null : (res.error ?? "interrompida");
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  const stats = { ...lastStats, created, updated };
  log(`FIM: ${failure ? `PARCIAL (${failure})` : "concluída"} — ${JSON.stringify(stats)}`);
  await api("/api/editais/ingest", { method: "POST", body: { action: "finish", runId, status: failure ? "parcial" : "concluida", stats, error: failure, cursor: failure ? lastCursor : null } }).catch((e) => log(`não consegui encerrar a rodada: ${e instanceof Error ? e.message : e}`));
  if (failure && !/tempo|deadline/i.test(failure)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
