/** Utilidades de texto para a importação de contatos (puras). */

/** Decodifica bytes de um arquivo de texto: UTF-8 (com/sem BOM), UTF-16 (BOM) ou, se inválido, Windows-1252/Latin-1. */
export function decodeBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const SMALL = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "van", "von", "la", "el"]);
// títulos e abreviações que não devem ser "consertados"
const KEEP = /^(pe\.?|pr\.?|dr\.?|dra\.?|mons\.?|d\.|frei|fr\.?|ir\.?|sr\.?|sra\.?|srta\.?|prof\.?|profa\.?|eng\.?|arq\.?|me\.?|ltda\.?|s\/a|epp|mei|me|ong|cnpj|cpf|ii|iii|iv|vi|vii|viii|ix|xi|xii)$/i;

const titleWord = (w: string, first: boolean) => {
  const lower = w.toLowerCase();
  if (KEEP.test(w)) {
    if (/^(ltda\.?|s\/a|epp|mei|ong|cnpj|cpf|ii|iii|iv|vi|vii|viii|ix|xi|xii)$/i.test(w)) return w.toUpperCase().replace("LTDA", "Ltda");
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  if (!first && SMALL.has(lower)) return lower;
  return lower.replace(/(^|[-'’])(\p{L})/gu, (_m, p, ch: string) => p + ch.toUpperCase());
};

/**
 * Capitalização gentil: só mexe quando o nome está TODO EM MAIÚSCULAS ou todo em minúsculas.
 * Nomes já "misturados" (Pe. João, Maria da Silva, iPhone Pedro) ficam como estão. Remove espaços extras.
 */
export function tidyName(raw: string | null | undefined): string {
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (!letters) return s;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  if (!allUpper && !allLower) return s;
  if (allUpper && (letters.length <= 3 || (!s.includes(" ") && !/[aeiouáéíóúâêôãõàü]/i.test(s)))) return s; // siglas (ONG, CNBB, IPHAN)
  return s
    .split(" ")
    .map((w, i) => titleWord(w, i === 0))
    .join(" ");
}

export const tidyEmail = (raw: string | null | undefined): string | null => {
  const e = String(raw ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

export const clean = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
};
