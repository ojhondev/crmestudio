/**
 * Testes da esteira de proposta (lógica pura, sem banco e sem rede):
 * prazos de trás para frente (fins de semana e feriados), checklist idempotente, validade do cofre,
 * matriz de habilitação, sugestão de atestados, variáveis dos documentos, planilha de preços e estatísticas.
 *
 *   npm run test:propostas
 */
import { addDaysISO, dueFromDeadline, isBusinessDay, nextBusinessDay, prevBusinessDay, subBusinessDays, holidays } from "../src/lib/propostas/dates";
import { assigneeFor, planChecklist, planSteps } from "../src/lib/propostas/checklist";
import { BUILTIN_CHECKLISTS, BUILTIN_MATRICES, suggestTemplateKey } from "../src/lib/propostas/templates";
import { alertWindow, bestDoc, evaluateMatrix, summarizeMatrix, validityOf, validityText, type CofreLite, type RequirementLite } from "../src/lib/propostas/cofre";
import { atestadoText, norm, searchPortfolio, stem, suggestAtestados, tokens, type PortfolioLite } from "../src/lib/propostas/portfolio";
import { countdownText, dossieProgress, overallRate, stepStatusFromItems, successRate, topReasons, urgencyOf } from "../src/lib/propostas/progress";
import { propostaValueMap, PROPOSTA_VARIABLES } from "../src/lib/propostas/vars";
import { PROPOSTA_DOCS, PROPOSTA_FIELD_LABELS, PROPOSTA_REVIEW_NOTE } from "../src/lib/propostas/doc-templates";
import { DEFAULT_CONFIG, STEPS, COFRE_TYPES, type PropostasConfig } from "../src/lib/propostas/types";
import { PRICE_ROWS, priceSheetTabs } from "../src/lib/propostas/price-sheet";
import { findVars, resolveText, valueMap, VARIABLES } from "../src/lib/docs/variables";
import { EMPTY_STUDIO } from "../src/lib/docs/types";
import { BUILTIN_CONTRACTS } from "../src/lib/docs/templates";
import { Book } from "../src/lib/sheets/formula";
import { BUILTIN_RULES, TRIGGER_BY_ID, evalCofre, evalPropostaOwner, evalPropostaStep, sanitizeParams, sanitizeRule } from "../src/lib/automations";

let fail = 0;
let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  n++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};
const ok = (v: unknown, m: string) => eq(!!v, true, m);

/* ------------------------------------ dias úteis ------------------------------------ */
// 2026-10-26 é segunda-feira; 2026-11-02 (Finados) é feriado nacional (segunda).
eq(isBusinessDay("2026-10-26"), true, "segunda é dia útil");
eq(isBusinessDay("2026-10-24"), false, "sábado não é útil");
eq(isBusinessDay("2026-10-25"), false, "domingo não é útil");
eq(isBusinessDay("2026-11-02"), false, "Finados é feriado");
eq(isBusinessDay("2026-10-12"), false, "Nossa Senhora Aparecida é feriado");
eq(isBusinessDay("2026-04-03"), false, "Sexta-feira Santa 2026");
eq(isBusinessDay("2026-02-17"), false, "Carnaval 2026 (terça)");
eq(isBusinessDay("2026-06-04"), false, "Corpus Christi 2026");
eq(isBusinessDay("2027-03-26"), false, "Sexta-feira Santa 2027");
eq(isBusinessDay("2026-11-20"), false, "Consciência Negra (nacional desde 2024)");
eq(holidays(2026).size, 13, "13 feriados nacionais em 2026 (8 fixos, 4 móveis e Consciência Negra)");
eq(prevBusinessDay("2026-10-25"), "2026-10-23", "domingo recua para a sexta");
eq(nextBusinessDay("2026-10-24"), "2026-10-26", "sábado avança para a segunda");
eq(addDaysISO("2026-12-31", 1), "2027-01-01", "virada de ano");

eq(subBusinessDays("2026-10-28", 0), "2026-10-28", "D-0 em dia útil é o próprio dia");
eq(subBusinessDays("2026-10-28", 2), "2026-10-26", "D-2 de quarta é segunda");
eq(subBusinessDays("2026-10-26", 1), "2026-10-23", "D-1 de segunda é sexta (pula o fim de semana)");
eq(subBusinessDays("2026-10-26", 2), "2026-10-22", "D-2 de segunda é quinta");
eq(subBusinessDays("2026-11-03", 2), "2026-10-29", "D-2 de terça 03/11 pula o feriado de 02/11");
eq(subBusinessDays("2026-11-01", 0), "2026-10-30", "sessão num domingo: D-0 cai na sexta anterior");
eq(subBusinessDays("2026-11-01", 1), "2026-10-29", "sessão num domingo: D-1 é a quinta");
eq(subBusinessDays("2026-10-31", 3), "2026-10-27", "sessão num sábado: D-3 é terça");
ok(isBusinessDay(subBusinessDays("2026-12-25", 4)), "o resultado é sempre dia útil");
for (let off = 0; off <= 12; off++) for (const d of ["2026-10-24", "2026-11-03", "2026-12-24", "2027-01-04", "2026-04-06"]) ok(isBusinessDay(subBusinessDays(d, off)), `dia útil: ${d} - ${off}`);

