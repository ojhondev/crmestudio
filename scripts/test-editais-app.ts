/**
 * Testes do app Editais (plataforma dentro da plataforma): autorização e visibilidade de parceiros,
 * ciclo do convite, provedor de e-mail com plano B, regras dos assistentes, abas e contagens do Radar.
 *
 *   npm run test:editais-app          (lógica pura: sem banco, sem rede)
 *   npm run test:editais-app:db       (inclui o teste de banco idempotente; cria e apaga dados "QA-TEST-APP")
 */
import { NO_ACCESS, RADAR_TABS, boardColumn, canContributePure, canSeeEditalPure, canSeePropostaPure, partnerMayWorkOn, staffCan, tabCounts, tabOfTriage, visibility, type EditaisActor, type ShareLite } from "../src/lib/editais-app/access";
import { INVITE_LABEL, inviteHtml, inviteLink, inviteState, inviteText, mailtoLink, whatsappLink } from "../src/lib/editais-app/invite";
import { getMailProvider, isEmail, mailConfigured, resendProvider, sendMail } from "../src/lib/mail";
import { advance, clampIndex, firstInvalid, progressPct, readDraft, visibleSteps, DRAFT_TTL_MS, type StepDef } from "../src/lib/editais-app/wizard-engine";
import { DECIDED_TABS, extraFilterCount, parseRadar, radarQuery } from "../src/lib/editais-app/radar-filters";
import { findMentions, splitMentions } from "../src/lib/editais-app/mentions";
import { redactBundle } from "../src/lib/editais-app/redact";
import {
  cleanPriceItems,
  cofreRules,
  envioRules,
  habilitacaoChoices,
  habilitacaoDefault,
  habilitacaoSummary,
  obraRules,
  parceiroRules,
  parseHabChoice,
  participarRules,
  precoRules,
  priceFromItems,
  resultadoRules,
  tecnicaRules,
  validUrlOrEmpty,
  type ParticiparValues,
} from "../src/lib/editais-app/flow-rules";
import { PRICE_ROWS, priceSheetTabs } from "../src/lib/propostas/price-sheet";
import { evaluateMatrix, type CofreLite } from "../src/lib/propostas/cofre";
import type { Bundle } from "../src/lib/propostas/server";

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

/* ------------------------------------ autorização (puro) ------------------------------------ */
function accessTests() {
  const staffView: EditaisActor = { kind: "staff", id: "s1", name: "Ana", level: "view" };
  const staffEdit: EditaisActor = { kind: "staff", id: "s2", name: "Bia", level: "edit" };
  const staffNone: EditaisActor = { kind: "staff", id: "s3", name: "Caio", level: "none" };
  const partner: EditaisActor = { kind: "partner", id: "p1", name: "Davi", radarCompleto: false };
  const partnerFull: EditaisActor = { kind: "partner", id: "p2", name: "Eva", radarCompleto: true };
  const shareVer: ShareLite = { role: "ver", scope: "edital", showDocs: false, showSheet: false, docIds: [] };
  const shareContrib: ShareLite = { role: "contribuir", scope: "proposta", showDocs: false, showSheet: false, docIds: ["d1"] };
  const shareAll: ShareLite = { role: "contribuir", scope: "proposta", showDocs: true, showSheet: true, docIds: [] };

  // equipe
  eq(visibility(staffNone, null), NO_ACCESS, "equipe sem o módulo: nada");
  ok(visibility(staffView, null).edital && visibility(staffView, null).proposta, "equipe com ver: vê edital e proposta");
  eq(visibility(staffView, null).contribute, false, "equipe só com ver: não contribui");
  eq(visibility(staffEdit, null).contribute, true, "equipe com editar: contribui");
  ok(visibility(staffEdit, null).staff, "equipe é marcada como equipe");
  eq([staffCan(staffView, "edit"), staffCan(staffEdit, "edit"), staffCan(staffEdit, "manage"), staffCan(partner, "view")], [false, true, false, false], "staffCan respeita o nível e nunca vale para parceiro");

  // parceiro SEM compartilhamento
  eq(visibility(partner, null), NO_ACCESS, "parceiro sem compartilhamento não vê nada");
  eq(canSeeEditalPure(partner, null), false, "canSeeEdital: parceiro sem compartilhamento = não");
  eq(canSeePropostaPure(partner, null), false, "parceiro sem compartilhamento não vê proposta");
  // Radar completo: lê o edital, mas nunca a proposta nem contribui
  eq([canSeeEditalPure(partnerFull, null), canSeePropostaPure(partnerFull, null), canContributePure(partnerFull, null)], [true, false, false], "Radar completo libera só a leitura do edital");
  ok(!visibility(partnerFull, null).staff, "Radar completo não vira equipe");
  // compartilhado
  const v1 = visibility(partner, shareVer);
  eq([v1.edital, v1.proposta, v1.contribute, v1.docs, v1.sheet], [true, false, false, false, false], "compartilhado só edital + só ver");
  const v2 = visibility(partner, shareContrib);
  eq([v2.edital, v2.proposta, v2.contribute, v2.docs, v2.sheet, v2.docIds], [true, true, true, false, false, ["d1"]], "proposta compartilhada: documentos e planilha continuam só da equipe");
  const v3 = visibility(partner, shareAll);
  eq([v3.docs, v3.sheet], [true, true], "equipe marcou mostrar documentos e planilha");
  eq(visibility(partner, { ...shareAll, scope: "edital" }).docs, false, "sem proposta compartilhada, documentos nunca aparecem");
  eq(canContributePure(partner, shareVer), false, "papel “ver” não contribui");
  eq(canContributePure(partner, shareContrib), true, "papel “contribuir” contribui");
  eq(visibility(partner, shareContrib).staff, false, "parceiro nunca é equipe");

  // tarefas atribuídas
  eq(partnerMayWorkOn(partner, shareContrib, "p1"), true, "parceiro conclui o item atribuído a ele");
  eq(partnerMayWorkOn(partner, shareContrib, "s1"), false, "parceiro não conclui item de outra pessoa");
  eq(partnerMayWorkOn(partner, shareContrib, null), false, "parceiro não conclui item sem responsável");
  eq(partnerMayWorkOn(partner, shareVer, "p1"), false, "sem proposta/contribuir, nem o item dele");
  eq(partnerMayWorkOn(partner, null, "p1"), false, "sem compartilhamento, nem o item dele");
  eq(partnerMayWorkOn(staffEdit, shareContrib, "s2"), false, "partnerMayWorkOn é só para parceiro");
}

