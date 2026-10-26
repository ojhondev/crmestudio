/**
 * Banco de atestados: busca e sugestão por aderência ao objeto do edital (puro).
 * Sem IA: casamos tipo, etiquetas (técnicas/bens) e palavras-chave. Mostramos por que cada item subiu na lista.
 */

export type PortfolioLite = {
  id: string;
  title: string;
  client: string | null;
  year: number | null;
  valueCents: number | null;
  kind: string;
  tags: string[];
  tombamento: string | null;
  responsible: string | null;
  description: string | null;
};

export type EditalLite = { title: string; object: string; kind: string };

/** minúsculas, sem acento, só letras e números */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set([
  "para", "como", "pela", "pelo", "pelos", "pelas", "este", "esta", "essa", "esse", "seus", "suas", "sendo", "com", "dos", "das", "que", "uma", "uns", "umas", "entre", "sobre", "ate", "apos", "bem", "mais", "menos", "todo", "toda", "todos", "todas", "contratacao", "empresa", "especializada", "servicos", "servico", "execucao", "objeto", "municipio", "prefeitura", "projeto", "obra", "obras", "realizacao", "prestacao", "referente", "conforme", "edital", "licitacao", "estado", "municipal",
]);

/** radical grosseiro: tira o plural e usa os 6 primeiros caracteres (restauração ≈ restauro ≈ restaurar) */
export function stem(w: string): string {
  const t = w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
  return t.slice(0, 6);
}

export function tokens(s: string): string[] {
  const out = new Set<string>();
  for (const w of norm(s).split(" ")) if (w.length >= 4 && !STOP.has(w)) out.add(stem(w));
  return [...out];
}

/** sinônimos de técnicas e bens (chave = radical da etiqueta) */
const SYN: Record<string, string[]> = {
  forro: ["teto", "forros", "tabua", "estuque"],
  douram: ["ouro", "dourad", "folha de ouro", "policrom"],
  mural: ["afresco", "parede pintada", "pintura parietal", "pintura mural"],
  consol: ["estrutura", "estrutural", "reforco", "escoramento", "alvenaria", "taipa"],
  retabu: ["altar", "talha", "retablo"],
  talha: ["entalhe", "madeira", "retabulo"],
  vitrai: ["vitral", "vidro"],
  azulej: ["ceramica", "revestimento"],
  cobert: ["telhado", "telha", "madeiramento"],
  fachad: ["reboco", "pintura externa", "frontispicio"],
  esquad: ["janela", "porta", "carpintaria"],
};

export type Suggestion = { item: PortfolioLite; score: number; why: string[] };

const kindOk = (editalKind: string, itemKind: string) => {
  if (editalKind === itemKind) return true;
  if (editalKind === "projeto_execucao") return itemKind === "projeto" || itemKind === "execucao";
  if (itemKind === "outro") return false;
  return false;
};

/** Itens do portfólio ordenados por aderência ao edital (score 0 não aparece). */
export function suggestAtestados(edital: EditalLite, items: PortfolioLite[], opts: { currentYear?: number; limit?: number } = {}): Suggestion[] {
  const text = norm(`${edital.title} ${edital.object}`);
  const eTokens = new Set(tokens(`${edital.title} ${edital.object}`));
  const year = opts.currentYear ?? new Date().getFullYear();
  const out: Suggestion[] = [];
  for (const item of items) {
    let score = 0;
    const why: string[] = [];
    // etiquetas: frase inteira no objeto (forte) ou radicais / sinônimos
    for (const tag of item.tags) {
      const nt = norm(tag);
      if (!nt) continue;
      if (text.includes(nt)) {
        score += 10;
        why.push(tag);
        continue;
      }
      const tt = tokens(tag);
      const hit = tt.filter((t) => eTokens.has(t));
      const syn = tt.flatMap((t) => SYN[t] ?? []).filter((s) => text.includes(norm(s)));
      if (hit.length && hit.length === tt.length) {
        score += 8;
        why.push(tag);
      } else if (hit.length || syn.length) {
        score += 4;
        why.push(tag);
      }
    }
    // título e descrição do item
    const titleHits = tokens(item.title).filter((t) => eTokens.has(t));
    if (titleHits.length) {
      score += Math.min(6, titleHits.length * 2);
      why.push(`título: ${titleHits.length} termo(s) em comum`);
    }
    const descHits = tokens(item.description ?? "").filter((t) => eTokens.has(t));
    if (descHits.length) score += Math.min(4, descHits.length);
    if (kindOk(edital.kind, item.kind)) {
      score += 6;
      why.push("mesmo tipo de serviço");
    }
    if (item.tombamento && item.tombamento !== "nenhum" && /tomb|patrimonio|historic|iphan|monument/.test(text)) {
      score += 4;
      why.push("bem tombado");
    }
    if (score > 0 && item.year && year - item.year <= 5) score += 1;
    if (score > 0) out.push({ item, score, why: [...new Set(why)] });
  }
  return out.sort((a, b) => b.score - a.score || (b.item.year ?? 0) - (a.item.year ?? 0)).slice(0, opts.limit ?? 12);
}

/** Busca simples (todas as palavras em título, cliente, etiquetas ou descrição). */
export function searchPortfolio(items: PortfolioLite[], q: string, tag?: string): PortfolioLite[] {
  const words = norm(q).split(" ").filter(Boolean);
  const nt = tag ? norm(tag) : "";
  return items.filter((i) => {
    if (nt && !i.tags.some((t) => norm(t) === nt)) return false;
    if (!words.length) return true;
    const hay = norm([i.title, i.client, i.tags.join(" "), i.description, i.responsible, i.year].filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/** Texto pronto para a proposta técnica. */
export function atestadoText(i: PortfolioLite, money?: (cents: number) => string): string {
  const head = [i.title, i.client, i.year].filter(Boolean).join(" — ");
  const meta = [i.valueCents && money ? money(i.valueCents) : null, i.responsible ? `Resp. técnico: ${i.responsible}` : null].filter(Boolean).join(" · ");
  return [head, meta, i.description].filter(Boolean).join("\n");
}
