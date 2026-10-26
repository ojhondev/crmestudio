import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { suggestAtestados, type PortfolioLite } from "./portfolio";

export type SuggestionDTO = { id: string; title: string; client: string | null; year: number | null; valueCents: number | null; kind: string; tags: string[]; tombamento: string | null; score: number; why: string[] };

export const toPortfolioLite = (r: typeof schema.portfolioItems.$inferSelect): PortfolioLite => ({
  id: r.id,
  title: r.title,
  client: r.client,
  year: r.year,
  valueCents: r.valueCents,
  kind: r.kind,
  tags: r.tags ?? [],
  tombamento: r.tombamento,
  responsible: r.responsible,
  description: r.description,
});

/** Atestados do portfólio ordenados por aderência ao objeto do edital. */
export async function suggestAtestadosFor(editalId: string, limit = 10): Promise<SuggestionDTO[]> {
  const [e] = await db.select({ title: schema.editais.title, object: schema.editais.object, kind: schema.editais.kind }).from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  if (!e) return [];
  const items = await db.select().from(schema.portfolioItems);
  return suggestAtestados(e, items.map(toPortfolioLite), { limit }).map((s) => ({ id: s.item.id, title: s.item.title, client: s.item.client, year: s.item.year, valueCents: s.item.valueCents, kind: s.item.kind, tags: s.item.tags, tombamento: s.item.tombamento, score: s.score, why: s.why }));
}
