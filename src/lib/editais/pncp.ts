/**
 * Coletor do PNCP (Portal Nacional de Contratações Públicas) — cobre União, estados e municípios. API aberta, sem chave.
 *
 * Duas portas de entrada:
 *  - BUSCA (`/api/search`): a busca textual do próprio portal (com radical das palavras). Rápida e direcionada:
 *    uma consulta por termo devolve só editais que citam o termo. É a fonte principal e a única usada na varredura rápida.
 *  - CONSULTA (`/api/consulta/v1/contratacoes/proposta`): lista TODAS as contratações com propostas abertas, por modalidade.
 *    Pesada (milhares de páginas), por isso só roda na varredura completa (GitHub Actions) — serve de rede de segurança.
 *
 * O PNCP é instável (429, 5xx, conexões derrubadas): toda chamada tem retry com espera crescente, respeita `Retry-After`
 * e um prazo (`deadline`) para caber no teto de 60s da Vercel. Sem dependências de servidor: roda em Node puro (tsx).
 */
import type { EditalInput, EditalSituation, Esfera } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 EstudioRestauraCRM/1.0";
const SEARCH = "https://pncp.gov.br/api/search/";
const CONSULTA = "https://pncp.gov.br/api/consulta/v1";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type HttpOpts = { deadline?: number; retries?: number; timeoutMs?: number; log?: (m: string) => void };

export class DeadlineError extends Error {
  constructor() {
    super("sem tempo (deadline)");
    this.name = "DeadlineError";
  }
}

/** O PNCP não respondeu (429/5xx/rede) depois de todas as tentativas. A coleta pára aqui e pode ser retomada depois. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Esperas (ms) entre tentativas: 429 (limite de requisições) pede pausas longas; 5xx/rede, curtas. */
const WAIT_429 = [2000, 6000, 15000, 40000, 90000];
const WAIT_OTHER = [900, 1800, 3600, 7200, 14400];

/**
 * GET JSON com retry/backoff e respeito a Retry-After. Devolve null quando não há dado (204/404/4xx);
 * lança HttpError se o PNCP segue instável depois das tentativas e DeadlineError se acabou o tempo.
 */
export async function getJson<T = unknown>(url: string, o: HttpOpts = {}): Promise<T | null> {
  const retries = o.retries ?? 5;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const left = (o.deadline ?? Infinity) - Date.now();
    if (left < 1500) throw new DeadlineError();
    let wait = WAIT_OTHER[Math.min(attempt, WAIT_OTHER.length - 1)];
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": UA },
        signal: AbortSignal.timeout(Math.min(o.timeoutMs ?? 20_000, Math.max(1500, left - 500))),
      });
      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          lastStatus = 502; // 200 com corpo que não é JSON (página de bloqueio do portal): tratar como instabilidade
          wait = WAIT_429[Math.min(attempt, WAIT_429.length - 1)];
          o.log?.(`PNCP devolveu página que não é JSON — tentativa ${attempt + 1}/${retries + 1}`);
        }
      } else if (res.status === 204 || res.status === 404) {
        return null;
      } else if (res.status === 429 || res.status >= 500) {
        lastStatus = res.status;
        wait = res.status === 429 ? WAIT_429[Math.min(attempt, WAIT_429.length - 1)] : wait;
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) wait = Math.max(wait, Math.min(ra, 120) * 1000);
        o.log?.(`PNCP ${res.status} — tentativa ${attempt + 1}/${retries + 1}, espera ${Math.round(wait / 1000)}s`);
      } else {
        o.log?.(`PNCP ${res.status} em ${url.slice(0, 120)}`);
        return null;
      }
    } catch (e) {
      if (e instanceof DeadlineError) throw e;
      lastStatus = 0;
      o.log?.(`PNCP sem resposta (${e instanceof Error ? e.name : "erro"}) — tentativa ${attempt + 1}/${retries + 1}`);
    }
    if (attempt < retries) {
      if ((o.deadline ?? Infinity) - Date.now() < wait + 1500) throw new DeadlineError();
      await sleep(wait);
    }
  }
  throw new HttpError(lastStatus === 429 ? "PNCP limitou as requisições (429)" : `PNCP instável (${lastStatus || "sem resposta"})`, lastStatus);
}

/* --------------------------------- normalização --------------------------------- */

