import type { RawContact } from "./types";

/**
 * Leitor de vCard (.vcf) 2.1 / 3.0 / 4.0, tolerante: linhas dobradas, quoted-printable (com quebra "="),
 * charset UTF-8 ou ISO-8859-1, grupos (item1.TEL), vários TEL/EMAIL, FN/N/ORG/TITLE/ADR/NOTE. FOTO é ignorada.
 */

function unfold(text: string): string[] {
  const raw = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^[ \t]/.test(line) && line.trim() !== "") {
      out[out.length - 1] = prev + line.slice(1); // continuação (vCard 3/4 e 2.1)
    } else if (prev !== undefined && /^[^:]*QUOTED-PRINTABLE/i.test(prev) && prev.endsWith("=")) {
      out[out.length - 1] = prev.slice(0, -1) + line; // quebra suave do quoted-printable
    } else out.push(line);
  }
  return out;
}

function decodeQp(value: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (value.charCodeAt(i) < 128) bytes.push(value.charCodeAt(i));
    else bytes.push(...new TextEncoder().encode(c));
  }
  const cs = /8859-?1|latin-?1|1252/i.test(charset) ? "windows-1252" : "utf-8";
  try {
    return new TextDecoder(cs, { fatal: cs === "utf-8" }).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("windows-1252").decode(new Uint8Array(bytes)); // UTF-8 inválido: tenta Latin-1
  }
}

const unescape = (s: string) => s.replace(/\\([nN,;\\:])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));

/** divide por `sep` respeitando o escape com barra invertida */
function splitEsc(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      cur += s[i] + s[i + 1];
      i++;
    } else if (s[i] === sep) {
      out.push(cur);
      cur = "";
    } else cur += s[i];
  }
  out.push(cur);
  return out;
}

type Prop = { name: string; params: Record<string, string[]>; value: string };

function parseLine(line: string): Prop | null {
  const idx = line.indexOf(":");
  if (idx < 1) return null;
  const head = line.slice(0, idx);
  let value = line.slice(idx + 1);
  const parts = head.split(";");
  let name = parts[0].toUpperCase();
  if (name.includes(".")) name = name.split(".").pop()!; // grupo: item1.TEL
  const params: Record<string, string[]> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    const k = (eq < 0 ? "TYPE" : p.slice(0, eq)).toUpperCase();
    const v = (eq < 0 ? p : p.slice(eq + 1)).replace(/^"|"$/g, "");
    (params[k] ??= []).push(...v.split(",").map((x) => x.trim()));
  }
  const enc = (params.ENCODING ?? []).join(",").toUpperCase();
  const charset = (params.CHARSET ?? ["utf-8"])[0];
  if (enc.includes("QUOTED-PRINTABLE")) value = decodeQp(value, charset);
  return { name, params, value };
}

export function parseVcf(text: string): RawContact[] {
  const lines = unfold(text);
  const out: RawContact[] = [];
  let cur: RawContact | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const up = line.slice(0, 16).toUpperCase();
    if (up.startsWith("BEGIN:VCARD")) {
      cur = { phones: [], emails: [] };
      continue;
    }
    if (up.startsWith("END:VCARD")) {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    const label = () => (p.params.TYPE ?? []).filter((x) => !/^(pref|voice|internet)$/i.test(x))[0]?.toLowerCase();
    switch (p.name) {
      case "FN":
        cur.name = unescape(p.value).trim();
        break;
      case "N": {
        const [family = "", given = "", additional = "", prefix = "", suffix = ""] = splitEsc(p.value, ";").map((x) => unescape(x).trim());
        cur.familyName = family;
        cur.givenName = given;
        if (!cur.name) cur.name = [prefix, given, additional, family, suffix].filter(Boolean).join(" ").trim();
        break;
      }
      case "ORG": {
        const o = unescape(splitEsc(p.value, ";")[0] ?? "").trim();
        if (o) cur.company = o;
        break;
      }
      case "TITLE":
        if (p.value.trim()) cur.role = unescape(p.value).trim();
        break;
      case "TEL": {
        const v = unescape(p.value).trim().replace(/^tel:/i, "");
        if (v) cur.phones.push({ value: v, label: label() });
        break;
      }
      case "EMAIL":
        if (p.value.trim()) cur.emails.push(unescape(p.value).trim());
        break;
      case "ADR": {
        const f = splitEsc(p.value, ";").map((x) => unescape(x).trim());
        const [, , street = "", city = "", region = "", zip = "", country = ""] = f;
        if (!cur.address) cur.address = [street, zip, country && !/^(brasil|brazil|br)$/i.test(country) ? country : ""].filter(Boolean).join(", ") || undefined;
        if (city && !cur.city) cur.city = city;
        if (region && !cur.state) cur.state = region;
        break;
      }
      case "NOTE":
        if (p.value.trim()) cur.notes = unescape(p.value).trim();
        break;
      case "UID":
        if (p.value.trim()) cur.externalId = p.value.trim();
        break;
      case "X-ABSHOWAS":
        if (/company/i.test(p.value)) cur.isOrg = true;
        break;
      default:
        break; // PHOTO, LOGO, REV, PRODID e X-… são ignorados
    }
  }
  return out;
}

/** O texto parece um vCard? */
export const looksLikeVcf = (text: string) => /BEGIN:VCARD/i.test(text.slice(0, 4000));
