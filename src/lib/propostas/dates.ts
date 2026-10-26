/**
 * Datas em dias úteis (puro). Datas são strings "YYYY-MM-DD" no fuso do estúdio.
 * Dia útil = não é sábado, domingo nem feriado nacional (fixos + Sexta-feira Santa, Carnaval e Corpus Christi).
 * Feriados estaduais/municipais não são conhecidos: por isso o prazo é uma META INTERNA, nunca um prazo legal.
 */
const DAY = 864e5;
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDaysISO = (iso: string, n: number) => fromUtc(utc(iso) + n * DAY);
export const diffDaysISO = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);
const weekday = (iso: string) => new Date(utc(iso)).getUTCDay();

/** Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cache = new Map<number, Set<string>>();
export function holidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const p = (md: string) => `${year}-${md}`;
  const e = easter(year);
  const set = new Set<string>([
    p("01-01"), p("04-21"), p("05-01"), p("09-07"), p("10-12"), p("11-02"), p("11-15"), p("12-25"),
    addDaysISO(e, -48), addDaysISO(e, -47), // Carnaval (segunda e terça)
    addDaysISO(e, -2), // Sexta-feira Santa
    addDaysISO(e, 60), // Corpus Christi
  ]);
  if (year >= 2024) set.add(p("11-20")); // Consciência Negra (nacional desde 2024)
  cache.set(year, set);
  return set;
}

export function isBusinessDay(iso: string): boolean {
  const w = weekday(iso);
  if (w === 0 || w === 6) return false;
  return !holidays(Number(iso.slice(0, 4))).has(iso);
}

/** Se cair em dia não útil, recua para o dia útil anterior. */
export function prevBusinessDay(iso: string): string {
  let d = iso;
  for (let i = 0; i < 15 && !isBusinessDay(d); i++) d = addDaysISO(d, -1);
  return d;
}
export function nextBusinessDay(iso: string): string {
  let d = iso;
  for (let i = 0; i < 15 && !isBusinessDay(d); i++) d = addDaysISO(d, 1);
  return d;
}

/** Subtrai `n` dias úteis (n = 0 → o próprio dia, recuado se não for útil). */
export function subBusinessDays(iso: string, n: number): string {
  let d = prevBusinessDay(iso);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d = addDaysISO(d, -1);
    if (isBusinessDay(d)) left--;
  }
  return d;
}

/**
 * Prazo calculado de trás para frente a partir da data limite.
 * Cai sempre em dia útil anterior. Se o resultado já passou (edital com prazo curto), usa `today`
 * (ou o próximo dia útil) e marca `squeezed: true` para a tela avisar “prazo apertado”.
 */
export function dueFromDeadline(deadlineISO: string, offsetBusinessDays: number, todayISO?: string): { day: string; squeezed: boolean } {
  const day = subBusinessDays(deadlineISO, offsetBusinessDays);
  if (todayISO && day < todayISO) {
    const floor = nextBusinessDay(todayISO);
    return { day: floor > deadlineISO ? deadlineISO : floor, squeezed: true };
  }
  return { day, squeezed: false };
}

/** Meio-dia de Brasília do dia (instante usado nos prazos de itens/tarefas). */
export const dayToInstant = (iso: string, hour = 18) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00-03:00`);
