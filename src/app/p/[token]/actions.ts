"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getPublic, logEvent } from "@/lib/docs/server";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  return { ip: ip.slice(0, 64), ua: (h.get("user-agent") ?? "").slice(0, 300) };
}

/** Aceite eletrônico: nome, documento (opcional) e confirmação. Registra data, IP e navegador. */
export async function acceptDocument(token: string, input: { name: string; document?: string; agree: boolean }) {
  const pub = await getPublic(token);
  if (!pub) return { error: "Link inválido ou expirado." };
  if (pub.doc.status !== "enviado") return { error: pub.doc.status === "aceito" ? "Este documento já foi aceito." : "Este documento não está disponível para aceite." };
  const name = clean(input.name, 120);
  if (name.length < 3) return { error: "Digite seu nome completo." };
  if (!input.agree) return { error: "Marque a confirmação para continuar." };
  const doc = clean(input.document, 30);
  const { ip, ua } = await clientInfo();

  const updated = await db
    .update(schema.documents)
    .set({ status: "aceito", acceptedAt: new Date(), acceptedName: name, acceptedDocument: doc || null, acceptedIp: ip || null, acceptedUserAgent: ua || null, updatedAt: new Date() })
    .where(and(eq(schema.documents.id, pub.doc.id), eq(schema.documents.status, "enviado")))
    .returning({ id: schema.documents.id });
  if (!updated.length) return { error: "Este documento já foi aceito." };

  await logEvent(pub.doc.id, "aceito", { by: name });
  if (pub.doc.dealId) {
    await db.insert(schema.activities).values({
      dealId: pub.doc.dealId,
      contactId: pub.doc.contactId,
      type: "nota",
      body: `${pub.doc.kind === "contrato" ? "Contrato" : "Proposta"} ${pub.doc.number} aceito(a) online por ${name}`,
    });
  }
  await audit(null, "documento_aceito", `${pub.doc.number} aceito por ${name}`, { entity: "documento", entityId: pub.doc.id, meta: { ip } });
  revalidatePath(`/p/${token}`);
  revalidatePath(`/documentos/${pub.doc.id}`);
  return { ok: true };
}

export async function requestChanges(token: string, message: string) {
  const pub = await getPublic(token);
  if (!pub || pub.doc.status !== "enviado") return { error: "Este documento não está disponível." };
  const msg = clean(message, 1500);
  if (msg.length < 5) return { error: "Descreva o que gostaria de ajustar." };
  await logEvent(pub.doc.id, "ajuste_solicitado", { message: msg });
  if (pub.doc.dealId) {
    await db.insert(schema.activities).values({
      dealId: pub.doc.dealId,
      contactId: pub.doc.contactId,
      type: "nota",
      body: `Cliente pediu ajustes em ${pub.doc.number}: ${msg}`,
    });
  }
  await audit(null, "documento_ajuste", `Cliente pediu ajustes em ${pub.doc.number}`, { entity: "documento", entityId: pub.doc.id });
  return { ok: true };
}