// prazo apertado: o cálculo cairia no passado → usa hoje (ou o próximo dia útil) e avisa
eq(dueFromDeadline("2026-11-10", 5, "2026-10-26"), { day: "2026-11-03", squeezed: false }, "prazo normal não é apertado");
eq(dueFromDeadline("2026-10-28", 9, "2026-10-26"), { day: "2026-10-26", squeezed: true }, "prazo curto: usa hoje e marca apertado");
eq(dueFromDeadline("2026-10-30", 9, "2026-10-24"), { day: "2026-10-26", squeezed: true }, "hoje é sábado: usa a segunda");
eq(dueFromDeadline("2026-10-27", 9, "2026-10-26").day <= "2026-10-27", true, "nunca passa da data limite");

/* ------------------------------------ checklist ------------------------------------ */
const obra = BUILTIN_CHECKLISTS.find((c) => c.key === "obra")!;
const projeto = BUILTIN_CHECKLISTS.find((c) => c.key === "projeto")!;
const dispensa = BUILTIN_CHECKLISTS.find((c) => c.key === "dispensa")!;
eq(BUILTIN_CHECKLISTS.map((c) => c.key), ["obra", "projeto", "dispensa"], "três modelos de checklist");
for (const c of BUILTIN_CHECKLISTS) {
  const keys = c.items.map((i) => i.key);
  eq(new Set(keys).size, keys.length, `chaves únicas no modelo ${c.key}`);
  ok(c.items.every((i) => STEPS.some((s) => s.key === i.step)), `etapas válidas no modelo ${c.key}`);
  ok(c.items.every((i) => i.offsetDays === null || i.offsetDays >= 0), `offsets não negativos em ${c.key}`);
}

const DEADLINE = "2026-11-17"; // terça
const first = planChecklist(obra.items, DEADLINE, "2026-10-26");
eq(first.length, obra.items.length, "primeira aplicação cria todos os itens");
const rev = first.find((i) => i.tplKey === "revisao_cruzada")!;
eq(rev.dueDay, "2026-11-13", "revisão interna D-2 (sexta 13/11; segunda 16 é útil, sexta antes do fim de semana)");
const prot = first.find((i) => i.tplKey === "protocolo")!;
eq(prot.dueDay, "2026-11-16", "protocolo D-1");
ok(first.every((i) => i.dueDay === null || i.dueDay <= DEADLINE), "nenhum item depois da data limite");
ok(first.every((i) => i.dueDay === null || isBusinessDay(i.dueDay)), "todos os prazos em dia útil");
eq(first.map((i) => i.position), first.map((_, i) => i), "posições sequenciais");
// ordenado por etapa
const stepIdx = (k: string) => STEPS.findIndex((s) => s.key === k);
ok(first.every((it, i) => i === 0 || stepIdx(first[i - 1].stepKey) <= stepIdx(it.stepKey)), "itens ordenados pelas etapas");
// idempotência
const again = planChecklist(obra.items, DEADLINE, "2026-10-26", first.map((i) => ({ tplKey: i.tplKey })));
eq(again.length, 0, "reaplicar não duplica nada");
const partial = planChecklist(obra.items, DEADLINE, "2026-10-26", first.slice(0, 5).map((i) => ({ tplKey: i.tplKey })), 5);
eq(partial.length, obra.items.length - 5, "reaplicar cria só o que falta");
eq(partial[0].position, 5, "continua a numeração das posições");
eq(planChecklist(obra.items, DEADLINE, "2026-10-26", [{ tplKey: null }, { tplKey: null }]).length, obra.items.length, "itens manuais (sem chave) não bloqueiam o modelo");
const dup = planChecklist([...dispensa.items, ...dispensa.items], DEADLINE, "2026-10-26");
eq(dup.length, dispensa.items.length, "chave repetida no próprio modelo não duplica");
// sem data limite: itens sem prazo
ok(planChecklist(obra.items, null, "2026-10-26").every((i) => i.dueDay === null), "sem data limite não há prazo calculado");
// prazo curto
const tight = planChecklist(projeto.items, "2026-10-28", "2026-10-26");
ok(tight.some((i) => i.squeezed), "edital com prazo curto marca itens apertados");
ok(tight.every((i) => i.dueDay === null || i.dueDay >= "2026-10-26"), "nada fica no passado");
// etapas
const steps = planSteps(DEADLINE, "2026-10-26");
eq(steps.length, 8, "8 etapas");
eq(steps.map((s) => s.key), ["analisar", "esclarecimentos", "habilitacao", "tecnica", "preco", "revisao", "envio", "resultado"], "ordem das etapas");
eq(steps.find((s) => s.key === "envio")!.dueDay, "2026-11-16", "envio D-1");
eq(steps.find((s) => s.key === "revisao")!.dueDay, "2026-11-13", "revisão D-2");
eq(steps.find((s) => s.key === "resultado")!.dueDay, DEADLINE, "resultado no dia da sessão");
eq(assigneeFor("orcamento", { orcamento: "u1" }, "u9"), "u1", "responsável do papel");
eq(assigneeFor("tecnico", { orcamento: "u1" }, "u9"), "u9", "sem papel configurado cai no responsável do dossiê");
eq(assigneeFor(null, {}, null), null, "sem ninguém");

