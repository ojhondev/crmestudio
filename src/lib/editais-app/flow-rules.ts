/**
 * Regras dos assistentes (puro, testável): validações por passo, escolhas da habilitação e conta do preço.
 * Os componentes só desenham; as regras de negócio continuam nas server actions e em lib/propostas.
 */
import { validityOf } from "@/lib/propostas/cofre";
import type { CofreLite, MatrixRow } from "@/lib/propostas/cofre";
import { diffDaysISO } from "@/lib/propostas/dates";
import { COFRE_LABEL } from "@/lib/propostas/types";

export const validUrlOrEmpty = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? null : "O link precisa começar com https://";
  } catch {
    return "O link precisa começar com https:// (cole o endereço completo).";
  }
};

export const required = (v: string | null | undefined, msg: string): string | null => (v && v.trim() ? null : msg);

/* ------------------------------ Vou participar ------------------------------ */

export type ParticiparValues = { confirmed: boolean; tipo: string; templateKey: string; sessionAt: string; ownerId: string; partnerIds: string[]; partnerRole: "ver" | "contribuir" };

export const participarRules = {
  confirmar: (v: ParticiparValues) => (v.confirmed ? null : "Confirme que este é o edital."),
  tipo: (v: ParticiparValues) => required(v.tipo, "Escolha o tipo de licitação."),
  data: (v: ParticiparValues, hasPortalDeadline: boolean) => {
    if (!v.sessionAt) return hasPortalDeadline ? null : "Informe a data limite: sem ela os prazos do checklist não são calculados.";
    return Number.isNaN(Date.parse(v.sessionAt)) ? "Data inválida." : null;
  },
  responsavel: (v: ParticiparValues) => required(v.ownerId, "Escolha quem responde por esta proposta."),
  modelo: (v: ParticiparValues) => required(v.templateKey, "Escolha um modelo de checklist."),
};

/* ------------------------------ Habilitação ------------------------------ */

export type HabChoice = { value: string; label: string; hint?: string; badge?: string; tone?: "bad" | "warn" | "good" };

/** Opções de resposta para UMA exigência da matriz: documentos do cofre do tipo (melhor primeiro) + as saídas. */
export function habilitacaoChoices(row: MatrixRow, docs: CofreLite[], sessionDay: string | null, today: string): HabChoice[] {
  const same = docs.filter((d) => row.req.cofreType && d.type === row.req.cofreType);
  const far = "9999-12-31";
  const sorted = [...same].sort((a, b) => (b.validUntil ?? far).localeCompare(a.validUntil ?? far));
  const out: HabChoice[] = sorted.map((d) => {
    const val = validityOf(d.validUntil, today);
    const beforeSession = !!d.validUntil && !!sessionDay && d.validUntil < sessionDay;
    const bad = val.status === "vencido";
    const hint = d.validUntil ? `Validade ${d.validUntil.split("-").reverse().join("/")}${d.number ? ` · nº ${d.number}` : ""}` : d.number ? `nº ${d.number}` : "Sem data de validade";
    return {
      value: `doc:${d.id}`,
      label: `Usar: ${d.title}`,
      hint: beforeSession && !bad ? `${hint} — vence ${diffDaysISO(d.validUntil as string, sessionDay as string)} dia(s) antes da sessão` : hint,
      badge: bad ? "Vencido" : beforeSession ? "Vence antes da sessão" : val.status === "vence_30" ? "Vence em breve" : "Em dia",
      tone: bad ? "bad" : beforeSession || val.status === "vence_30" ? "warn" : "good",
    };
  });
  out.push({ value: "ok_manual", label: "Atendida por outro meio", hint: "Ex.: já anexada pelo órgão, ou comprovada de outra forma." });
  out.push({ value: "na", label: "Não se aplica a este edital" });
  out.push({ value: "falta", label: "Falta — criar uma tarefa para providenciar", hint: "Entra no checklist da habilitação com prazo." });
  return out;
}

/** Resposta inicial sugerida: o que já está marcado; senão o documento em dia; senão "falta". */
export function habilitacaoDefault(row: MatrixRow): string {
  if (row.req.mode === "na") return "na";
  if (row.req.mode === "ok_manual") return "ok_manual";
  if (row.situation === "ok" && row.doc) return `doc:${row.doc.id}`;
  if (row.situation === "faltando") return "falta";
  return ""; // vencido / vence antes: obriga a decidir
}

export type HabDecision = { kind: "doc"; docId: string } | { kind: "ok_manual" } | { kind: "na" } | { kind: "falta" };
export function parseHabChoice(v: string): HabDecision | null {
  if (v === "ok_manual" || v === "na" || v === "falta") return { kind: v };
  if (v.startsWith("doc:") && /^[0-9a-f-]{36}$/i.test(v.slice(4))) return { kind: "doc", docId: v.slice(4) };
  return null;
}

export function habilitacaoSummary(decisions: Record<string, string>) {
  let ok = 0;
  let falta = 0;
  let na = 0;
  for (const c of Object.values(decisions)) {
    const d = parseHabChoice(c);
    if (!d) continue;
    if (d.kind === "falta") falta++;
    else if (d.kind === "na") na++;
    else ok++;
  }
  return { ok, falta, na };
}

/* ------------------------------ Proposta técnica ------------------------------ */

