"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { atLeast } from "@/lib/permissions";
import { escapeHtml } from "@/lib/docs/variables";
import { parseLocalInput, toLocalInput } from "@/lib/format";
import { createPriceSheet, editalNote, generateDocs, setDocFields, toggleItem } from "@/lib/propostas/ops";
import { getConfig } from "@/lib/propostas/server";
import {
  addItemAction,
  addRequirementAction,
  applyChecklistAction,
  generateDocsAction,
  insertAtestadosAction,
  participarAction,
  recalcDeadlinesAction,
  setResultAction,
  setStepAction,
  syncTasksAction,
  updateDossieAction,
  updateRequirementAction,
} from "@/app/(app)/editais-avancado/proposta-actions";
import { saveCofreDocAction } from "@/app/(app)/editais-avancado/cofre-actions";
import { savePortfolioAction } from "@/app/(app)/editais-avancado/portfolio-actions";
import { addComment } from "../collab";
import { cleanPriceItems, parseHabChoice, validUrlOrEmpty, type ParticiparValues, type PriceItem } from "../flow-rules";
import { shareEditais } from "../partners";
import { requireEditais } from "../session";
import type { WizardResult } from "@/components/editais-app/wizard/wizard";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
type Err = { error: string };

/** Só a equipe com “editar” em Editais conduz os assistentes. */
async function staff() {
  const s = await requireEditais();
  if (s.actor.kind !== "staff" || !atLeast(s.actor.level, "edit") || !has(s.user, "editais", "edit")) return null;
  return { ...s, actor: s.actor };
}

const NO = { error: "Só a equipe pode fazer isso." } as const;
const errOf = (r: unknown): string | null => (r && typeof r === "object" && "error" in r && (r as Err).error ? (r as Err).error : null);

async function dossieOf(editalId: string) {
  const [d] = await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, editalId)).limit(1);
  return d ?? null;
}

function refresh(editalId: string) {
  revalidatePath("/editais", "layout");
  revalidatePath(`/editais/propostas/${editalId}`);
}

/* ------------------------------ Vou participar ------------------------------ */

export async function participarFlow(editalId: string, v: ParticiparValues): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  if (!isId(editalId)) return { error: "Edital inválido." };
  // a data só vira “própria da proposta” se for diferente da do portal (assim mudanças do portal continuam valendo)
  const [ed] = await db.select({ closeAt: schema.editais.closeAt, openAt: schema.editais.openAt }).from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  if (!ed) return { error: "Edital não encontrado." };
  const sessionAt = v.sessionAt && v.sessionAt !== toLocalInput(ed.closeAt ?? ed.openAt) ? v.sessionAt : null;
  const r = (await participarAction(editalId, { templateKey: v.templateKey, withDeal: true, withTasks: true, sessionAt, ownerId: v.ownerId || null })) as { created?: boolean; notes?: string[]; items?: number; tasks?: number; error?: string };
  if (r.error) return { error: r.error };
  if (!r.created) {
    // a proposta já existia: aplica as escolhas do assistente sem duplicar nada
    const u = await updateDossieAction(editalId, { sessionAt, ownerId: v.ownerId || null });
    if (errOf(u)) return { error: errOf(u) as string };
    if (sessionAt) await recalcDeadlinesAction(editalId);
    if (v.templateKey) await applyChecklistAction(editalId, v.templateKey);
  }
  let shared = 0;
  if (v.partnerIds.length) {
    const sh = await shareEditais({ id: s.actor.id, name: s.actor.name }, { editalIds: [editalId], partnerIds: v.partnerIds, role: v.partnerRole, scope: "proposta" });
    if ("ok" in sh) shared = v.partnerIds.length;
  }
  refresh(editalId);
  const bits = [r.created ? `${r.items ?? 0} itens no checklist${r.tasks ? ` e ${r.tasks} tarefas` : ""}` : "Proposta atualizada", shared ? `compartilhada com ${shared} ${shared === 1 ? "parceiro" : "parceiros"}` : "", ...(r.notes ?? [])].filter(Boolean);
  return { ok: true, href: `/editais/propostas/${editalId}`, title: r.created ? "Proposta criada" : "Proposta atualizada", message: `${bits.join(" · ")}.`, next: { label: "Começar pela habilitação", href: `/editais/propostas/${editalId}/habilitacao` } };
}

/* ------------------------------ Habilitação ------------------------------ */

export type HabilitacaoInput = { decisions: Record<string, string>; extra: string; conclude: boolean };