eq(suggestTemplateKey("execucao", "Pregão - Eletrônico", 90_000_000), "obra", "obra por pregão");
eq(suggestTemplateKey("projeto", "Concorrência", null), "projeto", "projeto");
eq(suggestTemplateKey("laudo", null, null), "projeto", "laudo usa o modelo de serviço técnico");
eq(suggestTemplateKey("execucao", "Dispensa de Licitação", 3_000_000), "dispensa", "dispensa pela modalidade");
eq(suggestTemplateKey("projeto_execucao", "Concorrência", 200_000_000), "obra", "projeto + execução cai em obra");

/* ------------------------------------ cofre ------------------------------------ */
const TODAY = "2026-10-26";
eq(validityOf("2026-10-25", TODAY).status, "vencido", "vencido ontem");
eq(validityOf("2026-10-26", TODAY), { status: "vence_30", daysLeft: 0 }, "vence hoje");
eq(validityOf("2026-11-25", TODAY).status, "vence_30", "30 dias exatos ainda é 'vence em breve'");
eq(validityOf("2026-11-26", TODAY).status, "valido", "31 dias é válido");
eq(validityOf(null, TODAY).status, "sem_validade", "sem validade");
eq(validityText(validityOf("2026-10-20", TODAY)), "Venceu há 6 dias", "texto vencido");
eq(validityText(validityOf("2026-10-27", TODAY)), "Vence amanhã", "texto amanhã");
eq(validityText(validityOf("2026-11-10", TODAY)), "Vence em 15 dias", "texto dias");
eq(alertWindow("2026-11-25", TODAY), 30, "aviso de 30 dias");
eq(alertWindow("2026-11-10", TODAY), 15, "aviso de 15 dias");
eq(alertWindow("2026-11-02", TODAY), 7, "aviso de 7 dias");
eq(alertWindow("2026-11-03", TODAY), null, "8 dias: sem aviso");
eq(alertWindow(null, TODAY), null, "sem validade: sem aviso");
ok(COFRE_TYPES.length >= 15, "tipos do cofre");

