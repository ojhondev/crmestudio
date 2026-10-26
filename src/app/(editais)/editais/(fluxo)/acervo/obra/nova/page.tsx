import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaff } from "@/lib/editais-app/session";
import { ObraFlow } from "@/components/editais-app/flows/acervo-flows";

export const metadata: Metadata = { title: "Obra do acervo" };

/** /editais/acervo/obra/nova (nova) ou ?id=… (editar uma obra existente). */
export default async function Page({ searchParams }: PageProps<"/editais/acervo/obra/nova">) {
  await requireStaff("edit");
  const sp = await searchParams;
  const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : undefined;
  const [row] = id ? await db.select().from(schema.portfolioItems).where(eq(schema.portfolioItems.id, id)).limit(1) : [];
  return (
    <ObraFlow
      id={row?.id}
      initial={{
        title: row?.title ?? "",
        client: row?.client ?? "",
        year: row?.year ? String(row.year) : "",
        value: row?.valueCents ? (row.valueCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
        kind: row?.kind ?? "execucao",
        tombamento: row?.tombamento ?? "nenhum",
        tags: row?.tags ?? [],
        responsible: row?.responsible ?? "",
        description: row?.description ?? "",
        links: row?.links ?? [],
      }}
    />
  );
}