export async function habilitacaoFlow(editalId: string, v: HabilitacaoInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  const d = await dossieOf(editalId);
  if (!d) return { error: "Esta proposta ainda não foi iniciada." };
  const existing = await db.select({ title: schema.propostaItems.title }).from(schema.propostaItems).where(and(eq(schema.propostaItems.dossieId, d.id), eq(schema.propostaItems.stepKey, "habilitacao")));
  const have = new Set(existing.map((e) => e.title.toLowerCase()));
  const reqs = await db.select().from(schema.propostaRequirements).where(eq(schema.propostaRequirements.dossieId, d.id));
  let falta = 0;
  for (const [reqId, choice] of Object.entries(v.decisions ?? {})) {
    const req = reqs.find((r) => r.id === reqId);
    const dec = parseHabChoice(choice);
    if (!req || !dec) continue;
    let res: unknown;
    if (dec.kind === "doc") res = await updateRequirementAction(reqId, { mode: "auto", cofreDocId: dec.docId });
    else if (dec.kind === "ok_manual") res = await updateRequirementAction(reqId, { mode: "ok_manual" });
    else if (dec.kind === "na") res = await updateRequirementAction(reqId, { mode: "na" });
    else {
      res = await updateRequirementAction(reqId, { mode: "auto", cofreDocId: null });
      const title = `Providenciar: ${req.title}`.slice(0, 200);
      if (!have.has(title.toLowerCase())) {
        const add = await addItemAction(editalId, "habilitacao", title);
        if (errOf(add)) return { error: errOf(add) as string };
        have.add(title.toLowerCase());
      }
      falta++;
    }
    if (errOf(res)) return { error: errOf(res) as string };
  }
  const extra = str(v.extra, 200);
  if (extra && !reqs.some((r) => r.title.toLowerCase() === extra.toLowerCase())) {
    const r = await addRequirementAction(editalId, extra);
    if (errOf(r)) return { error: errOf(r) as string };
  }
  if (falta && has(s.user, "tarefas", "edit")) await syncTasksAction(editalId);
  const step = await setStepAction(editalId, "habilitacao", { status: v.conclude && !falta ? "concluida" : "em_andamento" });
  if (errOf(step)) return { error: errOf(step) as string };
  await audit(s.actor, "habilitacao_conferida", `Conferiu a habilitação de uma proposta (${falta} a providenciar)`, { entity: "edital", entityId: editalId });
  refresh(editalId);
  return {
    ok: true,
    href: `/editais/propostas/${editalId}`,
    title: falta ? "Habilitação conferida" : "Habilitação em dia",
    message: falta ? `${falta} ${falta === 1 ? "documento falta" : "documentos faltam"}: as tarefas já estão no checklist.` : v.conclude ? "A etapa foi marcada como concluída." : "Tudo certo com os documentos.",
    next: { label: "Seguir para a proposta técnica", href: `/editais/propostas/${editalId}/tecnica` },
  };
}

/* ------------------------------ Proposta técnica ------------------------------ */

export type TecnicaInput = { atestadoIds: string[]; techId: string; compreensao: string; metodologia: string; cronograma: string; conclude: boolean };

export async function tecnicaFlow(editalId: string, v: TecnicaInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  if (!has(s.user, "documentos", "edit")) return { error: "Para gerar a proposta técnica você precisa de acesso de edição a Documentos." };
  const d = await dossieOf(editalId);
  if (!d) return { error: "Esta proposta ainda não foi iniciada." };
  const gen = await generateDocsAction(editalId, ["prop-tecnica"]);
  if (errOf(gen)) return { error: errOf(gen) as string };
  const cfg = await getConfig();
  const tech = cfg.technical.find((t) => t.id === v.techId);
  const literals: Record<string, string> = tech ? { "estudio.resp_tecnico": tech.name, "estudio.resp_tecnico_profissao": tech.profession, "estudio.resp_tecnico_registro": tech.registry, "estudio.resp_tecnico_cpf": tech.cpf } : {};
  const set = await setDocFields(editalId, "prop-tecnica", { fields: { compreensao: str(v.compreensao, 3000), metodologia: str(v.metodologia, 6000), cronograma: str(v.cronograma, 3000) }, literals });
  if ("error" in set) return { error: set.error };
  // atestados: só os que ainda não estão no texto (rodar de novo não duplica)
  const ids = (v.atestadoIds ?? []).filter(isId).slice(0, 12);
  let inserted = 0;
  if (ids.length) {
    const [doc] = await db.select({ content: schema.documents.content }).from(schema.documents).where(and(eq(schema.documents.editalId, editalId), eq(schema.documents.templateSlug, "prop-tecnica"))).limit(1);
    const html = ((doc?.content as { html?: string } | undefined)?.html ?? "") as string;
    const items = await db.select({ id: schema.portfolioItems.id, title: schema.portfolioItems.title }).from(schema.portfolioItems);
    const fresh = ids.filter((id) => {
      const it = items.find((i) => i.id === id);
      return it && !html.includes(escapeHtml(it.title));
    });
    if (fresh.length) {
      const r = await insertAtestadosAction(editalId, fresh);
      if (errOf(r)) return { error: errOf(r) as string };
      inserted = fresh.length;
    }
  }
  const step = await setStepAction(editalId, "tecnica", { status: v.conclude ? "concluida" : "em_andamento" });
  if (errOf(step)) return { error: errOf(step) as string };
  refresh(editalId);
  revalidatePath("/documentos");
  return {
    ok: true,
    href: `/editais/propostas/${editalId}`,
    title: "Proposta técnica pronta",
    message: `Documento gerado${inserted ? ` com ${inserted} ${inserted === 1 ? "atestado" : "atestados"}` : ""}. Abra o documento para dar o acabamento final.`,
    next: { label: "Seguir para o preço", href: `/editais/propostas/${editalId}/preco` },
  };
}