/* ------------------------------ matriz de habilitação ------------------------------ */
const doc = (id: string, type: string, validUntil: string | null): CofreLite => ({ id, type, title: type, number: null, validUntil, url: null });
const docs: CofreLite[] = [
  doc("fed", "certidao_federal", "2026-11-30"), // vence antes da sessão de 17/12
  doc("fgts", "certidao_fgts", "2027-01-20"),
  doc("trab-old", "certidao_trabalhista", "2026-10-01"), // vencida
  doc("cnpj", "cnpj", null),
  doc("at1", "atestado_tecnico", null),
  doc("mun-a", "certidao_municipal", "2026-12-01"),
  doc("mun-b", "certidao_municipal", "2027-02-01"),
];
const req = (id: string, type: string | null, extra: Partial<RequirementLite> = {}): RequirementLite => ({ id, title: id, cofreType: type, cofreDocId: null, mode: "auto", ...extra });
const SESSION = "2026-12-17";
const rows = evaluateMatrix(
  [req("federal", "certidao_federal"), req("fgts", "certidao_fgts"), req("trab", "certidao_trabalhista"), req("cnpj", "cnpj"), req("estadual", "certidao_estadual"), req("mun", "certidao_municipal"), req("na", "balanco", { mode: "na" }), req("manual", "balanco", { mode: "ok_manual" }), req("sem-tipo", null), req("escolhido", "certidao_municipal", { cofreDocId: "mun-a" })],
  docs,
  SESSION,
  TODAY,
);
const by = Object.fromEntries(rows.map((r) => [r.req.id, r]));
eq(by.federal.situation, "vence_antes", "certidão que vence antes da sessão alerta");
eq(by.federal.marginDays, -17, "margem de -17 dias");
eq(by.fgts.situation, "ok", "FGTS cobre a sessão");
eq(by.trab.situation, "vencido", "CNDT vencida");
eq(by.cnpj.situation, "ok", "documento sem validade fica ok");
eq(by.estadual.situation, "faltando", "nada no cofre = faltando");
eq(by.mun.doc?.id, "mun-b", "escolhe automaticamente a certidão que cobre a sessão");
eq(by.mun.situation, "ok", "municipal ok");
eq(by.na.situation, "na", "não se aplica");
eq(by.manual.situation, "ok_manual", "atendida manualmente");
eq(by["sem-tipo"].situation, "faltando", "exigência sem tipo e sem documento escolhido = faltando");
eq(by.escolhido.doc?.id, "mun-a", "documento escolhido à mão vale");
eq(by.escolhido.situation, "vence_antes", "o escolhido à mão também é checado contra a sessão");
const sum = summarizeMatrix(rows);
eq(sum.total, 9, "total sem as 'não se aplica'");
eq(sum.faltando, 2, "2 faltando");
eq(sum.vencendo, 3, "3 vencendo/vencidas");
eq(sum.ok, 4, "4 em dia (fgts, cnpj, mun, manual)");
eq(bestDoc(docs, "certidao_municipal", null)?.id, "mun-b", "sem sessão: maior validade");
eq(bestDoc(docs, "balanco", SESSION), null, "tipo ausente");
eq(evaluateMatrix([req("x", "certidao_federal")], docs, null, TODAY)[0].situation, "ok", "sem data de sessão não acusa 'vence antes'");
for (const m of BUILTIN_MATRICES) {
  const keys = m.items.map((i) => i.key);
  eq(new Set(keys).size, keys.length, `chaves únicas na matriz ${m.key}`);
  ok(m.items.every((i) => i.cofreType === null || COFRE_TYPES.some((t) => t.key === i.cofreType)), `tipos do cofre válidos na matriz ${m.key}`);
}

/* ------------------------------------ atestados ------------------------------------ */
eq(norm("Restauração do FORRO — Igreja"), "restauracao do forro igreja", "normaliza acentos");
eq(stem("restauração"), stem("restauro") === stem("restauração") ? stem("restauro") : "x", "restauração e restauro têm o mesmo radical");
eq(tokens("forros e Forro").length, 1, "plural e singular colapsam");
const pf = (id: string, p: Partial<PortfolioLite>): PortfolioLite => ({ id, title: id, client: null, year: 2022, valueCents: null, kind: "execucao", tags: [], tombamento: null, responsible: null, description: null, ...p });
const port: PortfolioLite[] = [
  pf("forro", { title: "Restauração do forro da Matriz de Itu", tags: ["restauração de forro", "igreja"], tombamento: "iphan", year: 2024, description: "Forro em madeira pintada, 320 m²." }),
  pf("mural", { title: "Pintura mural da capela", tags: ["pintura mural"], kind: "execucao", year: 2021 }),
  pf("proj", { title: "Projeto executivo de restauro do casarão", tags: ["projeto executivo", "casarão"], kind: "projeto", year: 2023 }),
  pf("doura", { title: "Retábulo-mor", tags: ["douramento", "retábulo"], year: 2019 }),
  pf("nada", { title: "Pintura de fachada comercial", tags: ["fachada"], tombamento: "nenhum", year: 2010, kind: "outro" }),
];
const ed = { title: "Restauração da Igreja Matriz", object: "Contratação de empresa especializada para execução de obra de restauração do forro e do retábulo da Igreja Matriz, bem tombado pelo IPHAN", kind: "execucao" };
const sug = suggestAtestados(ed, port, { currentYear: 2026 });
eq(sug[0].item.id, "forro", "forro da igreja tombada é o mais aderente");
ok(sug.findIndex((s) => s.item.id === "doura") >= 0, "retábulo/douramento aparece");
ok(sug.findIndex((s) => s.item.id === "doura") < sug.findIndex((s) => s.item.id === "proj" || s.item.id === "nada") || sug.findIndex((s) => s.item.id === "proj") < 0, "execução com retábulo vem antes de projeto");
ok(!sug.some((s) => s.item.id === "nada"), "o que não casa não aparece");
ok(sug[0].why.length > 0, "explica por que sugeriu");
const sorted = sug.map((s) => s.score);
eq([...sorted].sort((a, b) => b - a), sorted, "ordenado por aderência");
const sug2 = suggestAtestados({ title: "Projeto de restauro do casarão", object: "Elaboração de projeto executivo de restauro do casarão histórico", kind: "projeto" }, port, { currentYear: 2026 });
eq(sug2[0].item.id, "proj", "edital de projeto prioriza projeto");
eq(suggestAtestados(ed, [], {}).length, 0, "portfólio vazio");
eq(suggestAtestados(ed, port, { limit: 1 }).length, 1, "limite");
eq(searchPortfolio(port, "forro matriz").map((i) => i.id), ["forro"], "busca por palavras");
eq(searchPortfolio(port, "", "douramento").map((i) => i.id), ["doura"], "busca por etiqueta");
eq(searchPortfolio(port, "RETABULO").map((i) => i.id), ["doura"], "busca sem acento e sem caixa");
eq(searchPortfolio(port, "").length, port.length, "busca vazia traz tudo");
ok(atestadoText(port[0], (c) => `R$ ${c / 100}`).includes("Matriz de Itu"), "texto do atestado");