/* ------------------------------------ abas e quadro ------------------------------------ */
function tabsTests() {
  eq(RADAR_TABS.map((t) => t.key), ["novos", "interessantes", "proposta", "descartados", "todos"], "abas na ordem combinada");
  eq(
    ["novo", "interessante", "em_analise", "em_proposta", "proposta_enviada", "descartado", "ganho", "perdido"].map(tabOfTriage),
    ["novos", "interessantes", "interessantes", "proposta", "proposta", "descartados", null, null],
    "triagem → aba",
  );
  const c = tabCounts({ novo: 31, interessante: 1, em_analise: 2, em_proposta: 1, proposta_enviada: 3, descartado: 4, ganho: 2, perdido: 1 });
  eq(c, { novos: 31, interessantes: 3, proposta: 4, descartados: 4, todos: 45 }, "contagens por aba (todos soma tudo, inclusive ganho e perdido)");
  eq(tabCounts({}), { novos: 0, interessantes: 0, proposta: 0, descartados: 0, todos: 0 }, "contagens vazias");

  const st = (s: Record<string, string>) => Object.entries(s).map(([key, status]) => ({ key, status }));
  eq(boardColumn({ status: "andamento", steps: st({ analisar: "a_fazer", habilitacao: "a_fazer" }) }), "analisando", "quadro: nada iniciado = Analisando");
  eq(boardColumn({ status: "andamento", steps: st({ analisar: "concluida", habilitacao: "a_fazer" }) }), "preparando", "quadro: análise feita = Preparando");
  eq(boardColumn({ status: "andamento", steps: st({ analisar: "a_fazer", tecnica: "em_andamento" }) }), "preparando", "quadro: etapa de preparação iniciada = Preparando");
  eq(boardColumn({ status: "andamento", steps: st({ analisar: "concluida", envio: "concluida" }) }), "enviada", "quadro: envio concluído = Enviada");
  eq(boardColumn({ status: "ganhou", steps: st({ envio: "concluida" }) }), "resultado", "quadro: ganhou = Resultado");
  eq(boardColumn({ status: "desistiu", steps: [] }), "resultado", "quadro: desistência = Resultado");
}

/* ------------------------------------ filtros do Radar ------------------------------------ */
function radarFilterTests() {
  const f = parseRadar(new URLSearchParams(""));
  eq([f.tab, f.situacao, f.rel, f.sort], ["novos", "aberto", 50, "prazo"], "Radar: padrão da aba Novos");
  const d = parseRadar(new URLSearchParams("aba=descartados"));
  eq([d.tab, d.situacao, d.rel], ["descartados", "todos", 0], "Radar: abas de decisão mostram tudo");
  const d2 = parseRadar(new URLSearchParams("aba=proposta&situacao=aberto&rel=70"));
  eq([d2.situacao, d2.rel], ["aberto", 70], "Radar: filtro explícito vence o padrão da aba");
  eq(parseRadar(new URLSearchParams("aba=bobagem")).tab, "novos", "aba inválida volta para Novos");
  const p = parseRadar(new URLSearchParams("aba=descartados&uf=sp,mg&tipo=execucao&prazo=7&q=%20forro%20"), { partner: true });
  eq([p.tab, p.situacao, p.rel], ["todos", "todos", 0], "Radar do parceiro: sempre “todos” (compartilhados), sem corte");
  eq([p.ufs, p.tipos, p.prazo, p.q], [["SP", "MG"], ["execucao"], 7, "forro"], "filtros enxutos lidos da URL");
  eq(DECIDED_TABS, ["proposta", "descartados"], "abas de decisão");
  // ida e volta
  const q1 = radarQuery(parseRadar(new URLSearchParams("")));
  eq(q1, "", "URL limpa no padrão");
  const f2 = parseRadar(new URLSearchParams("aba=interessantes&uf=BA&prazo=15&mod=pregao&cidade=Itu&vmin=1000"));
  const q2 = radarQuery(f2);
  const f3 = parseRadar(new URLSearchParams(q2));
  eq([f3.tab, f3.ufs, f3.prazo, f3.mod, f3.city, f3.vmin], [f2.tab, f2.ufs, f2.prazo, f2.mod, f2.city, f2.vmin], "filtros sobrevivem à ida e volta pela URL");
  eq(extraFilterCount(f2), 3, "“Mais filtros” conta só os extras ligados (modalidade, município, valor)");
  eq(extraFilterCount(parseRadar(new URLSearchParams(""))), 0, "sem extras = 0");
  const d3 = parseRadar(new URLSearchParams(radarQuery(parseRadar(new URLSearchParams("aba=descartados")))));
  eq([d3.tab, d3.situacao, d3.rel], ["descartados", "todos", 0], "aba de decisão sobrevive à URL");
}

/* ------------------------------------ convite ------------------------------------ */
function inviteTests() {
  const dt = new Date("2026-10-20T12:00:00Z");
  eq(inviteState({ revokedAt: null, lastLoginAt: null }), "pendente", "convite: sem login = pendente");
  eq(inviteState({ revokedAt: null, lastLoginAt: dt }), "aceito", "convite: primeiro login = aceito");
  eq(inviteState({ revokedAt: dt, lastLoginAt: null }), "revogado", "convite: revogado");
  eq(inviteState({ revokedAt: dt, lastLoginAt: dt }), "revogado", "convite: revogado vence aceito");
  eq(Object.values(INVITE_LABEL), ["Convite pendente", "Aceito", "Revogado"], "rótulos do estado");

  const t = inviteText({ partnerName: "Maria Souza", partnerEmail: "maria@x.com", inviterName: "Jhonatan", origin: "https://crm.estudiorestaura.com.br/", tempPassword: "abc123" });
  ok(t.startsWith("Olá, Maria!"), "texto: saudação pelo primeiro nome");
  ok(t.includes("Entrar com Google") && t.indexOf("Entrar com Google") < t.indexOf("senha provisória"), "texto: Google primeiro, senha provisória depois");
  ok(t.includes("abc123") && t.includes("maria@x.com"), "texto: e-mail e senha provisória");
  ok(t.includes("https://crm.estudiorestaura.com.br/login") && !t.includes("//login"), "texto: link de acesso limpo");
  const t2 = inviteText({ partnerName: "Maria", partnerEmail: "maria@x.com", inviterName: "J", origin: "https://x.com" });
  ok(!t2.includes("abc123") && t2.includes("peça uma provisória"), "texto sem senha: orienta pedir uma provisória");
  eq(inviteLink("https://a.com//"), "https://a.com/login", "link de acesso");
  const html = inviteHtml({ partnerName: "<b>Ana</b>", partnerEmail: "a@a.com", inviterName: "J", origin: "https://x.com" });
  ok(!html.includes("<b>Ana</b>") && html.includes("&lt;b&gt;"), "html escapa o nome");
  const wa = whatsappLink("Olá & tudo", "(11) 98888-7777");
  ok(wa.startsWith("https://wa.me/5511988887777?text="), "WhatsApp com DDI 55 e só dígitos");
  ok(wa.includes(encodeURIComponent("Olá & tudo")), "WhatsApp codifica o texto");
  ok(whatsappLink("x", "").startsWith("https://wa.me/?text="), "WhatsApp sem telefone: abre a escolha de contato");
  ok(mailtoLink("a@b.com", "Assunto x", "Corpo\nlinha").startsWith("mailto:a%40b.com?subject=Assunto%20x&body=Corpo%0Alinha"), "mailto codificado");
}