/** "2026-11-10T09:30:00" (hora de Brasília, sem fuso) → ISO com fuso. */
export function brIso(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  const d = hasTz ? new Date(s) : new Date(`${m[1]}T${m[2] ?? "00:00"}:${m[3] ?? "00"}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const ESFERA: Record<string, Esfera> = { F: "federal", E: "estadual", M: "municipal", D: "distrital" };

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** tira o rótulo do portal de origem no começo do objeto: "[LICITANET] - ", "[Portal de Compras Públicas] - " */
export const stripPortalTag = (s: string) => s.replace(/^\s*\[[^\]]{2,40}\]\s*[-–:]?\s*/, "");

/** Abertura padrão dos objetos ("Contratação de empresa especializada para…"): sai do título para o que importa aparecer primeiro. */
const BOILERPLATE: RegExp[] = [
  /^(?:o )?objeto d[aeo] presente (?:instrumento|licita[cç][aã]o|edital|contrata[cç][aã]o|processo|certame)[^,:;]{0,50}?(?:é|consiste|constitui|visa)\s+(?:na |a |o )?/i,
  /^constitui (?:o )?objeto d[aeo] presente (?:licita[cç][aã]o|contrata[cç][aã]o|edital)\s+(?:a |o )?/i,
  /^\d+(?:\.\d+)*\.?\s+/,
  /^contrata[cç][aã]o (?:direta )?(?:de|da|do)\s+(?:empresa|pessoa jur[ií]dica|profissional|equipe)s?(?: especializad[ao]s?)?\s+(?:em|para|na|no)\s+(?:a |o |à )?(?:presta[cç][aã]o de servi[cç]os? (?:de |t[eé]cnicos? (?:especializados )?(?:de |em )?)?)?/i,
];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** título curto: primeira frase do objeto sem a abertura padrão, até 150 caracteres */
export function titleOf(object: string) {
  const t = object.replace(/\s+/g, " ").replace(/^["“”'\s]+/, "").trim();
  let u = t;
  for (const re of BOILERPLATE) {
    const m = u.replace(re, "");
    if (m.length >= 20) u = m;
  }
  const first = u.split(/(?<=[\p{L}\d)]{3}[.;:])\s/u)[0] ?? u;
  const s = first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
  return cap(s || t.slice(0, 150));
}

export function pncpUrl(cnpj: string | null | undefined, ano: unknown, seq: unknown) {
  if (!cnpj || !ano || !seq) return null;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(seq)}`;
}

function situationOf(nome: unknown, cancelado: unknown, closeAt: string | null, now = Date.now()): EditalSituation {
  const n = clean(nome).toLowerCase();
  if (cancelado === true || /revogad|anulad|cancelad|fracassad|deserta/.test(n)) return "cancelado";
  if (/suspens/.test(n)) return "suspenso";
  if (/homologad|encerrad|conclu/.test(n)) return "encerrado";
  if (closeAt && new Date(closeAt).getTime() < now) return "encerrado";
  return "aberto";
}

const cents = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v * 100) : null);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type Obj = Record<string, unknown>;

/** Item da BUSCA do portal → entrada normalizada. */
export function fromSearchItem(i: Obj, now = Date.now()): EditalInput | null {
  const id = clean(i.numero_controle_pncp);
  const object = stripPortalTag(clean(i.description ?? i.title));
  if (!id || object.length < 8) return null;
  const closeAt = brIso(i.data_fim_vigencia) ?? brIso(i.data_fim_recebimento_propostas);
  const m = String(i.item_url ?? "").match(/\/compras\/(\d+)\/(\d{4})\/(\d+)/);
  const [cnpj, ano, seq] = m ? [m[1], m[2], m[3]] : [clean(i.orgao_cnpj) || null, clean(i.ano) || null, clean(i.numero_sequencial) || null];
  const unit = clean(i.unidade_nome);
  const organ = clean(i.orgao_nome);
  return {
    externalId: id,
    source: "pncp-busca",
    object,
    organ: organ || unit,
    organCnpj: clean(i.orgao_cnpj) || null,
    unit: unit && unit.toLowerCase() !== organ.toLowerCase() ? unit : null,
    esfera: ESFERA[clean(i.esfera_id)] ?? null,
    uf: clean(i.uf).slice(0, 2).toUpperCase() || null,
    city: clean(i.municipio_nome) || null,
    ibge: clean(i.codigo_ibge) || null,
    modalidade: clean(i.modalidade_licitacao_nome) || null,
    modalidadeId: num(i.modalidade_licitacao_id),
    situation: situationOf(i.situacao_nome, i.cancelado, closeAt, now),
    valueCents: cents(i.valor_total_estimado),
    publishedAt: brIso(i.data_publicacao_pncp),
    openAt: brIso(i.data_inicio_vigencia) ?? brIso(i.data_inicio_recebimento_propostas),
    closeAt,
    url: pncpUrl(cnpj, ano, seq),
    sourceUrl: clean(i.link_sistema_origem) || null,
  };
}

