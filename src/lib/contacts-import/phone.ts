/**
 * Normalização de telefones para o formato do CRM (E.164 sem "+", ex.: 5511999990000, igual ao wa_id).
 * Puro (sem server-only): roda no navegador e no servidor.
 */
export type PhoneKind = "celular" | "fixo" | "internacional" | "invalido";
export type PhoneInfo = { e164: string | null; kind: PhoneKind; reason?: string };

const validDdd = (ddd: string) => /^[1-9][1-9]$/.test(ddd);

/** Resultado de um número nacional (DDD + 8 ou 9 dígitos), já sem 55. */
function national(d: string): PhoneInfo {
  if (d.length === 11) {
    if (!validDdd(d.slice(0, 2))) return { e164: null, kind: "invalido", reason: "DDD inválido" };
    if (d[2] !== "9") return { e164: null, kind: "invalido", reason: "celular sem o 9 na frente" };
    return { e164: "55" + d, kind: "celular" };
  }
  if (d.length === 10) {
    const ddd = d.slice(0, 2);
    if (!validDdd(ddd)) return { e164: null, kind: "invalido", reason: "DDD inválido" };
    const first = d[2];
    if (/[6-9]/.test(first)) return { e164: `55${ddd}9${d.slice(2)}`, kind: "celular" }; // celular antigo, sem o 9º dígito
    if (/[2-5]/.test(first)) return { e164: "55" + d, kind: "fixo" };
    return { e164: null, kind: "invalido", reason: "número inválido" };
  }
  return { e164: null, kind: "invalido", reason: d.length < 10 ? "sem DDD ou incompleto" : "tamanho inválido" };
}

export function parsePhone(raw: string | null | undefined): PhoneInfo {
  const s = String(raw ?? "").trim();
  if (!s) return { e164: null, kind: "invalido", reason: "vazio" };
  // ramal ("x123", "ramal 12") não faz parte do número
  const clean = s.replace(/\s*(ramal|ext\.?|x)\s*\d+\s*$/i, "");
  const plus = /^\s*(\+|00)/.test(clean);
  let d = clean.replace(/\D/g, "");
  if (!d) return { e164: null, kind: "invalido", reason: "sem dígitos" };
  if (/^00/.test(clean.trim())) d = d.slice(2);
  if (/^\d+$/.test(d) && new Set(d).size === 1) return { e164: null, kind: "invalido", reason: "número repetido" };

  if (plus) {
    if (d.startsWith("55")) return d.length >= 12 && d.length <= 13 ? national(d.slice(2)) : { e164: null, kind: "invalido", reason: "tamanho inválido" };
    return d.length >= 8 && d.length <= 15 ? { e164: d, kind: "internacional" } : { e164: null, kind: "invalido", reason: "tamanho inválido" };
  }
  // zero de operadora/tronco: 011 99999-0000, 0 15 11 99999-0000
  if (d.startsWith("0")) {
    const t = d.replace(/^0+/, "");
    if (t.length === 10 || t.length === 11) d = t;
    else if (t.length === 12 || t.length === 13) d = t.slice(2); // código de operadora (2 dígitos)
    else if (t.startsWith("55") && (t.length === 12 || t.length === 13)) d = t;
  }
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return national(d.slice(2));
  if (d.length === 10 || d.length === 11) return national(d);
  if (d.length >= 12 && d.length <= 15) return { e164: d, kind: "internacional" }; // outro país sem "+"
  return { e164: null, kind: "invalido", reason: d.length < 10 ? "sem DDD ou incompleto" : "tamanho inválido" };
}

/** Chave de comparação: celulares com e sem o 9º dígito viram a mesma chave. */
export function phoneKey(p: string | null | undefined): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `br${d.slice(2, 4)}${d.slice(-8)}`;
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) return `br${d.slice(0, 2)}${d.slice(-8)}`;
  return d;
}

/** Escolhe o melhor número da lista: celular BR > fixo BR > internacional. Devolve também os demais (válidos, distintos). */
export function pickPhones(raws: string[]): { primary: PhoneInfo | null; extras: string[]; invalid: string[] } {
  const infos = raws.map((r) => ({ r, i: parsePhone(r) }));
  const rank: Record<PhoneKind, number> = { celular: 0, fixo: 1, internacional: 2, invalido: 3 };
  const valid = infos.filter((x) => x.i.e164).sort((a, b) => rank[a.i.kind] - rank[b.i.kind]);
  const seen = new Set<string>();
  const uniq = valid.filter((x) => {
    const k = phoneKey(x.i.e164)!;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    primary: uniq[0]?.i ?? null,
    extras: uniq.slice(1).map((x) => x.i.e164!),
    invalid: infos.filter((x) => !x.i.e164 && x.r.trim()).map((x) => x.r.trim()),
  };
}