/* ------------------------------------ e-mail com plano B ------------------------------------ */
async function mailTests() {
  eq(getMailProvider({}), null, "sem chave: nenhum provedor");
  eq(getMailProvider({ RESEND_API_KEY: "re_x" }), null, "chave sem remetente: nenhum provedor");
  eq(mailConfigured({ RESEND_API_KEY: "re_x", MAIL_FROM: "Estúdio <oi@x.com>" }), true, "chave + remetente: configurado");
  eq(getMailProvider({ RESEND_API_KEY: "re_x", RESEND_FROM: "oi@x.com" })?.name, "resend", "RESEND_FROM também vale");
  eq(isEmail("a@b.co"), true, "e-mail válido");
  eq([isEmail("a b@c.com"), isEmail("sem-arroba"), isEmail("")], [false, false, false], "e-mails inválidos");

  // plano B: sem provedor, sendMail não quebra e diz o motivo
  const r0 = await sendMail({ to: "a@b.com", subject: "x", text: "y" }, null);
  eq(r0, { ok: false, provider: null, reason: "sem_provedor" }, "sem provedor: plano B (reason sem_provedor)");
  const r1 = await sendMail({ to: "nao-e-email", subject: "x", text: "y" }, null);
  eq(r1.ok === false && r1.reason, "invalido", "destino inválido é recusado antes de tudo");

  // com provedor (fetch simulado)
  const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const good = resendProvider("re_key", "Estúdio <oi@x.com>", async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return { ok: true, status: 200, json: async () => ({ id: "msg_1" }), text: async () => "" };
  });
  const r2 = await sendMail({ to: "maria@x.com", subject: "Convite", text: "Olá", html: "<p>Olá</p>" }, good);
  eq(r2, { ok: true, provider: "resend", id: "msg_1" }, "com provedor: envia e devolve o id");
  eq([calls[0].url, calls[0].auth, calls[0].body.to, calls[0].body.from, calls[0].body.subject], ["https://api.resend.com/emails", "Bearer re_key", ["maria@x.com"], "Estúdio <oi@x.com>", "Convite"], "payload do Resend");
  const bad = resendProvider("re_key", "oi@x.com", async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => "domínio não verificado" }));
  const r3 = await sendMail({ to: "maria@x.com", subject: "x", text: "y" }, bad);
  ok(r3.ok === false && r3.reason === "erro" && /422/.test(r3.error ?? ""), "erro do provedor vira reason “erro” com o status");
  const boom = resendProvider("k", "o@x.com", async () => {
    throw new Error("rede caiu");
  });
  const r4 = await sendMail({ to: "maria@x.com", subject: "x", text: "y" }, boom);
  ok(r4.ok === false && r4.reason === "erro" && r4.error === "rede caiu", "falha de rede não derruba: vira “erro”");
}