export const tecnicaRules = {
  compreensao: (s: string) => required(s, "Escreva em poucas linhas como vocês entendem o objeto."),
  metodologia: (s: string) => (s.trim().length >= 40 ? null : "Descreva a metodologia com um pouco mais de detalhe (pelo menos uma ou duas frases)."),
};

export const METODOLOGIA_ROTEIRO = [
  "1. Levantamento e documentação fotográfica do estado atual.",
  "2. Prospecção estratigráfica e análises para definir os procedimentos.",
  "3. Limpeza, consolidação e tratamento dos suportes.",
  "4. Reintegração e acabamento, com materiais reversíveis e compatíveis.",
  "5. Registro final, relatório técnico e recomendações de conservação.",
];

/* ------------------------------ Proposta de preço ------------------------------ */

export type PriceItem = { desc: string; unit: string; qty: string; material: string; labor: string };
export const emptyPriceItem = (): PriceItem => ({ desc: "", unit: "m²", qty: "", material: "", labor: "" });

export const num = (s: string): number => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};

/** Itens preenchidos (descrição + quantidade) em número. */
export function cleanPriceItems(items: PriceItem[]) {
  return items
    .filter((i) => i.desc.trim() && num(i.qty) > 0)
    .slice(0, 40)
    .map((i) => ({ desc: i.desc.trim().slice(0, 200), unit: i.unit.trim().slice(0, 10) || "un", qty: num(i.qty), material: Math.max(0, num(i.material)), labor: Math.max(0, num(i.labor)) }));
}

/** Preço global estimado pelos itens: custo = qtd × (material + mão de obra × (1+encargos)); preço = custo × (1+BDI). Em reais. */
export function priceFromItems(items: PriceItem[], bdiPercent: number, encargosPercent = 0) {
  const clean = cleanPriceItems(items);
  const direct = clean.reduce((s, i) => s + i.qty * (i.material + i.labor * (1 + encargosPercent / 100)), 0);
  const bdi = direct * (Math.max(0, bdiPercent) / 100);
  return { direct: round2(direct), bdi: round2(bdi), total: round2(direct + bdi), count: clean.length };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export const precoRules = {
  bdi: (s: string) => {
    const n = num(s);
    return /^[0-9]+([.,][0-9]+)?$/.test(s.trim()) && n >= 0 && n <= 100 ? null : "Informe o BDI em % (entre 0 e 100).";
  },
  prazo: (s: string) => required(s, "Informe o prazo de execução (ex.: 180 dias corridos)."),
  validade: (s: string) => {
    const n = Number(s);
    return Number.isInteger(n) && n >= 1 && n <= 730 ? null : "Informe a validade em dias (1 a 730).";
  },
};

/* ------------------------------ Revisão e envio ------------------------------ */

export const CONFERENCIA_PADRAO = [
  "Conferi o objeto, as quantidades e os valores contra o edital, item por item.",
  "Todos os documentos de habilitação estão em dia na data da sessão.",
  "As declarações foram assinadas por quem tem poderes.",
  "Os nomes dos arquivos e o formato seguem o que o edital pede.",
  "Outra pessoa da equipe fez a segunda leitura.",
];

export const envioRules = {
  conferencia: (checked: number, total: number) => (checked >= total ? null : "Marque todos os itens da conferência antes de enviar."),
  link: (s: string) => validUrlOrEmpty(s),
  quando: (s: string) => (s && !Number.isNaN(Date.parse(s)) ? null : "Informe a data e a hora do envio."),
};

/* ------------------------------ Resultado ------------------------------ */

export const RESULT_OPTIONS = [
  { value: "ganhou", label: "Ganhamos", hint: "A proposta foi a vencedora." },
  { value: "perdeu", label: "Perdemos", hint: "Outra empresa venceu." },
  { value: "desclassificada", label: "Fomos desclassificados", hint: "Problema de documentação ou de proposta." },
  { value: "desistiu", label: "Desistimos", hint: "Decidimos não seguir." },
] as const;

export const resultadoRules = {
  status: (s: string) => required(s, "Escolha o resultado."),
  motivo: (status: string, reason: string) => (["perdeu", "desclassificada", "desistiu"].includes(status) ? required(reason, "Escolha o motivo: ele vira aprendizado para as próximas propostas.") : null),
  valor: (s: string) => (s.trim() && num(s) < 0 ? "Valor inválido." : null),
};

/* ------------------------------ Cofre e obra ------------------------------ */

export const cofreRules = {
  tipo: (t: string) => (t in COFRE_LABEL ? null : "Escolha o tipo do documento."),
  titulo: (s: string) => required(s, "Dê um nome ao documento."),
  datas: (emitido: string, validade: string) => (emitido && validade && validade < emitido ? "A validade não pode ser antes da emissão." : null),
};

export const obraRules = {
  titulo: (s: string) => required(s, "Dê um título à obra ou ao projeto."),
  ano: (s: string) => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isInteger(n) && n >= 1950 && n <= new Date().getFullYear() + 1 ? null : "Ano inválido.";
  },
};

/* ------------------------------ Convite de parceiro ------------------------------ */

export const parceiroRules = {
  nome: (s: string) => required(s, "Informe o nome do parceiro."),
  email: (s: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) ? null : "Informe um e-mail válido."),
};