/* ------------------------------ variáveis e modelos ------------------------------ */
const config: PropostasConfig = {
  ...DEFAULT_CONFIG,
  legalRep: { name: "Maria Souza", cpf: "111.222.333-44", role: "Sócia administradora" },
  technical: [
    { id: "t1", name: "João Lima", profession: "Arquiteto e urbanista", registry: "CAU A12345-6", cpf: "555.666.777-88" },
    { id: "t2", name: "Ana Reis", profession: "Restauradora", registry: "", cpf: "" },
  ],
  bdiPercent: 22.5,
  validityDays: 90,
};
const map = propostaValueMap(
  { title: "Pregão 12/2026", object: "Restauração da Igreja Matriz", organ: "Prefeitura de Itu", unit: "Secretaria de Cultura", modalidade: "Concorrência", kind: "execucao", valueCents: 150_000_00, openAt: "2026-12-17T13:00:00Z", closeAt: "2026-12-17T12:00:00Z", city: "Itu", uf: "SP", sourceUrl: "https://portal.example/12" },
  { numero: "12/2026", processo: "2026/0045", sessionAt: null },
  config,
);
eq(map["edital.orgao"], "Prefeitura de Itu", "órgão");
eq(map["edital.numero"], "12/2026", "número");
eq(map["edital.valor_estimado"].replace(/\s/g, " "), "R$ 150.000,00", "valor estimado");
eq(map["edital.valor_estimado_extenso"], "cento e cinquenta mil reais", "valor por extenso");
eq(map["edital.data_sessao"], "17/12/2026 às 10:00", "data da sessão em Brasília (abertura 13:00Z)");
eq(map["edital.prazo_propostas"], "17/12/2026 às 09:00", "limite de propostas em Brasília");
eq(map["edital.local"], "Itu/SP", "local");
eq(map["edital.tipo"], "Execução (obra)", "tipo");
eq(map["estudio.resp_tecnico"], "João Lima", "responsável técnico principal");
eq(map["estudio.resp_tecnico_registro"], "CAU A12345-6", "registro");
eq(map["estudio.equipe_tecnica"], "João Lima, Arquiteto e urbanista, CAU A12345-6; Ana Reis, Restauradora", "equipe");
eq(map["proposta.bdi"], "22,5%", "BDI com vírgula");
eq(map["proposta.validade"], "90 dias", "validade");
eq(propostaValueMap(null, null, DEFAULT_CONFIG)["edital.orgao"], "", "sem edital: vazio");
eq(propostaValueMap({ title: "x", object: "y", organ: "z", unit: null, modalidade: null, kind: "outro", valueCents: null, openAt: null, closeAt: null, city: null, uf: null, sourceUrl: null }, { numero: null, processo: null, sessionAt: "2026-12-20T15:00:00Z" }, DEFAULT_CONFIG)["edital.data_sessao"], "20/12/2026 às 12:00", "data da sessão informada à mão vale mais");

