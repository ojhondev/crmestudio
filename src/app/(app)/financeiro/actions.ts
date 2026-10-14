"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { access, requireUser } from "@/lib/auth";
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
  await requireUser(access.financeiro);
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
    await db.insert(schema.transactions).values(rows);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function togglePaid(id: string, paid: boolean) {
  await requireUser(access.financeiro);
  await db
    .update(schema.transactions)
    .set({ paidAt: paid ? todayISO() : null })
    .where(eq(schema.transactions.id, id));
  revalidatePath("/", "layout");
}

export async function deleteTransaction(id: string) {
  await requireUser(access.financeiro);
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  revalidatePath("/", "layout");
}
