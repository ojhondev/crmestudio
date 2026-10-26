"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/format";
import { cleanLink } from "@/lib/propostas/links";
import { PORTFOLIO_KIND_LABEL, TOMBAMENTO_LABEL } from "@/lib/propostas/types";

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

type PortfolioInput = {
  id?: string;
  title: string;
  client?: string;
  year?: string | number;
  value?: string;
  kind?: string;
  tags?: string[];
  tombamento?: string;
  responsible?: string;
  description?: string;
  links?: { name: string; url: string }[];
};

export async function savePortfolioAction(input: PortfolioInput): Promise<{ error: string } | { ok: true; id: string }> {
  const user = await requireAccess("editais", "edit");
  const title = str(input.title, 200);
  if (!title) return { error: "Dê um título à obra ou ao projeto." };
  const yearN = Number(input.year);
  const year = input.year === undefined || input.year === "" ? null : Number.isInteger(yearN) && yearN >= 1950 && yearN <= new Date().getFullYear() + 1 ? yearN : NaN;
  if (Number.isNaN(year)) return { error: "Ano inválido." };
  const kind = input.kind && input.kind in PORTFOLIO_KIND_LABEL ? input.kind : "execucao";
  const tombamento = input.tombamento && input.tombamento in TOMBAMENTO_LABEL ? input.tombamento : "nenhum";
  const tags = [...new Set((input.tags ?? []).map((t) => str(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  const links: { name: string; url: string }[] = [];
  for (const l of (input.links ?? []).slice(0, 10)) {
    const url = cleanLink(l.url);
    if (l.url?.trim() && !url) return { error: "Os links precisam começar com https://." };
    if (url) links.push({ name: str(l.name, 80) || "Arquivo", url });
  }
  const cents = parseMoney(input.value ?? "");
  const values = { title, client: str(input.client, 160) || null, year, valueCents: cents || null, kind, tags, tombamento, responsible: str(input.responsible, 160) || null, description: str(input.description, 3000) || null, links, updatedAt: new Date() };
  let id = input.id;
  if (id) {
    if (!isId(id)) return { error: "Pedido inválido." };
    await db.update(schema.portfolioItems).set(values).where(eq(schema.portfolioItems.id, id));
  } else {
    const [row] = await db.insert(schema.portfolioItems).values(values).returning({ id: schema.portfolioItems.id });
    id = row.id;
  }
  await audit(user, input.id ? "portfolio_atualizado" : "portfolio_criado", `${input.id ? "Atualizou" : "Cadastrou"} no banco de atestados: ${title}`, { entity: "portfolio", entityId: id });
  revalidatePath("/editais/portfolio");
  return { ok: true, id };
}

export async function deletePortfolioAction(id: string): Promise<{ error: string } | { ok: true }> {
  const user = await requireAccess("editais", "manage");
  if (!isId(id)) return { error: "Pedido inválido." };
  const [row] = await db.select({ title: schema.portfolioItems.title }).from(schema.portfolioItems).where(eq(schema.portfolioItems.id, id)).limit(1);
  if (!row) return { error: "Item não encontrado." };
  await db.delete(schema.portfolioItems).where(eq(schema.portfolioItems.id, id));
  await audit(user, "portfolio_excluido", `Removeu do banco de atestados: ${row.title}`, { entity: "portfolio", entityId: id });
  revalidatePath("/editais/portfolio");
  return { ok: true };
}