/* ------------------------------------ assistentes ------------------------------------ */
function wizardTests() {
  type V = { a: string; b: string; skipB: boolean };
  const steps: StepDef<V>[] = [
    { id: "a", validate: (v) => (v.a ? null : "Preencha A") },
    { id: "b", skip: (v) => v.skipB, validate: (v) => (v.b ? null : "Preencha B") },
    { id: "c" },
  ];
  const v: V = { a: "", b: "", skipB: false };
  eq(visibleSteps(steps, v).map((s) => s.id), ["a", "b", "c"], "motor: todos os passos visíveis");
  eq(visibleSteps(steps, { ...v, skipB: true }).map((s) => s.id), ["a", "c"], "motor: passo condicional some");
  eq(advance(steps, v, 0), { kind: "error", error: "Preencha A" }, "motor: validação por passo bloqueia");
  eq(advance(steps, { ...v, a: "x" }, 0), { kind: "next", index: 1 }, "motor: avança");
  eq(advance(steps, { a: "x", b: "", skipB: true }, 0), { kind: "next", index: 1 }, "motor: passo pulado não bloqueia");
  eq(advance(steps, { a: "x", b: "y", skipB: false }, 2), { kind: "submit" }, "motor: último passo envia");
  eq(advance(steps, { a: "x", b: "y", skipB: false }, 2, { hasReview: true }), { kind: "next", index: 3 }, "motor: com revisão, o último passo leva à revisão");
  eq(firstInvalid(steps, { a: "x", b: "", skipB: false }), { index: 1, error: "Preencha B" }, "motor: acha o primeiro passo inválido antes de enviar");
  eq(firstInvalid(steps, { a: "x", b: "", skipB: true }), null, "motor: passo pulado não conta como inválido");
  eq([progressPct(0, 5), progressPct(4, 5), progressPct(9, 5), progressPct(0, 0)], [20, 100, 100, 0], "motor: barra de progresso");
  eq([clampIndex(9, 3, false), clampIndex(9, 3, true), clampIndex(-1, 3, false)], [2, 3, 0], "motor: índice sempre dentro dos passos");
  const now = Date.now();
  const raw = JSON.stringify({ v: { a: "1" }, index: 2, at: now });
  eq(readDraft<{ a: string }>(raw, now)?.index, 2, "rascunho recente é lido");
  eq(readDraft(raw, now + DRAFT_TTL_MS + 1), null, "rascunho de mais de 7 dias é ignorado");
  eq([readDraft(null), readDraft("{"), readDraft('{"v":1}')], [null, null, null], "rascunho corrompido é ignorado");

  // Vou participar
  const pv: ParticiparValues = { confirmed: false, tipo: "", templateKey: "", sessionAt: "", ownerId: "", partnerIds: [], partnerRole: "contribuir" };
  ok(participarRules.confirmar(pv), "participar: precisa confirmar o edital");
  eq(participarRules.confirmar({ ...pv, confirmed: true }), null, "participar: confirmado");
  ok(participarRules.tipo(pv), "participar: precisa do tipo");
  ok(participarRules.data(pv, false), "participar: sem data do portal exige data");
  eq(participarRules.data(pv, true), null, "participar: com data do portal pode seguir");
  ok(participarRules.data({ ...pv, sessionAt: "lixo" }, true), "participar: data inválida");
  eq(participarRules.data({ ...pv, sessionAt: "2026-11-07T18:00" }, false), null, "participar: data válida");
  ok(participarRules.responsavel(pv), "participar: precisa de responsável");
  ok(participarRules.modelo(pv), "participar: precisa de modelo");

  // Habilitação
  const today = "2026-10-26";
  const docs: CofreLite[] = [
    { id: "00000000-0000-0000-0000-000000000001", type: "certidao_federal", title: "Federal nova", number: "123", validUntil: "2027-03-01", url: null },
    { id: "00000000-0000-0000-0000-000000000002", type: "certidao_federal", title: "Federal velha", number: null, validUntil: "2026-10-01", url: null },
    { id: "00000000-0000-0000-0000-000000000003", type: "certidao_fgts", title: "FGTS curta", number: null, validUntil: "2026-11-02", url: null },
  ];
  const rows = evaluateMatrix(
    [
      { id: "r1", title: "Certidão federal", cofreType: "certidao_federal", cofreDocId: null, mode: "auto" },
      { id: "r2", title: "FGTS", cofreType: "certidao_fgts", cofreDocId: null, mode: "auto" },
      { id: "r3", title: "Balanço", cofreType: "balanco", cofreDocId: null, mode: "auto" },
      { id: "r4", title: "Declaração", cofreType: null, cofreDocId: null, mode: "na" },
    ],
    docs,
    "2026-11-10",
    today,
  );
  eq(rows.map((r) => r.situation), ["ok", "vence_antes", "faltando", "na"], "matriz de teste");
  const ch1 = habilitacaoChoices(rows[0], docs, "2026-11-10", today);
  eq(ch1.map((c) => c.value).slice(0, 2), ["doc:00000000-0000-0000-0000-000000000001", "doc:00000000-0000-0000-0000-000000000002"], "habilitação: documentos do tipo, o de maior validade primeiro");
  eq(ch1.slice(-3).map((c) => c.value), ["ok_manual", "na", "falta"], "habilitação: sempre as três saídas ao fim");
  eq([ch1[0].badge, ch1[1].badge], ["Em dia", "Vencido"], "habilitação: selo do documento (em dia / vencido)");
  eq(habilitacaoChoices(rows[1], docs, "2026-11-10", today)[0].badge, "Vence antes da sessão", "habilitação: documento que vence antes da sessão");
  eq(habilitacaoChoices(rows[2], docs, "2026-11-10", today).map((c) => c.value), ["ok_manual", "na", "falta"], "habilitação: sem documento do tipo só há as saídas");
  eq(rows.map(habilitacaoDefault), ["doc:00000000-0000-0000-0000-000000000001", "", "falta", "na"], "habilitação: resposta sugerida (vence antes obriga a decidir)");
  eq(parseHabChoice("falta"), { kind: "falta" }, "escolha: falta");
  eq(parseHabChoice("doc:00000000-0000-0000-0000-000000000001"), { kind: "doc", docId: "00000000-0000-0000-0000-000000000001" }, "escolha: documento");
  eq([parseHabChoice("doc:x"), parseHabChoice(""), parseHabChoice("drop table")], [null, null, null], "escolha inválida é descartada");
  eq(habilitacaoSummary({ r1: "doc:00000000-0000-0000-0000-000000000001", r2: "falta", r3: "falta", r4: "na", r5: "ok_manual" }), { ok: 2, falta: 2, na: 1 }, "resumo da habilitação");

  // Técnica
  ok(tecnicaRules.compreensao(" "), "técnica: compreensão obrigatória");
  ok(tecnicaRules.metodologia("curta"), "técnica: metodologia muito curta");
  eq(tecnicaRules.metodologia("Faremos o levantamento e a consolidação dos suportes com materiais compatíveis."), null, "técnica: metodologia ok");

  // Preço
  eq([precoRules.bdi("25"), precoRules.bdi("25,5")], [null, null], "preço: BDI válido (com vírgula)");
  ok(precoRules.bdi("") && precoRules.bdi("101") && precoRules.bdi("-1") && precoRules.bdi("abc"), "preço: BDI inválido");
  ok(precoRules.prazo(" "), "preço: prazo obrigatório");
  eq([precoRules.validade("60"), precoRules.validade("0") !== null, precoRules.validade("900") !== null, precoRules.validade("6,5") !== null], [null, true, true, true], "preço: validade em dias inteiros");
  const items = [
    { desc: "Forro", unit: "m²", qty: "100", material: "10", labor: "20" },
    { desc: "Sem quantidade", unit: "m²", qty: "", material: "5", labor: "5" },
    { desc: "", unit: "m²", qty: "3", material: "1", labor: "1" },
  ];
  eq(cleanPriceItems(items).length, 1, "preço: só itens com descrição e quantidade");
  eq(priceFromItems(items, 25), { direct: 3000, bdi: 750, total: 3750, count: 1 }, "preço: custo direto, BDI e total");
  eq(priceFromItems(items, 25, 10).direct, 3200, "preço: encargos sociais sobre a mão de obra");
  eq(priceFromItems([], 25), { direct: 0, bdi: 0, total: 0, count: 0 }, "preço: sem itens");
  eq(priceFromItems([{ desc: "x", unit: "un", qty: "1.234,56", material: "0,5", labor: "0" }], 0).direct, 617.28, "preço: números no formato brasileiro");

  // a planilha ganha os itens digitados (e mantém os exemplos quando não há itens)
  const sheet = priceSheetTabs({ bdiPercent: 20, encargosPercent: 0, estimatedCents: null, items: cleanPriceItems(items) });
  const comp = sheet.tabs.find((t) => t.name === "Composição")!;
  eq([comp.grid[1]?.[1]?.v, comp.grid[1]?.[3]?.v, comp.grid[1]?.[4]?.v, comp.grid[1]?.[5]?.v], ["Forro", 100, 10, 20], "planilha: item do assistente na primeira linha");
  ok(!comp.grid[2]?.[1]?.v, "planilha: sem exemplos quando há itens");
  const dflt = priceSheetTabs({ bdiPercent: 20, encargosPercent: 0 });
  ok(String(dflt.tabs[0].grid[1]?.[1]?.v).startsWith("Exemplo"), "planilha: exemplos continuam quando não há itens");
  const resumo = sheet.tabs.find((t) => t.name === "Resumo")!;
  eq(resumo.grid[1]?.[1]?.v, 0.2, "planilha: BDI do assistente");
  ok(PRICE_ROWS >= 12, "planilha: comporta os itens do assistente");

  // Envio, resultado, acervo, parceiro
  ok(envioRules.conferencia(3, 5), "envio: conferência incompleta bloqueia");
  eq(envioRules.conferencia(5, 5), null, "envio: conferência completa");
  eq([envioRules.link(""), envioRules.link("https://drive.google.com/x")], [null, null], "envio: link opcional ou válido");
  ok(envioRules.link("ftp://x") && envioRules.link("texto solto"), "envio: link inválido");
  ok(envioRules.quando(""), "envio: data obrigatória");
  eq([validUrlOrEmpty(""), validUrlOrEmpty("http://a.com")], [null, null], "link vazio ou http(s)");
  ok(resultadoRules.status(""), "resultado: precisa escolher");
  ok(resultadoRules.motivo("perdeu", ""), "resultado: perda exige motivo");
  eq([resultadoRules.motivo("ganhou", ""), resultadoRules.motivo("perdeu", "Preço acima do vencedor")], [null, null], "resultado: vitória não exige motivo");
  ok(resultadoRules.motivo("desistiu", ""), "resultado: desistência exige motivo");
  ok(cofreRules.tipo("") && !cofreRules.tipo("certidao_fgts"), "cofre: tipo conhecido");
  ok(cofreRules.titulo(""), "cofre: nome obrigatório");
  ok(cofreRules.datas("2026-05-01", "2026-04-01"), "cofre: validade antes da emissão");
  eq(cofreRules.datas("", "2026-04-01"), null, "cofre: só validade");
  ok(obraRules.titulo(" "), "obra: título obrigatório");
  eq([obraRules.ano(""), obraRules.ano("2020")], [null, null], "obra: ano opcional ou válido");
  ok(obraRules.ano("1800") && obraRules.ano("abc"), "obra: ano inválido");
  ok(parceiroRules.nome("") && parceiroRules.email("maria@") && parceiroRules.email("a b@c.com"), "parceiro: nome e e-mail inválidos");
  eq([parceiroRules.nome("Maria"), parceiroRules.email("maria@x.com")], [null, null], "parceiro: dados válidos");
}

