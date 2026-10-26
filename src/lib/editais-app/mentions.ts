/**
 * Menções simples (puro): "@Maria Silva" no texto vira aviso para a pessoa.
 * Casa pelo nome COMPLETO exato (sem diferenciar maiúsculas/acentos); o nome mais longo ganha.
 */

export type Mentionable = { id: string; name: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function findMentions(body: string, people: Mentionable[]): string[] {
  const text = fold(body);
  const sorted = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const out = new Set<string>();
  const consumed: [number, number][] = [];
  for (const p of sorted) {
    const needle = `@${fold(p.name.trim())}`;
    let from = 0;
    for (;;) {
      const i = text.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      const boundary = end >= text.length || !/[\p{L}\p{N}]/u.test(text[end]);
      const overlaps = consumed.some(([a, b]) => i < b && end > a);
      if (boundary && !overlaps) {
        out.add(p.id);
        consumed.push([i, end]);
      }
      from = end;
    }
  }
  return [...out];
}

/** Texto do comentário com as menções destacadas (para a tela): devolve pedaços {text, mention}. */
export function splitMentions(body: string, people: Mentionable[]): { text: string; mention: boolean }[] {
  const text = fold(body);
  const spans: [number, number][] = [];
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const needle = `@${fold(p.name.trim())}`;
    let from = 0;
    for (;;) {
      const i = text.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      if ((end >= text.length || !/[\p{L}\p{N}]/u.test(text[end])) && !spans.some(([a, b]) => i < b && end > a)) spans.push([i, end]);
      from = end;
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: { text: string; mention: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of spans) {
    if (a > pos) out.push({ text: body.slice(pos, a), mention: false });
    out.push({ text: body.slice(a, b), mention: true });
    pos = b;
  }
  if (pos < body.length) out.push({ text: body.slice(pos), mention: false });
  return out.length ? out : [{ text: body, mention: false }];
}
