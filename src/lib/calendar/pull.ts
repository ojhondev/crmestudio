/**
 * Baixa as mudanças da agenda do Google (sync incremental com syncToken). Função pura sobre o cliente.
 * 410 Gone = o syncToken venceu: descarta o token e refaz a sincronização completa (janela de 60 dias atrás a 1 ano à frente).
 */
import { GoogleApiError, type CalendarClient } from "./client";
import type { GEvent } from "./map";

export type PullResult = { events: GEvent[]; nextSyncToken: string | null; fullResync: boolean };

export async function pullChanges(
  client: Pick<CalendarClient, "listEvents">,
  calendarId: string,
  syncToken: string | null,
  now: Date = new Date(),
): Promise<PullResult> {
  const timeMin = new Date(now.getTime() - 60 * 864e5).toISOString();
  const timeMax = new Date(now.getTime() + 365 * 864e5).toISOString();

  const run = async (token: string | null) => {
    const events: GEvent[] = [];
    let pageToken: string | null = null;
    let next: string | null = null;
    for (let page = 0; page < 40; page++) {
      const r = await client.listEvents({ calendarId, syncToken: token, pageToken, timeMin, timeMax });
      events.push(...(r.items ?? []));
      if (r.nextPageToken) {
        pageToken = r.nextPageToken;
        continue;
      }
      next = r.nextSyncToken ?? null;
      break;
    }
    return { events, next };
  };

  try {
    const r = await run(syncToken);
    return { events: r.events, nextSyncToken: r.next, fullResync: !syncToken };
  } catch (e) {
    if (syncToken && e instanceof GoogleApiError && e.status === 410) {
      const r = await run(null);
      return { events: r.events, nextSyncToken: r.next, fullResync: true };
    }
    throw e;
  }
}