/* ------------------------------------ menções e recorte do dossiê ------------------------------------ */
function collabTests() {
  const people = [
    { id: "1", name: "Maria Silva" },
    { id: "2", name: "Maria" },
    { id: "3", name: "João Pedro" },
    { id: "4", name: "Álvaro" },
  ];
  eq(findMentions("Oi @Maria Silva, veja isto", people), ["1"], "menção: nome completo ganha do primeiro nome");
  eq(findMentions("Oi @maria e @JOÃO PEDRO!", people).sort(), ["2", "3"], "menção: sem diferenciar maiúsculas e com acento");
  eq(findMentions("@alvaro pode ver?", people), ["4"], "menção: sem acento também casa");
  eq(findMentions("e-mail maria@x.com não é menção", people), [], "menção: e-mail não conta");
  eq(findMentions("@Mariana não existe", people), [], "menção: precisa terminar no nome (não casa parte da palavra)");
  eq(findMentions("", people), [], "menção: texto vazio");
  const parts = splitMentions("Oi @Maria Silva, tudo bem?", people);
  eq(parts.map((p) => p.mention), [false, true, false], "menção: destaque na tela");
  eq(parts.map((p) => p.text).join(""), "Oi @Maria Silva, tudo bem?", "menção: o texto não se perde");

  // recorte do dossiê
  const base = {
    dossie: { id: "d", editalId: "e", status: "andamento", templateKey: "obra", matrixKey: "matriz-obra", numero: "1", processo: "2", sessionDay: null, sessionLocal: "", ownerId: "u1", ownerName: "Ana", priceSheetId: "sh", resultReason: "preço", resultValueCents: 1000, resultNotes: "n", resultAt: null, checklistAppliedAt: null },
    edital: { id: "e", notes: "segredo da equipe", discardReason: "x", ownerId: "u1", ownerName: "Ana", dealId: "deal", taskId: "t" },
    requirements: [{ id: "r" }],
    matrix: [{ req: { id: "r" } }],
    matrixSummary: { total: 1, ok: 0, problems: 1, faltando: 1, vencendo: 0 },
    cofre: [
      { id: "c1", title: "Federal" },
      { id: "c2", title: "Balanço" },
    ],
    docs: [{ id: "doc1" }],
    sheet: { id: "sh", name: "Planilha" },
    deal: { id: "deal", title: "Negócio", stageName: "Proposta" },
    steps: [],
    items: [],
  } as unknown as Bundle;
  const staffView = redactBundle(base, visibility({ kind: "staff", id: "s", name: "S", level: "edit" }, null));
  ok(!staffView.redacted && staffView.docs.length === 1 && staffView.sheet && staffView.deal, "recorte: equipe vê tudo");
  const pv = redactBundle(base, visibility({ kind: "partner", id: "p", name: "P", radarCompleto: false }, { role: "contribuir", scope: "proposta", showDocs: false, showSheet: false, docIds: ["c2"] }));
  ok(pv.redacted, "recorte: parceiro é recortado");
  eq([pv.docs.length, pv.sheet, pv.deal], [0, null, null], "recorte: sem documentos, planilha e negócio");
  eq([pv.dossie.priceSheetId, pv.dossie.resultValueCents, pv.dossie.resultNotes, pv.dossie.resultReason, pv.dossie.ownerId], [null, null, null, null, null], "recorte: sem valores internos nem resultado");
  eq([pv.edital.notes, pv.edital.discardReason, pv.edital.dealId, pv.edital.ownerName], [null, null, null, null], "recorte: sem notas internas do edital");
  eq([pv.matrix.length, pv.requirements.length, pv.matrixSummary.total], [0, 0, 0], "recorte: sem matriz de habilitação");
  eq(pv.cofre.map((c) => c.id), ["c2"], "recorte: do cofre, só o documento liberado");
  const pv2 = redactBundle(base, visibility({ kind: "partner", id: "p", name: "P", radarCompleto: false }, { role: "ver", scope: "proposta", showDocs: true, showSheet: true, docIds: [] }));
  eq([pv2.docs.length, pv2.sheet?.id, pv2.deal], [1, "sh", null], "recorte: documentos e planilha aparecem quando a equipe marca; negócio nunca");
}