const known = new Set<string>(VARIABLES.map((v) => v.key));
eq(PROPOSTA_VARIABLES.every((v) => known.has(v.key)), true, "variáveis novas aparecem no editor");
eq(Object.keys(map).filter((k) => !known.has(k)), [], "todo valor do mapa é uma variável conhecida");
eq(PROPOSTA_DOCS.length, 7, "sete modelos de documento");
eq(PROPOSTA_DOCS.filter((d) => d.auto).map((d) => d.slug), ["prop-carta", "prop-comercial", "prop-tecnica", "prop-declaracoes"], "documentos gerados por padrão");
for (const d of PROPOSTA_DOCS) {
  const vars = findVars(d.html.replace(/<[^>]+>/g, " "));
  const unknown = vars.filter((k) => !known.has(k) && !k.startsWith("campo."));
  eq(unknown, [], `${d.slug}: só variáveis conhecidas`);
  const fields = vars.filter((k) => k.startsWith("campo.")).map((k) => k.slice(6));
  eq(fields.filter((f) => !PROPOSTA_FIELD_LABELS[f]), [], `${d.slug}: todo campo tem rótulo`);
  ok(d.html.includes(PROPOSTA_REVIEW_NOTE), `${d.slug}: traz o aviso de revisão`);
  ok(!/em conformidade com a lei|atende integralmente|juridicamente válid/i.test(d.html), `${d.slug}: não afirma conformidade legal`);
  ok(BUILTIN_CONTRACTS.some((c) => c.slug === d.slug), `${d.slug}: aparece nos modelos de Documentos`);
}
const decl = PROPOSTA_DOCS.find((d) => d.slug === "prop-declaracoes")!.html;
for (const t of ["inexistem fatos impeditivos", "inciso XXXIII do art. 7º da Constituição Federal", "elaborada de maneira independente", "condições e peculiaridades do local", "responsável técnico", "Lei Complementar nº 123"]) ok(decl.includes(t), `declarações contêm: ${t}`);
ok(PROPOSTA_DOCS.find((d) => d.slug === "prop-comercial")!.html.includes("<table>"), "proposta comercial tem tabela de preços");
// preenchimento: com dados completos nada fica pendente nos campos de edital/estúdio
const ctxMap = valueMap({
  studio: { ...EMPTY_STUDIO, legalName: "Restaura Ltda", document: "00.000.000/0001-00", address: "Rua A, 1", city: "São Paulo" },
  doc: { title: "Carta", number: "PP-1" },
  extra: map,
  fields: { valor_proposta: "R$ 1,00", prazo_execucao: "90 dias", condicoes_pagamento: "30 dias" },
  today: "2026-10-26",
});
const carta = PROPOSTA_DOCS.find((d) => d.slug === "prop-carta")!;
const rendered = resolveText(carta.html, ctxMap, { html: true });
ok(!rendered.includes("doc-missing"), "carta-proposta totalmente preenchida");
ok(rendered.includes("Prefeitura de Itu") && rendered.includes("Restaura Ltda") && rendered.includes("12/2026"), "carta traz órgão, razão social e nº do edital");
const partialMap = valueMap({ studio: EMPTY_STUDIO, doc: { title: "x" }, extra: propostaValueMap(null, null, DEFAULT_CONFIG), today: "2026-10-26" });
ok(resolveText(carta.html, partialMap, { html: true }).includes("doc-missing"), "dados faltando aparecem destacados, não somem");

/* ------------------------------ planilha de preços ------------------------------ */
const sheet = priceSheetTabs({ bdiPercent: 25, encargosPercent: 0, estimatedCents: 1_500_000 });
eq(sheet.tabs.map((t) => t.name), ["Composição", "Cronograma", "Resumo"], "três abas");
const book = new Book(sheet.tabs.map((t) => ({ name: t.name, grid: t.grid })));
const rIdx = 2;
const v = (tab: number, r: number, c: number) => book.get(tab, r, c);
eq(v(rIdx, 1, 1), 0.25, "BDI padrão da configuração");
eq(v(rIdx, 4, 1), 9576, "custo direto = 42×(18+55) + 42×(60+95)");
eq(v(rIdx, 5, 1), 2394, "BDI sobre o custo direto");
eq(v(rIdx, 6, 1), 11970, "preço total");
eq(v(0, PRICE_ROWS + 1, 9), 11970, "total da composição bate com o resumo");
eq(Math.round(Number(v(rIdx, 9, 1)) * 10000) / 10000, Math.round((11970 / 15000 - 1) * 10000) / 10000, "proposta em relação ao estimado");
// cronograma: pesos somam 100% e os meses desembolsam o total
eq(Math.round(Number(v(1, 11, 1)) * 100) / 100, 1, "pesos somam 100%");
const months = [3, 4, 5, 6, 7, 8].map((c) => Number(v(1, 11, c)));
eq(Math.round(months.reduce((a, b) => a + b, 0) * 100) / 100, 11970, "desembolso mensal soma o preço total");
eq(Math.round(Number(v(1, 1, 9)) * 100) / 100, 1, "soma % da etapa 1 = 100%");
// BDI e encargos configuráveis
const sheet2 = priceSheetTabs({ bdiPercent: 30, encargosPercent: 10 });
const b2 = new Book(sheet2.tabs.map((t) => ({ name: t.name, grid: t.grid })));
const direto2 = 42 * (18 + 55 * 1.1) + 42 * (60 + 95 * 1.1);
eq(Math.round(Number(b2.get(2, 4, 1)) * 100) / 100, Math.round(direto2 * 100) / 100, "encargos sobre a mão de obra");
eq(Math.round(Number(b2.get(2, 6, 1)) * 100) / 100, Math.round(direto2 * 1.3 * 100) / 100, "BDI de 30%");
eq(b2.get(2, 9, 1) === "" || b2.get(2, 9, 1) === 0 || typeof b2.get(2, 9, 1) === "string", true, "sem valor estimado não calcula a diferença");

