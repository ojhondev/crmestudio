import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaff } from "@/lib/editais-app/session";
import { CofreFlow } from "@/components/editais-app/flows/acervo-flows";

export const metadata: Metadata = { title: "Documento do cofre" };

/** /editais/acervo/documento/novo (novo) ou ?id=… (renovar / editar um documento existente). */
export default async function Page({ searchParams }: PageProps<"/editais/acervo/documento/novo">) {
  await requireStaff("edit");
  const sp = await searchParams;
  const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : undefined;
  const [row] = id ? await db.select().from(schema.cofreDocs).where(eq(schema.cofreDocs.id, id)).limit(1) : [];
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  return (
    <CofreFlow
      id={row?.id}
      initial={{ type: row?.type ?? tipo, title: row?.title ?? "", number: row?.number ?? "", issuer: row?.issuer ?? "", issuedAt: row?.issuedAt ?? "", validUntil: row?.validUntil ?? "", url: row?.url ?? "", notes: row?.notes ?? "" }}
    />
  );
}
