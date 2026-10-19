"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseMoney, todayISO } from "@/lib/format";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "__none" ? s : null;
};

function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export async function saveTransaction(_: unknown, form: FormData) {
  const user = await requireAccess("financeiro", "edit");
  const id = str(form.get("id"));
  const kind = form.get("kind") === "despesa" ? "despesa" : "receita";
  const description = String(form.get("description") || "").trim();
  const amountCents = parseMoney(form.get("amount"));
  const dueDate = str(form.get("dueDate"));
  if (!description) return { error: "Descreva o lançamento." };
  if (amountCents <= 0) return { error: "Informe um valor maior que zero." };
  if (!dueDate) return { error: "Informe o vencimento." };
  const paid = form.get("paid") === "on";
  const base = {
    kind: kind as "receita" | "despesa",
    category: str(form.get("category")),
    dealId: str(form.get("dealId")),
    contactId: str(form.get("contactId")),
    notes: str(form.get("notes")),
  };

  if (id) {
    await db
      .update(schema.transactions)
      .set({ ...base, description, amountCents, dueDate, paidAt: paid ? (str(form.get("paidAt")) ?? todayISO()) : null })
      .where(eq(schema.transactions.id, id));
    await audit(user, "lancamento_alterado", `Alterou o lançamento “${description}” (${kind}, ${(amountCents / 100).toFixed(2)})`, { entity: "lancamento", entityId: id, meta: { kind, amountCents, dueDate, paid } });
  } else {
    // parcelamento: divide o valor em N meses (centavos que sobram vão na 1ª)
    const n = Math.min(Math.max(Number(form.get("installments")) || 1, 1), 48);
    const each = Math.floor(amountCents / n);
    const rows = Array.from({ length: n }, (_, i) => ({
      ...base,
      description: n > 1 ? `${description} (${i + 1}/${n})` : description,
      amountCents: i === 0 ? amountCents - each * (n - 1) : each,
      dueDate: addMonths(dueDate, i),
      paidAt: paid && i === 0 ? todayISO() : null,
    }));
    const created = await db.insert(schema.transactions).values(rows).returning({ id: schema.transactions.id });
    await audit(user, "lancamento_criado", `Lançou ${kind === "receita" ? "receita" : "despesa"} “${description}” de R$ ${(amountCents / 100).toFixed(2)}${n > 1 ? ` em ${n}x` : ""}`, {
      entity: "lancamento",
      entityId: created[0]?.id,
      meta: { kind, amountCents, installments: n, dueDate },
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function togglePaid(id: string, paid: boolean) {
  const user = await requireAccess("financeiro", "edit");
  const [t] = await db
    .update(schema.transactions)
    .set({ paidAt: paid ? todayISO() : null })
    .where(eq(schema.transactions.id, id))
    .returning({ description: schema.transactions.description, kind: schema.transactions.kind, amountCents: schema.transactions.amountCents });
  if (t) await audit(user, paid ? "lancamento_baixado" : "lancamento_reaberto", `${paid ? "Marcou como pago/recebido" : "Reabriu"} “${t.description}”`, { entity: "lancamento", entityId: id, meta: { amountCents: t.amountCents } });
  revalidatePath("/", "layout");
}

export async function deleteTransaction(id: string) {
  const user = await requireAccess("financeiro", "manage");
  const [t] = await db
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .returning({ description: schema.transactions.description, kind: schema.transactions.kind, amountCents: schema.transactions.amountCents });
  if (t) await audit(user, "lancamento_excluido", `Excluiu o lançamento “${t.description}”`, { entity: "lancamento", entityId: id, meta: { kind: t.kind, amountCents: t.amountCents } });
  revalidatePath("/", "layout");
}