/* ------------------------------ progresso e estatísticas ------------------------------ */
eq(urgencyOf(null), "none", "sem prazo");
eq(urgencyOf(-1), "vencido", "vencido");
eq(urgencyOf(0), "d1", "hoje");
eq(urgencyOf(1), "d1", "amanhã");
eq(urgencyOf(2), "d3", "2 dias");
eq(urgencyOf(3), "d3", "3 dias");
eq(urgencyOf(4), "d7", "4 dias");
eq(urgencyOf(7), "d7", "7 dias");
eq(urgencyOf(8), "ok", "8 dias");
eq(countdownText(5), "Faltam 5 dias", "contagem");
eq(countdownText(1), "Falta 1 dia", "contagem 1");
eq(countdownText(-2), "Prazo passou há 2 dias", "contagem vencida");
const st = (key: string, status: string, dueDay: string | null = null) => ({ key, status, dueDay, assigneeId: null });
const pr = dossieProgress(
  [st("analisar", "concluida"), st("esclarecimentos", "nao_se_aplica"), st("habilitacao", "em_andamento", "2026-10-20"), st("tecnica", "a_fazer"), st("preco", "a_fazer"), st("revisao", "a_fazer"), st("envio", "a_fazer"), st("resultado", "a_fazer")],
  [{ stepKey: "analisar", done: true, dueDay: null }, { stepKey: "analisar", done: true, dueDay: null }, { stepKey: "habilitacao", done: true, dueDay: null }, { stepKey: "habilitacao", done: false, dueDay: null }, { stepKey: "esclarecimentos", done: false, dueDay: null }],
  "2026-10-26",
);
eq(pr.totalItems, 4, "itens de etapa 'não se aplica' não contam");
eq(pr.pct, 75, "75% dos itens");
eq(pr.currentStep, "habilitacao", "etapa atual");
eq(pr.overdueSteps, 1, "uma etapa atrasada");
eq(dossieProgress([st("analisar", "concluida"), st("envio", "a_fazer")], [], "2026-10-26").pct, 50, "sem itens usa as etapas");
eq(stepStatusFromItems("a_fazer", [{ done: true }, { done: false }]), "em_andamento", "marcou um: em andamento");
eq(stepStatusFromItems("em_andamento", [{ done: true }, { done: true }]), "concluida", "marcou todos: concluída");
eq(stepStatusFromItems("concluida", [{ done: true }, { done: false }]), "em_andamento", "desmarcou: volta a andamento");
eq(stepStatusFromItems("nao_se_aplica", [{ done: true }]), "nao_se_aplica", "não se aplica não muda");
eq(stepStatusFromItems("a_fazer", []), "a_fazer", "sem itens não muda");
const results = [
  { status: "ganhou" as const, kind: "execucao", organ: "A", valueCents: 1 },
  { status: "perdeu" as const, kind: "execucao", organ: "A", valueCents: 1 },
  { status: "desclassificada" as const, kind: "projeto", organ: "B", valueCents: 1 },
  { status: "ganhou" as const, kind: "projeto", organ: "B", valueCents: 1 },
  { status: "ganhou" as const, kind: "projeto", organ: "B", valueCents: 1 },
  { status: "desistiu" as const, kind: "projeto", organ: "B", valueCents: 1 },
  { status: "andamento" as const, kind: "projeto", organ: "C", valueCents: 1 },
];
eq(overallRate(results), { total: 5, won: 3, rate: 60 }, "taxa geral ignora andamento e desistência");
eq(successRate(results, "kind").map((g) => [g.label, g.total, g.won, g.rate]), [["projeto", 3, 2, 67], ["execucao", 2, 1, 50]], "taxa por tipo");
eq(successRate(results, "organ").map((g) => g.label), ["B", "A"], "taxa por órgão (C em andamento não entra)");
eq(topReasons([{ status: "perdeu", reason: "Preço" }, { status: "perdeu", reason: "Preço" }, { status: "ganhou", reason: "x" }, { status: "desclassificada", reason: "Docs" }, { status: "perdeu", reason: null }]), [{ reason: "Preço", n: 2 }, { reason: "Docs", n: 1 }], "motivos mais comuns");

