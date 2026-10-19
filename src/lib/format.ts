import { format, formatDistanceToNowStrict, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { tz } from "@date-fns/tz";

/**
 * Tudo é exibido no horário de Brasília, independente de onde o código roda
 * (o servidor da Vercel está em UTC). O Brasil não tem horário de verão desde 2019.
 */
export const TZ = "America/Sao_Paulo";
const inTZ = tz(TZ);
const opts = { locale: ptBR, in: inTZ };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (cents: number) => brl.format((cents || 0) / 100);

const brlInt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/** Sem centavos: para números grandes em cartões (cabe em telas estreitas). */
export const moneyInt = (cents: number) => brlInt.format(Math.round((cents || 0) / 100));

/** "R$ 28 mil", "R$ 1,2 mi" — formatado à mão: o `notation: "compact"` do Intl
 *  muda entre Node e navegador e quebra a hidratação. */
export function moneyShort(cents: number) {
  const v = (cents || 0) / 100;
  const one = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (Math.abs(v) >= 1e6) return `R$ ${one(v / 1e6)} mi`;
  if (Math.abs(v) >= 1e3) return `R$ ${one(v / 1e3)} mil`;
  return brl.format(v);
}

/** "1.234,56" | "1234.56" | "1234" → centavos */
export function parseMoney(input: FormDataEntryValue | null | undefined): number {
  const s = String(input ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const centsToInput = (cents: number) =>
  cents ? (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00-03:00" : d) : d);

export const fmtDate = (d: Date | string | null | undefined, pattern = "dd/MM/yyyy") => (d ? format(toDate(d), pattern, opts) : "—");

export const fmtDateTime = (d: Date | string | null | undefined) => fmtDate(d, "dd/MM 'às' HH:mm");
export const fmtTime = (d: Date | string) => format(toDate(d), "HH:mm", opts);

export const sameDayBR = (a: Date | string, b: Date | string) => isSameDay(toDate(a), toDate(b), { in: inTZ });

/** Rótulo curto estilo inbox: 14:32 · Ontem · 12/03 */
export function fmtRelativeShort(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = toDate(d);
  const now = new Date();
  if (sameDayBR(date, now)) return fmtTime(date);
  if (sameDayBR(date, new Date(now.getTime() - 864e5))) return "Ontem";
  return format(date, "dd/MM", opts);
}

export const fromNow = (d: Date | string) => formatDistanceToNowStrict(toDate(d), { locale: ptBR, addSuffix: true });

/** "YYYY-MM-DD" (data) no fuso de Brasília */
export const isoDateBR = (d: Date = new Date()) => format(d, "yyyy-MM-dd", { in: inTZ });
export const todayISO = () => isoDateBR();

/** Valor para <input type="datetime-local"> no fuso de Brasília. */
export const toLocalInput = (d: Date | string | null | undefined) => (d ? format(toDate(d), "yyyy-MM-dd'T'HH:mm", { in: inTZ }) : "");

/** Lê "YYYY-MM-DDTHH:mm" (datetime-local) ou "YYYY-MM-DD" como horário de Brasília. */
export function parseLocalInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00-03:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return new Date(`${s}:00-03:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normaliza telefone BR para o formato wa_id (só dígitos, com DDI 55). */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

export function fmtPhone(p: string | null | undefined) {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