/** Item da CONSULTA oficial → entrada normalizada. */
export function fromConsultaItem(i: Obj, now = Date.now()): EditalInput | null {
  const org = (i.orgaoEntidade ?? {}) as Obj;
  const un = (i.unidadeOrgao ?? {}) as Obj;
  const id = clean(i.numeroControlePNCP);
  const object = stripPortalTag(clean(i.objetoCompra));
  if (!id || object.length < 8) return null;
  const closeAt = brIso(i.dataEncerramentoProposta);
  const unit = clean(un.nomeUnidade);
  const organ = clean(org.razaoSocial);
  return {
    externalId: id,
    source: "pncp-consulta",
    object,
    organ: organ || unit,
    organCnpj: clean(org.cnpj) || null,
    unit: unit && unit.toLowerCase() !== organ.toLowerCase() ? unit : null,
    esfera: ESFERA[clean(org.esferaId)] ?? null,
    uf: clean(un.ufSigla).slice(0, 2).toUpperCase() || null,
    city: clean(un.municipioNome) || null,
    ibge: clean(un.codigoIbge) || null,
    modalidade: clean(i.modalidadeNome) || null,
    modalidadeId: num(i.modalidadeId),
    situation: situationOf(i.situacaoCompraNome, false, closeAt, now),
    valueCents: cents(i.valorTotalEstimado),
    publishedAt: brIso(i.dataPublicacaoPncp),
    openAt: brIso(i.dataAberturaProposta),
    closeAt,
    url: pncpUrl(clean(org.cnpj), i.anoCompra, i.sequencialCompra),
    sourceUrl: clean(i.linkSistemaOrigem) || null,
  };
}

/* ----------------------------------- coleta ----------------------------------- */

export type Page = { items: EditalInput[]; raw: number; total: number | null; page: number; last: boolean; error?: boolean };

/**
 * Páginas da BUSCA para um termo. `status` = "recebendo_proposta" (todos os abertos) ou "" (todos, do mais novo ao mais velho;
 * para quando passa de `cutoffMs` de data de publicação).
 */
export async function* searchPages(
  q: string,
  o: HttpOpts & { status: "recebendo_proposta" | ""; cutoffMs?: number; startPage?: number; maxPages?: number; pageSize?: number; throttleMs?: number },
): AsyncGenerator<Page> {
  const size = o.pageSize ?? 100;
  const max = o.maxPages ?? 8;
  for (let page = o.startPage ?? 1; page <= max; page++) {
    const u = new URL(SEARCH);
    u.searchParams.set("q", q);
    u.searchParams.set("tipos_documento", "edital");
    u.searchParams.set("ordenacao", "-data");
    u.searchParams.set("pagina", String(page));
    u.searchParams.set("tam_pagina", String(size));
    if (o.status) u.searchParams.set("status", o.status);
    let json: { items?: Obj[]; total?: number } | null;
    try {
      json = await getJson<{ items?: Obj[]; total?: number }>(u.toString(), o);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      o.log?.(`busca “${q}” página ${page}: ${e.message}`);
      yield { items: [], raw: 0, total: null, page, last: true, error: true };
      return;
    }
    const raw = json?.items ?? [];
    let stop = raw.length < size;
    const items: EditalInput[] = [];
    for (const r of raw) {
      const pub = brIso(r.data_publicacao_pncp);
      if (o.cutoffMs && pub && new Date(pub).getTime() < o.cutoffMs) {
        stop = true; // ordenado do mais novo ao mais velho: daqui para a frente é tudo antigo
        continue;
      }
      const it = fromSearchItem(r);
      if (it) items.push(it);
    }
    if (json === null) stop = true;
    yield { items, raw: raw.length, total: json?.total ?? null, page, last: stop };
    if (stop) return;
    await sleep(o.throttleMs ?? 350);
  }
}

/** Modalidades varridas na consulta oficial: 3 concurso · 4/5 concorrência · 6/7 pregão · 8 dispensa · 9 inexigibilidade · 12 credenciamento */
export const CONSULTA_MODALIDADES = [4, 5, 6, 7, 8, 9, 3, 12];

/** Páginas da CONSULTA oficial (contratações com propostas abertas). Máx. 50 por página. */
export async function* consultaPages(modalidade: number, o: HttpOpts & { startPage?: number; throttleMs?: number; until?: string }): AsyncGenerator<Page> {
  const until = o.until ?? new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
  let total = Infinity;
  for (let page = o.startPage ?? 1; page <= total; page++) {
    const u = `${CONSULTA}/contratacoes/proposta?dataFinal=${until}&codigoModalidadeContratacao=${modalidade}&pagina=${page}&tamanhoPagina=50`;
    const json = await getJson<{ data?: Obj[]; totalPaginas?: number }>(u, o);
    if (!json) return;
    total = json.totalPaginas ?? 1;
    const raw = json.data ?? [];
    const items = raw.map((r) => fromConsultaItem(r)).filter((x): x is EditalInput => !!x);
    yield { items, raw: raw.length, total, page, last: page >= total };
    if (page >= total) return;
    await sleep(o.throttleMs ?? 1500);
  }
}