/* ------------------------------ Proposta de preço ------------------------------ */

export type PrecoInput = { bdi: string; items: PriceItem[]; prazo: string; validade: string; pagamento: string; valor: string; conclude: boolean };

export async function precoFlow(editalId: string, v: PrecoInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  if (!has(s.user, "documentos", "edit")) return { error: "Para gerar a carta-proposta você precisa de acesso de edição a Documentos." };
  if (!has(s.user, "planilhas", "edit")) return { error: "Para criar a planilha você precisa de acesso de edição a Planilhas." };
  const d = await dossieOf(editalId);
  if (!d) return { error: "Esta proposta ainda não foi iniciada." };
  const bdi = Number(String(v.bdi).replace(",", "."));
  const items = cleanPriceItems(v.items ?? []);
  const sheet = await createPriceSheet(s.user, editalId, { bdiPercent: Number.isFinite(bdi) ? bdi : undefined, items });
  if ("error" in sheet) return { error: sheet.error };
  if (sheet.created) await editalNote(editalId, s.user, "proposta", "Planilha de preços criada pelo assistente");
  const gen = await generateDocs(s.user, editalId, ["prop-carta", "prop-comercial"]);
  if (gen.created.length) await editalNote(editalId, s.user, "proposta", `Documentos gerados: ${gen.created.map((c) => c.title.split(" — ")[0]).join(", ")}`);
  const days = Math.max(1, Math.min(730, Math.round(Number(v.validade) || 0)));
  const valorTxt = str(v.valor, 60);
  const fields = { valor_proposta: valorTxt, prazo_execucao: str(v.prazo, 120), condicoes_pagamento: str(v.pagamento, 200) || "Conforme previsto no edital" };
  const literals = { "proposta.validade": `${days} dias`, "proposta.bdi": `${String(Number.isFinite(bdi) ? bdi : 0).replace(".", ",")}%` };
  for (const slug of ["prop-carta", "prop-comercial"]) {
    const r = await setDocFields(editalId, slug, { fields, literals });
    if ("error" in r && !/já foi enviado/.test(r.error)) return { error: r.error };
  }
  const step = await setStepAction(editalId, "preco", { status: v.conclude ? "concluida" : "em_andamento" });
  if (errOf(step)) return { error: errOf(step) as string };
  refresh(editalId);
  revalidatePath("/planilhas");
  revalidatePath("/documentos");
  return {
    ok: true,
    href: `/editais/propostas/${editalId}`,
    title: "Proposta de preço pronta",
    message: `${sheet.created ? (items.length ? `Planilha criada com ${items.length} ${items.length === 1 ? "item" : "itens"}` : "Planilha criada") : "A planilha já existia e foi mantida"} e carta-proposta preenchida.`,
    next: { label: "Revisar e enviar", href: `/editais/propostas/${editalId}/envio` },
  };
}

/* ------------------------------ Revisão e envio ------------------------------ */

export type EnvioInput = { itemIds: string[]; protocoloUrl: string; protocoloNome: string; quando: string; obs: string };