/* ------------------------------------ banco (idempotente) ------------------------------------ */
async function dbTests() {
  await import("./_server-only.cjs");
  const { and, eq: deq, inArray, like, or } = await import("drizzle-orm");
  const { db, schema } = await import("../src/lib/db");
  const crypto = await import("node:crypto");
  const { hashPassword } = await import("../src/lib/password");
  const authz = await import("../src/lib/editais-app/authz");
  const radar = await import("../src/lib/editais-app/radar");
  const partners = await import("../src/lib/editais-app/partners");
  const collab = await import("../src/lib/editais-app/collab");
  const props = await import("../src/lib/editais-app/propostas");
  const ops = await import("../src/lib/propostas/ops");
  const { PROFILES } = await import("../src/lib/permissions");
  const { parseRadar } = await import("../src/lib/editais-app/radar-filters");

  const STAFF = "qa-app-staff@example.test";
  const P1 = "qa-app-parceiro1@example.test";
  const P2 = "qa-app-parceiro2@example.test";
  const cleanup = async () => {
    const us = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "qa-app-%@example.test"));
    const ids = us.map((u) => u.id);
    const eds = await db.select({ id: schema.editais.id }).from(schema.editais).where(like(schema.editais.externalId, "QA-TEST-APP-%"));
    if (ids.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.createdById, ids));
      await db.delete(schema.taskBoards).where(and(inArray(schema.taskBoards.createdById, ids), like(schema.taskBoards.name, "Editais")));
    }
    await db.delete(schema.taskGroups).where(like(schema.taskGroups.name, "QA-TEST-APP%"));
    if (eds.length) await db.delete(schema.documents).where(inArray(schema.documents.editalId, eds.map((e) => e.id)));
    await db.delete(schema.deals).where(like(schema.deals.title, "QA-TEST-APP%"));
    await db.delete(schema.contacts).where(like(schema.contacts.company, "QA-TEST-APP%"));
    await db.delete(schema.editais).where(like(schema.editais.externalId, "QA-TEST-APP-%"));
    await db.delete(schema.notifications).where(or(like(schema.notifications.title, "%QA-TEST-APP%"), like(schema.notifications.title, "%QA App%")));
    await db.delete(schema.auditLog).where(like(schema.auditLog.actorName, "QA App%"));
    await db.delete(schema.users).where(like(schema.users.email, "qa-app-%@example.test"));
  };
  await cleanup();

  try {
    // equipe (administrador de teste) e 3 editais
    const [staffRow] = await db
      .insert(schema.users)
      .values({ name: "QA App Equipe", email: STAFF, passwordHash: hashPassword(crypto.randomBytes(9).toString("base64url")), role: "admin", profile: "administrador", calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning();
    const staff = (await authz.actorFromUser({ ...staffRow, perms: PROFILES.administrador.perms }))!;
    eq(staff.kind, "staff", "equipe vira ator “staff”");
    const mk = async (n: number, extra: Partial<typeof schema.editais.$inferInsert> = {}) =>
      (
        await db
          .insert(schema.editais)
          .values({ externalId: `QA-TEST-APP-${n}`, title: `QA-TEST-APP edital ${n}`, object: `Obra de restauração do forro ${n}`, organ: "QA-TEST-APP Prefeitura", uf: "SP", city: "Itu", kind: "execucao", score: 90, modalidade: "Concorrência", valueCents: 50_000_000, closeAt: new Date(Date.now() + (10 + n) * 864e5), situation: "aberto", notes: "nota interna da equipe", ...extra })
          .returning()
      )[0];
    const e1 = await mk(1);
    const e2 = await mk(2);
    const e3 = await mk(3);

    // convite: cria a conta (sem provedor de e-mail: plano B)
    const origin = "https://crm.estudiorestaura.com.br";
    const inv = await partners.invitePartner({ id: staffRow.id, name: staffRow.name }, { name: "QA App Parceiro Um", email: P1, company: "QA-TEST-APP Engenharia", phone: "(11) 98888-7777", areas: "engenharia" }, origin);
    ok("ok" in inv, "convite criado");
    if (!("ok" in inv)) throw new Error("convite falhou");
    const p1Id = inv.partnerId;
    eq(inv.pack.emailed, false, "sem provedor: o convite NÃO saiu por e-mail");
    ok(inv.pack.mailNote && inv.pack.tempPassword && inv.pack.text.includes(inv.pack.tempPassword), "plano B: texto pronto com a senha provisória");
    ok(inv.pack.whatsapp.startsWith("https://wa.me/5511988887777"), "plano B: WhatsApp com o telefone do parceiro");
    const [pu] = await db.select().from(schema.users).where(deq(schema.users.id, p1Id));
    eq([pu.role, pu.profile, pu.active, pu.mustChangePassword], ["parceiro", "parceiro_editais", true, true], "conta criada: parceiro de editais, ativa, troca a senha no 1º acesso");
    eq(Object.values(PROFILES.parceiro_editais.perms).every((l) => l === "none"), true, "perfil do parceiro: nenhum módulo do CRM");
    const dup = await partners.invitePartner({ id: staffRow.id, name: "x" }, { name: "Outro", email: P1.toUpperCase() }, origin);
    ok("error" in dup, "e-mail repetido (mesmo em maiúsculas) é recusado");
    const dup2 = await partners.invitePartner({ id: staffRow.id, name: "x" }, { name: "Equipe", email: STAFF }, origin);
    ok("error" in dup2, "e-mail de quem é da equipe é recusado");
    ok("error" in (await partners.invitePartner({ id: staffRow.id, name: "x" }, { name: "", email: "a@b.com" }, origin)), "nome vazio é recusado");
    ok("error" in (await partners.invitePartner({ id: staffRow.id, name: "x" }, { name: "A", email: "sem-arroba" }, origin)), "e-mail inválido é recusado");
    const pr = (await partners.listPartners()).find((p) => p.id === p1Id)!;
    eq([pr.state, pr.channel, pr.inviteCount, pr.radarCompleto], ["pendente", "manual", 1, false], "estado: pendente, canal manual, 1 convite, Radar completo desligado");

    // ciclo do convite: pendente → (reenviar) → aceito → revogado → reativado
    const re = await partners.resendInvite({ id: staffRow.id, name: staffRow.name }, p1Id, origin);
    ok("ok" in re && re.pack.tempPassword && re.pack.tempPassword !== inv.pack.tempPassword, "reenviar antes do 1º acesso gera senha provisória nova");
    eq((await partners.getPartner(p1Id))?.inviteCount, 2, "reenvio conta");
    // aceite = primeiro login
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(deq(schema.users.id, p1Id));
    eq((await partners.getPartner(p1Id))?.state, "aceito", "estado: aceito no primeiro login");
    const re2 = await partners.resendInvite({ id: staffRow.id, name: staffRow.name }, p1Id, origin);
    ok("ok" in re2 && re2.pack.tempPassword === null, "reenviar depois de aceito não gera senha");
    await partners.noteAcceptance(p1Id);
    await partners.noteAcceptance(p1Id);
    await Promise.all([partners.noteAcceptance(p1Id), partners.noteAcceptance(p1Id)]);
    const acc = await db.select().from(schema.notifications).where(and(deq(schema.notifications.userId, staffRow.id), deq(schema.notifications.type, "parceiro_aceito")));
    eq(acc.length, 1, "convite aceito avisa a equipe UMA vez (idempotente, mesmo em paralelo)");

    // autorização: parceiro SEM compartilhamento
    const p1 = (await authz.actorFromUser({ ...pu, perms: PROFILES.parceiro_editais.perms }))!;
    eq(p1.kind, "partner", "parceiro ativo vira ator “partner”");
    eq(await authz.canSeeEdital(p1, e1.id), false, "parceiro NÃO vê edital não compartilhado");
    eq(await authz.canSeeProposta(p1, e1.id), false, "parceiro não vê proposta não compartilhada");
    eq(await authz.canContribute(p1, e1.id), false, "parceiro não contribui em edital não compartilhado");
    eq(await authz.canSeeEdital(staff, e1.id), true, "equipe vê");
    eq(await authz.canSeeEdital(p1, "nao-e-id"), false, "id inválido = negado");
    eq(await authz.canSeeEdital(p1, "00000000-0000-0000-0000-000000000000"), false, "edital inexistente = negado");
    eq(await authz.filterVisibleEditais(p1, [e1.id, e2.id, e3.id]), [], "filtro em lote: nenhum");
    const f = parseRadar(new URLSearchParams(""), { partner: true });
    const fS = parseRadar(new URLSearchParams("q=QA-TEST-APP&aba=todos"));
    const lp = await radar.radarList(p1, { ...f, q: "QA-TEST-APP" });
    eq(lp.rows.length, 0, "Radar do parceiro: vazio sem compartilhamento");
    eq(lp.total, 0, "Radar do parceiro: total 0");
    eq((await radar.radarDetail(p1, e1.id)), null, "detalhe do edital não compartilhado: nulo (a página responde 404)");
    eq((await props.boardData(p1)).cards.length, 0, "quadro de propostas do parceiro: vazio");
    const ls = await radar.radarList(staff, { ...fS, rel: 0, situacao: "todos" });
    ok(ls.rows.filter((r) => r.title.startsWith("QA-TEST-APP")).length === 3, "Radar da equipe: vê os 3");
    ok(ls.rows.find((r) => r.id === e1.id)?.notes === "nota interna da equipe", "equipe vê as notas internas");

    // compartilhar (e idempotência)
    const sh1 = await partners.shareEditais({ id: staffRow.id, name: staffRow.name }, { editalIds: [e1.id], partnerIds: [p1Id], role: "ver", scope: "edital" });
    eq(sh1, { ok: true, created: 1, updated: 0 }, "compartilhar: 1 criado");
    const sh1b = await partners.shareEditais({ id: staffRow.id, name: staffRow.name }, { editalIds: [e1.id], partnerIds: [p1Id], role: "ver", scope: "edital" });
    eq(sh1b, { ok: true, created: 0, updated: 1 }, "compartilhar de novo só atualiza (idempotente)");
    eq((await db.select().from(schema.editalShares).where(deq(schema.editalShares.editalId, e1.id))).length, 1, "um compartilhamento por par edital × parceiro");
    const notif = await db.select().from(schema.notifications).where(and(deq(schema.notifications.userId, p1Id), deq(schema.notifications.type, "edital_compartilhado")));
    eq(notif.length, 1, "parceiro recebe UM aviso de compartilhamento (não repete)");
    eq(await authz.canSeeEdital(p1, e1.id), true, "parceiro VÊ o edital compartilhado");
    eq(await authz.canSeeEdital(p1, e2.id), false, "e continua sem ver o não compartilhado");
    eq(await authz.filterVisibleEditais(p1, [e1.id, e2.id, e3.id]), [e1.id], "filtro em lote: só o compartilhado");
    const lp2 = await radar.radarList(p1, { ...f, q: "QA-TEST-APP" });
    eq(lp2.rows.map((r) => r.id), [e1.id], "Radar do parceiro: só o compartilhado");
    eq(lp2.rows[0].notes, null, "Radar do parceiro: sem notas internas");
    eq(lp2.rows[0].myRole, "ver", "Radar do parceiro: papel dele");
    const det = await radar.radarDetail(p1, e1.id);
    ok(det && det.events.length === 0 && det.shares.length === 0, "detalhe do parceiro: sem histórico interno nem lista de parceiros");
    eq(det?.card.notes, null, "detalhe do parceiro: sem anotações");
    eq((await radar.radarDetail(p1, e2.id)), null, "detalhe do não compartilhado continua negado");
    eq(await authz.canSeeProposta(p1, e1.id), false, "escopo “edital”: sem proposta");
    eq(await authz.canContribute(p1, e1.id), false, "papel “ver”: não contribui");
    const cm0 = await collab.addComment(p1, { editalId: e1.id, body: "oi QA-TEST-APP" });
    ok("error" in cm0, "papel “ver”: comentar é negado no servidor");
    ok("error" in (await collab.markInterest(p1, e1.id)), "papel “ver”: marcar interesse é negado");
    ok("error" in (await collab.addComment(p1, { editalId: e2.id, body: "tentando em outro edital" })), "comentar em edital não compartilhado: negado");
    ok("error" in (await collab.addComment(p1, { editalId: e2.id, body: "x", kind: "link", linkUrl: "https://x.com" })), "anexar link em edital não compartilhado: negado");

    // promover para contribuir com a proposta
    await partners.shareEditais({ id: staffRow.id, name: staffRow.name }, { editalIds: [e1.id], partnerIds: [p1Id], role: "contribuir", scope: "proposta" });
    eq(await authz.canContribute(p1, e1.id), true, "contribuir: pode contribuir");
    eq((await authz.accessTo(p1, e1.id)).proposta, true, "escopo “proposta” libera a proposta");
    const cm = await collab.addComment(p1, { editalId: e1.id, body: "Tenho interesse e posso ajudar na parte técnica" });
    ok("ok" in cm, "contribuir: comentar funciona");
    ok("error" in (await collab.addComment(p1, { editalId: e1.id, body: "x", kind: "link", linkUrl: "javascript:alert(1)" })), "link inseguro é recusado");
    ok("ok" in (await collab.addComment(p1, { editalId: e1.id, body: "Atestado", kind: "revisao", linkUrl: "https://drive.google.com/x", linkName: "Atestado" })), "contribuir: enviar documento para revisão funciona");
    ok("ok" in (await collab.markInterest(p1, e1.id)), "contribuir: marcar interesse funciona");
    ok("ok" in (await collab.markInterest(p1, e1.id)), "marcar interesse duas vezes não falha");
    const intr = await db.select().from(schema.editalComments).where(and(deq(schema.editalComments.editalId, e1.id), deq(schema.editalComments.kind, "interesse")));
    eq(intr.length, 1, "interesse registrado uma única vez");
    // comentário interno da equipe não aparece para o parceiro
    ok("ok" in (await collab.addComment(staff, { editalId: e1.id, body: "só equipe vê isto", internal: true })), "equipe cria nota interna");
    ok("ok" in (await collab.addComment(staff, { editalId: e1.id, body: "mensagem para todos" })), "equipe comenta para todos");
    const cs = await radar.listComments(staff, e1.id);
    const cp = await radar.listComments(p1, e1.id);
    ok(cs.some((c) => c.internal) && !cp.some((c) => c.internal), "parceiro NÃO vê comentário interno");
    ok(cp.some((c) => c.body === "mensagem para todos"), "parceiro vê o comentário da equipe");
    const toPartner = await db.select().from(schema.notifications).where(and(deq(schema.notifications.userId, p1Id), deq(schema.notifications.type, "edital_comentario")));
    ok(toPartner.length >= 1 && toPartner.every((x) => !x.body?.includes("só equipe")), "aviso ao parceiro nunca vaza a nota interna");
    const toStaff = await db.select().from(schema.notifications).where(and(deq(schema.notifications.userId, staffRow.id), deq(schema.notifications.type, "edital_comentario")));
    ok(toStaff.length >= 1, "comentário do parceiro avisa a equipe");
    // só equipe aprova documento
    const rev = cp.find((c) => c.kind === "revisao")!;
    ok("error" in (await collab.reviewDocument(p1, rev.id, "aprovado")), "parceiro não aprova documento");
    ok("ok" in (await collab.reviewDocument(staff, rev.id, "aprovado")), "equipe aprova documento");

    // proposta: parceiro só mexe no item atribuído a ele
    const stActor = { id: staffRow.id, name: staffRow.name, role: "admin" as const, ownOnly: false, perms: PROFILES.administrador.perms };
    const start = await ops.startProposta(stActor, e1.id);
    ok("ok" in start, "equipe cria a proposta");
    const [d] = await db.select().from(schema.propostaDossies).where(deq(schema.propostaDossies.editalId, e1.id));
    const items = await db.select().from(schema.propostaItems).where(deq(schema.propostaItems.dossieId, d.id));
    ok(items.length > 3, "checklist criado");
    await db.update(schema.propostaItems).set({ assigneeId: p1Id }).where(deq(schema.propostaItems.id, items[0].id));
    const share = await authz.shareFor(p1, e1.id);
    eq(partnerMayWorkOn(p1, share, p1Id), true, "item atribuído ao parceiro: pode");
    eq(partnerMayWorkOn(p1, share, items[1].assigneeId), false, "item de outro: não pode");
    const view = await props.dossieView(p1, e1.id);
    ok(view, "parceiro com proposta compartilhada abre o dossiê");
    eq([view?.view.docs.length, view?.view.sheet, view?.view.deal, view?.view.matrix.length, view?.view.dossie.priceSheetId], [0, null, null, 0, null], "dossiê do parceiro: recortado");
    const tool = await ops.toggleItem({ id: p1Id, name: "QA App Parceiro Um" }, items[0].id, true);
    ok("editalId" in tool, "núcleo de marcar item funciona (a autorização é da action)");
    const board = await props.boardData(p1);
    eq(board.cards.map((c) => c.editalId), [e1.id], "quadro do parceiro: só a proposta compartilhada");
    eq([board.cards[0].ownerName, board.cards[0].partners.length], [null, 0], "quadro do parceiro: sem responsável interno nem lista de parceiros");
    const bs = await props.boardData(staff);
    ok(bs.cards.some((c) => c.editalId === e1.id), "quadro da equipe vê a proposta");
    const home = await partners.partnerHome(p1 as Extract<typeof p1, { kind: "partner" }>);
    eq(home.shared.map((s) => s.editalId), [e1.id], "painel do parceiro: compartilhados");
    eq(home.tasks.length, 0, "painel do parceiro: item já concluído não aparece como tarefa");
    // desmarca para aparecer como tarefa
    await ops.toggleItem({ id: p1Id, name: "x" }, items[0].id, false);
    eq((await partners.partnerHome(p1 as Extract<typeof p1, { kind: "partner" }>)).tasks.map((t) => t.itemId), [items[0].id], "painel do parceiro: tarefa atribuída");
    ok(!(await props.assignablePeople(e1.id)).some((x) => x.id === p1Id && !x.partner), "parceiro aparece marcado como parceiro nas atribuições");
    ok((await props.assignablePeople(e1.id)).some((x) => x.id === p1Id && x.partner), "parceiro com proposta e contribuir é atribuível");
    ok(!(await props.assignablePeople(e2.id)).some((x) => x.id === p1Id), "parceiro sem compartilhamento não é atribuível");

    // Radar completo
    const p2inv = await partners.invitePartner({ id: staffRow.id, name: staffRow.name }, { name: "QA App Parceiro Dois", email: P2, radarCompleto: false }, origin);
    if (!("ok" in p2inv)) throw new Error("convite 2 falhou");
    const [pu2] = await db.select().from(schema.users).where(deq(schema.users.id, p2inv.partnerId));
    let p2 = (await authz.actorFromUser({ ...pu2, perms: PROFILES.parceiro_editais.perms }))!;
    eq(await authz.canSeeEdital(p2, e3.id), false, "parceiro 2 sem Radar completo: não vê");
    await partners.setRadarCompleto(p2inv.partnerId, true);
    p2 = (await authz.actorFromUser({ ...pu2, perms: PROFILES.parceiro_editais.perms }))!;
    eq(await authz.canSeeEdital(p2, e3.id), true, "Radar completo libera ver o edital");
    eq(await authz.canSeeProposta(p2, e1.id), false, "Radar completo NÃO libera proposta");
    eq(await authz.canContribute(p2, e3.id), false, "Radar completo NÃO libera contribuir");
    const l2 = await radar.radarList(p2, { ...f, q: "QA-TEST-APP" });
    eq(l2.rows.length, 3, "Radar completo: vê os 3 no Radar");
    ok(l2.rows.every((r) => r.notes === null && r.ownerId === null && r.dealId === null), "Radar completo: ainda sem dados internos");
    eq((await props.boardData(p2)).cards.length, 0, "Radar completo: quadro de propostas continua vazio");
    ok("error" in (await collab.addComment(p2, { editalId: e3.id, body: "oi" })), "Radar completo: comentar é negado");
    await partners.setRadarCompleto(p2inv.partnerId, false);
    p2 = (await authz.actorFromUser({ ...pu2, perms: PROFILES.parceiro_editais.perms }))!;
    eq(await authz.canSeeEdital(p2, e3.id), false, "desligar o Radar completo devolve a restrição");

    // descompartilhar derruba o acesso e solta as tarefas
    const un = await partners.unshare({ id: staffRow.id, name: staffRow.name }, e1.id, p1Id);
    ok("ok" in un, "descompartilhar");
    eq(await authz.canSeeEdital(p1, e1.id), false, "sem compartilhamento, sem acesso");
    const [freed] = await db.select().from(schema.propostaItems).where(deq(schema.propostaItems.id, items[0].id));
    eq(freed.assigneeId, null, "descompartilhar solta o item atribuído ao parceiro");
    // atualizar compartilhamento
    await partners.shareEditais({ id: staffRow.id, name: staffRow.name }, { editalIds: [e1.id, e2.id], partnerIds: [p1Id], role: "ver", scope: "proposta", showDocs: true, showSheet: true });
    const sharesNow = await partners.sharesOfPartner(p1Id);
    eq(sharesNow.map((s) => [s.role, s.scope, s.showDocs, s.showSheet]), [["ver", "proposta", true, true], ["ver", "proposta", true, true]], "compartilhar em lote (2 editais)");
    const sid = sharesNow[0].id;
    await partners.updateShare(sid, { scope: "edital" });
    const after = (await partners.sharesOfPartner(p1Id)).find((s) => s.id === sid)!;
    eq([after.scope, after.showDocs, after.showSheet], ["edital", false, false], "voltar para “só o edital” apaga documentos e planilha do compartilhamento");
    ok("error" in (await partners.shareEditais({ id: staffRow.id, name: "x" }, { editalIds: [], partnerIds: [p1Id], role: "ver", scope: "edital" })), "compartilhar sem edital é recusado");
    ok("error" in (await partners.shareEditais({ id: staffRow.id, name: "x" }, { editalIds: [e1.id], partnerIds: [staffRow.id], role: "ver", scope: "edital" })), "só dá para compartilhar com parceiro (nunca com a equipe)");

    // revogar: a conta cai na hora
    const [before] = await db.select().from(schema.users).where(deq(schema.users.id, p1Id));
    const rv = await partners.revokePartner(p1Id);
    ok("ok" in rv, "revogar");
    const [aft] = await db.select().from(schema.users).where(deq(schema.users.id, p1Id));
    eq([aft.active, aft.sessionVersion > before.sessionVersion], [false, true], "revogado: conta desativada e sessões derrubadas");
    eq((await partners.getPartner(p1Id))?.state, "revogado", "estado: revogado");
    eq(await authz.actorFromUser({ ...aft, perms: PROFILES.parceiro_editais.perms }), null, "revogado: não vira ator (sem acesso ao app)");
    const [row] = await db.select().from(schema.editalPartners).where(deq(schema.editalPartners.userId, p1Id));
    ok(row.revokedAt, "revokedAt gravado");
    ok("error" in (await partners.resendInvite({ id: staffRow.id, name: "x" }, p1Id, origin)), "revogado não recebe reenvio");
    // mesmo com a conta ativa, revogado no perfil não entra
    await db.update(schema.users).set({ active: true }).where(deq(schema.users.id, p1Id));
    eq(await authz.actorFromUser({ ...aft, active: true, perms: PROFILES.parceiro_editais.perms }), null, "revogação vale mesmo se a conta voltar a ficar ativa");
    const rx = await partners.reactivatePartner({ id: staffRow.id, name: staffRow.name }, p1Id, origin);
    ok("ok" in rx && rx.pack.tempPassword, "reativar gera nova senha provisória");
    eq((await partners.getPartner(p1Id))?.state, "aceito", "reativado: volta a “aceito” (já tinha entrado)");
    const [u3] = await db.select().from(schema.users).where(deq(schema.users.id, p1Id));
    eq((await authz.actorFromUser({ ...u3, perms: PROFILES.parceiro_editais.perms }))?.kind, "partner", "reativado: volta a ser ator");

    // parceiro comercial antigo e equipe sem módulo
    const [old] = await db
      .insert(schema.users)
      .values({ name: "QA App Comercial Antigo", email: "qa-app-antigo@example.test", passwordHash: hashPassword(crypto.randomBytes(9).toString("base64url")), role: "parceiro", profile: "parceiro", ownOnly: true, calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning();
    eq(await authz.actorFromUser({ ...old, perms: PROFILES.parceiro.perms }), null, "parceiro comercial antigo NÃO entra no app Editais");
    const [gest] = await db
      .insert(schema.users)
      .values({ name: "QA App Financeiro", email: "qa-app-fin@example.test", passwordHash: hashPassword(crypto.randomBytes(9).toString("base64url")), role: "equipe", profile: "financeiro", calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning();
    eq(await authz.actorFromUser({ ...gest, perms: PROFILES.financeiro.perms }), null, "equipe sem o módulo Editais não entra");
    eq((await authz.actorFromUser({ ...gest, perms: { ...PROFILES.financeiro.perms, editais: "view" } }))?.kind, "staff", "equipe com “ver” entra");
    // abas: contagens vindas do banco
    const lsAll = await radar.radarList(staff, { ...fS, rel: 0, situacao: "todos", q: "QA-TEST-APP" });
    ok(lsAll.counts.novos >= 2 && lsAll.counts.todos >= 3, "contagens do Radar vêm do banco");
    // checkEdital (helper para actions)
    ok("error" in (await authz.checkEdital(p1, e3.id)), "checkEdital: negado devolve erro");
    ok("ok" in (await authz.checkEdital(staff, e3.id)), "checkEdital: equipe passa");
    ok("error" in (await authz.checkEdital(p1, e3.id, "staff")), "checkEdital: parceiro nunca passa em “staff”");
  } finally {
    await cleanup();
    const left = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "qa-app-%@example.test"));
    eq(left.length, 0, "limpeza: nenhuma conta de teste sobrou");
  }
}

async function main() {
  accessTests();
  tabsTests();
  radarFilterTests();
  inviteTests();
  await mailTests();
  wizardTests();
  collabTests();
  if (process.argv.includes("--db")) await dbTests();
  console.log(fail ? `\n${fail} de ${n} verificações falharam` : `\nTodas as ${n} verificações passaram${process.argv.includes("--db") ? " (com banco)" : ""}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
