"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { resolveNames } from "@/lib/finance";
import { MAX_IMPORT_ROWS, parseDateFlexible } from "@/lib/csv";

export type SaveRow = {
  key: string;
  id?: string;
  due: string;
  kind: "receita" | "despesa";
  description: string;
  category: string;
  amountCents: number;
  paidAt: string;
  contact: string;
  deal: string;
  notes: string;
};

export type SaveResult =
  | { ok: true; created: number; updated: number; deleted: number; unmatched: { contacts: string[]; deals: string[] } }
  | { ok: false; error: string; errors?: Record<string, string> };

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

/** Valida uma linha (a validação do navegador é só conforto; esta é a que vale). */
function check(r: SaveRow): string | null {
  if (r.kind !== "receita" && r.kind !== "despesa") return "tipo inválido";
  if (!r.description?.trim() || r.description.length > 200) return "descrição vazia ou longa demais";
  if (!parseDateFlexible(r.due) || parseDateFlexible(r.due) !== r.due) return "vencimento inválido";
  if (r.paidAt && parseDateFlexible(r.paidAt) !== r.paidAt) return "data de pagamento inválida";
  if (!Number.isInteger(r.amountCents) || r.amountCents <= 0 || r.amountCents > 1e12) return "valor inválido";
  if ((r.category ?? "").length > 80 || (r.contact ?? "").length > 200 || (r.deal ?? "").length > 200 || (r.notes ?? "").length > 2000) return "texto longo demais";
  if (r.id !== undefined && r.id !== "" && !isId(r.id)) return "id inválido";
  return null;
}

/** Grava de uma vez tudo o que mudou na planilha: novas linhas, alterações e exclusões. */
export async function saveSheet(input: { rows: SaveRow[]; deleteIds: string[] }): Promise<SaveResult> {
  const user = await requireAccess("financeiro", "edit");
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const deleteIds = (Array.isArray(input?.deleteIds) ? input.deleteIds : []).filter(isId);
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `No máximo ${MAX_IMPORT_ROWS} linhas por vez.` };
  if (deleteIds.length && !has(user, "financeiro", "manage")) return { ok: false, error: "Excluir lançamentos exige o nível Gerenciar no Financeiro." };

  const errors: Record<string, string> = {};
  for (const r of rows) {
    const e = check(r);
    if (e) errors[r.key] = e;
  }
  if (Object.keys(errors).length) return { ok: false, error: `${Object.keys(errors).length} linha(s) com erro. Nada foi salvo.`, errors };

  const { contact: contactMap, deal: dealMap } = await resolveNames(
    rows.map((r) => r.contact),
    rows.map((r) => r.deal),
  );
  const lc = (s: string) => s.trim().toLowerCase();
  const unmatchedContacts = new Set<string>();
  const unmatchedDeals = new Set<string>();
  const values = (r: SaveRow) => {
    const contactId = r.contact.trim() ? (contactMap.get(lc(r.contact)) ?? null) : null;
    const dealId = r.deal.trim() ? (dealMap.get(lc(r.deal)) ?? null) : null;
    if (r.contact.trim() && !contactId) unmatchedContacts.add(r.contact.trim());
    if (r.deal.trim() && !dealId) unmatchedDeals.add(r.deal.trim());
    return {
      kind: r.kind,
      description: r.description.trim(),
      category: r.category.trim() || null,
      amountCents: r.amountCents,
      dueDate: r.due,
      paidAt: r.paidAt || null,
      contactId,
      dealId,
      notes: r.notes.trim() || null,
    };
  };

  let created = 0;
  let updated = 0;
  const fresh = rows.filter((r) => !r.id);
  const existing = rows.filter((r) => r.id);

  if (fresh.length) {
    await db.insert(schema.transactions).values(fresh.map(values));
    created += fresh.length;
  }
  for (let i = 0; i < existing.length; i += 20) {
    await Promise.all(
      existing.slice(i, i + 20).map(async (r) => {
        const hit = await db.update(schema.transactions).set(values(r)).where(eq(schema.transactions.id, r.id!)).returning({ id: schema.transactions.id });
        if (hit.length) updated++;
        else {
          // id veio de uma planilha exportada e não existe mais/aqui: entra como lançamento novo
          await db.insert(schema.transactions).values({ ...values(r), id: r.id });
          created++;
        }
      }),
    );
  }
  if (deleteIds.length) await db.delete(schema.transactions).where(inArray(schema.transactions.id, deleteIds));

  await audit(user, "lancamentos_planilha", `Planilha: ${created} criado(s), ${updated} alterado(s), ${deleteIds.length} excluído(s)`, {
    entity: "lancamento",
    meta: { created, updated, deleted: deleteIds.length },
  });
  revalidatePath("/", "layout");
  return { ok: true, created, updated, deleted: deleteIds.length, unmatched: { contacts: [...unmatchedContacts].slice(0, 20), deals: [...unmatchedDeals].slice(0, 20) } };
}