export async function envioFlow(editalId: string, v: EnvioInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  const d = await dossieOf(editalId);
  if (!d) return { error: "Esta proposta ainda não foi iniciada." };
  const bad = validUrlOrEmpty(v.protocoloUrl);
  if (bad) return { error: bad };
  const when = parseLocalInput(v.quando);
  if (!when) return { error: "Informe a data e a hora do envio." };
  // só mexe em itens deste dossiê
  const own = await db.select({ id: schema.propostaItems.id }).from(schema.propostaItems).where(eq(schema.propostaItems.dossieId, d.id));
  const ownIds = new Set(own.map((o) => o.id));
  for (const id of (v.itemIds ?? []).filter(isId)) if (ownIds.has(id)) await toggleItem(s.user, id, true);
  const r1 = await setStepAction(editalId, "revisao", { status: "concluida" });
  if (errOf(r1)) return { error: errOf(r1) as string };
  if (v.protocoloUrl.trim()) {
    const c = await addComment(s.actor, { editalId, kind: "link", linkUrl: v.protocoloUrl, linkName: str(v.protocoloNome, 80) || "Protocolo / comprovante do envio", body: str(v.obs, 500) || "Comprovante do envio", internal: true });
    if ("error" in c) return { error: c.error };
  }
  await editalNote(editalId, s.user, "proposta", `Envio registrado em ${v.quando.replace("T", " ")}${v.obs.trim() ? ` — ${str(v.obs, 200)}` : ""}`);
  const r2 = await setStepAction(editalId, "envio", { status: "concluida" });
  if (errOf(r2)) return { error: errOf(r2) as string };
  await audit(s.actor, "proposta_enviada", "Registrou o envio de uma proposta", { entity: "edital", entityId: editalId });
  refresh(editalId);
  revalidatePath("/", "layout");
  return { ok: true, href: `/editais/propostas/${editalId}`, title: "Envio registrado", message: "A proposta passa para Enviada. Quando sair o resultado, registre aqui mesmo.", next: { label: "Registrar o resultado", href: `/editais/propostas/${editalId}/resultado` } };
}

/* ------------------------------ Resultado ------------------------------ */

export type ResultadoInput = { status: string; value: string; reason: string; notes: string };

export async function resultadoFlow(editalId: string, v: ResultadoInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  const r = await setResultAction(editalId, { status: v.status, reason: v.reason, value: v.value, notes: v.notes });
  if (errOf(r)) return { error: errOf(r) as string };
  refresh(editalId);
  const label = { ganhou: "Parabéns, ganhamos!", perdeu: "Resultado registrado", desclassificada: "Resultado registrado", desistiu: "Desistência registrada" }[v.status] ?? "Resultado registrado";
  return { ok: true, href: `/editais/propostas/${editalId}`, title: label, message: v.status === "ganhou" ? "O negócio foi movido para Ganho." : "O motivo fica no aprendizado das próximas propostas.", next: { label: "Ver o Radar", href: "/editais/radar" } };
}

/* ------------------------------ Acervo ------------------------------ */

export type CofreInput = { id?: string; type: string; title: string; number: string; issuer: string; issuedAt: string; validUntil: string; url: string; notes: string };

export async function cofreFlow(v: CofreInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  const r = await saveCofreDocAction({ id: v.id, type: v.type, title: v.title, number: v.number, issuer: v.issuer, issuedAt: v.issuedAt, validUntil: v.validUntil, url: v.url, notes: v.notes });
  if ("error" in r) return { error: r.error };
  revalidatePath("/editais", "layout");
  return { ok: true, href: "/editais/acervo", title: v.id ? "Documento atualizado" : "Documento guardado", message: "Ele já entra na habilitação das próximas propostas.", next: { label: "Cadastrar outro", href: "/editais/acervo/documento/novo" } };
}

export type ObraInput = { id?: string; title: string; client: string; year: string; value: string; kind: string; tombamento: string; tags: string[]; responsible: string; description: string; links: { name: string; url: string }[] };

export async function obraFlow(v: ObraInput): Promise<WizardResult> {
  const s = await staff();
  if (!s) return NO;
  const r = await savePortfolioAction({ id: v.id, title: v.title, client: v.client, year: v.year, value: v.value, kind: v.kind, tombamento: v.tombamento, tags: v.tags, responsible: v.responsible, description: v.description, links: v.links.filter((l) => l.url.trim()) });
  if ("error" in r) return { error: r.error };
  revalidatePath("/editais", "layout");
  return { ok: true, href: "/editais/acervo?aba=obras", title: v.id ? "Obra atualizada" : "Obra cadastrada", message: "Ela passa a ser sugerida como atestado nas propostas parecidas.", next: { label: "Cadastrar outra", href: "/editais/acervo/obra/nova" } };
}
