/** Valor por extenso em português do Brasil: 150000 (centavos) → "mil e quinhentos reais". */
const UN = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CT[c]);
  if (r) {
    if (r < 20) parts.push(UN[r]);
    else parts.push(DZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ""));
  }
  return parts.join(" e ");
}

const ESCALAS: [string, string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

export function numeroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const grupos: number[] = [];
  while (n > 0) {
    grupos.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const partes: { txt: string; g: number; i: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt: string;
    if (i === 1) txt = g === 1 ? "mil" : `${ate999(g)} mil`;
    else if (i >= 2) txt = `${ate999(g)} ${g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]}`;
    else txt = ate999(g);
    partes.push({ txt, g, i });
  }
  // "e" entre grupos quando o último grupo é < 100 ou múltiplo exato de 100; senão vírgula/espaço
  let out = partes[0].txt;
  for (let k = 1; k < partes.length; k++) {
    const p = partes[k];
    const ultimo = k === partes.length - 1;
    out += (ultimo && (p.g < 100 || p.g % 100 === 0) ? " e " : " ") + p.txt;
  }
  return out;
}

export function reaisPorExtenso(cents: number): string {
  const total = Math.round(Math.abs(cents));
  const reais = Math.floor(total / 100);
  const cent = total % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const e = numeroPorExtenso(reais);
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${e}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cent > 0) partes.push(`${numeroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}
