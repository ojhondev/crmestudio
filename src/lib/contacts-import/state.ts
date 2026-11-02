/** Despacho do `state` do OAuth em /api/drive/callback (puro, testável): "cal:" Agenda · "ppl:" Contatos · resto Drive. */
export type CallbackTarget = "agenda" | "contatos" | "drive";

export function callbackTarget(state: string | null | undefined): CallbackTarget {
  if (state && state.startsWith("cal:")) return "agenda";
  if (state && state.startsWith("ppl:")) return "contatos";
  return "drive";
}

/** O cookie de state (o ":" vai codificado como %3A) confere com o state da URL? */
export function cookieMatchesState(cookieHeader: string | null, name: string, state: string | null): boolean {
  if (!state) return false;
  const raw = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
  if (!raw) return false;
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    /* mantém */
  }
  return v === state;
}