/* ------------------------------ avisos e automações ------------------------------ */
const NOW = { ms: Date.parse("2026-10-26T15:00:00Z"), today: "2026-10-26" };
const stepF = (dueDay: string | null) => ({ editalId: "e1", title: "Edital X", stepKey: "habilitacao", stepLabel: "Habilitação", dueDay });
eq(evalPropostaStep("proposta_step_soon", { daysBefore: [2, 0] }, stepF("2026-10-28"), NOW)?.key, "pstep:e1:habilitacao:2026-10-28:2", "etapa: aviso 2 dias antes");
eq(evalPropostaStep("proposta_step_soon", { daysBefore: [2, 0] }, stepF("2026-10-26"), NOW)?.vars.quando, "hoje", "etapa: aviso no dia");
eq(evalPropostaStep("proposta_step_soon", { daysBefore: [2, 0] }, stepF("2026-10-27"), NOW), null, "etapa: amanhã não está na lista");
eq(evalPropostaStep("proposta_step_soon", {}, stepF("2026-10-24"), NOW), null, "etapa atrasada não é “se aproximando”");
eq(evalPropostaStep("proposta_step_late", { days: 1 }, stepF("2026-10-24"), NOW)?.vars.dias, "2 dias", "etapa atrasada há 2 dias");
eq(evalPropostaStep("proposta_step_late", { days: 3 }, stepF("2026-10-24"), NOW), null, "atraso mínimo de 3 dias ainda não chegou");
eq(evalPropostaStep("proposta_step_late", { days: 1 }, stepF("2026-10-26"), NOW), null, "vence hoje não é atraso");
eq(evalPropostaStep("proposta_step_late", { days: 1 }, stepF(null), NOW), null, "sem prazo não avisa");
eq(evalPropostaStep("proposta_step_late", { days: 1 }, stepF("2026-10-24"), NOW)?.key, evalPropostaStep("proposta_step_late", { days: 1 }, stepF("2026-10-24"), { ms: NOW.ms + 864e5, today: "2026-10-27" })?.key, "chave estável: um aviso só por etapa e prazo");
const propF = (hasOwner: boolean, deadlineDay: string | null) => ({ editalId: "e1", title: "Edital X", deadlineDay, hasOwner });
eq(evalPropostaOwner({ days: 7 }, propF(false, "2026-11-01"), NOW)?.key, "pnoowner:e1:2026-11-01", "sem responsável a 6 dias da sessão");
eq(evalPropostaOwner({ days: 7 }, propF(false, "2026-11-10"), NOW), null, "ainda longe (15 dias)");
eq(evalPropostaOwner({ days: 7 }, propF(true, "2026-11-01"), NOW), null, "com responsável não avisa");
eq(evalPropostaOwner({ days: 7 }, propF(false, "2026-10-20"), NOW), null, "sessão já passou");
eq(evalCofre({ daysBefore: [30, 15, 7] }, { id: "c1", title: "CND", validUntil: "2026-11-02" }, NOW)?.key, "cofre:c1:2026-11-02:7", "cofre: aviso de 7 dias");
eq(evalCofre({ daysBefore: [30, 15, 7] }, { id: "c1", title: "CND", validUntil: "2026-11-25" }, NOW)?.vars.quando, "em 30 dias", "cofre: aviso de 30 dias");
eq(evalCofre({ daysBefore: [30, 15, 7] }, { id: "c1", title: "CND", validUntil: "2026-11-04" }, NOW), null, "cofre: 9 dias não está na lista");
eq(evalCofre({}, { id: "c1", title: "CND", validUntil: "2026-11-10" }, NOW)?.vars.quando, "em 15 dias", "cofre: padrão 30/15/7 quando a regra não define");
eq(evalCofre({}, { id: "c1", title: "CND", validUntil: "2026-10-01" }, NOW), null, "cofre vencido não entra em “vencendo”");
for (const id of ["proposta_step_soon", "proposta_step_late", "proposta_no_owner", "cofre_expiring"] as const) {
  ok(TRIGGER_BY_ID[id]?.kind === "time" && TRIGGER_BY_ID[id].subject === "edital", `gatilho ${id} existe`);
}
const built = BUILTIN_RULES.filter((r) => ["proposta_etapa_prazo", "proposta_etapa_atrasada", "proposta_sem_responsavel", "cofre_vencimento"].includes(r.key));
eq(built.length, 4, "4 regras prontas novas");
ok(built.every((r) => r.enabled && r.actions.length > 0), "regras prontas ligadas e com ação");
for (const r of built) ok(!("error" in sanitizeRule({ name: r.name, trigger: r.trigger, params: r.params, conditions: r.conditions, actions: r.actions }, r.trigger)), `regra ${r.key} passa na validação`);
eq(sanitizeParams("cofre_expiring", { daysBefore: [7, 30, 15, 15] }).daysBefore, [30, 15, 7], "dias do cofre: ordena e remove repetidos");
eq(sanitizeParams("proposta_no_owner", { days: 0 }).days, 7, "dias inválidos voltam ao padrão");


console.log(fail ? `\n${fail} falha(s) em ${n} verificações` : `\nTudo certo: ${n} verificações`);
process.exit(fail ? 1 : 0);
