import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Search, Users } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { getFormOptions } from "@/lib/options";
import { fmtDate, fmtPhone, money } from "@/lib/format";
import { SOURCES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { NewContactButton } from "./contact-form";

export const metadata: Metadata = { title: "Leads e contatos" };

export default async function ContactsPage({ searchParams }: PageProps<"/contatos">) {
  const user = await requireAccess("contatos");
  const canEdit = has(user, "contatos", "edit");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const origem = typeof sp.origem === "string" ? sp.origem : "";

  // estágio do negócio aberto mais recente de cada contato
  const latestDeal = db
    .selectDistinctOn([schema.deals.contactId], {
      contactId: schema.deals.contactId,
      stage: schema.stages.name,
      color: schema.stages.color,
      value: schema.deals.valueCents,
    })
    .from(schema.deals)
    .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
    .orderBy(schema.deals.contactId, desc(schema.deals.updatedAt))
    .as("ld");

  const digits = q.replace(/\D/g, "");
  const [rows, options] = await Promise.all([
    db
      .select({
        id: schema.contacts.id,
        name: schema.contacts.name,
        company: schema.contacts.company,
        phone: schema.contacts.phone,
        email: schema.contacts.email,
        source: schema.contacts.source,
        city: schema.contacts.city,
        state: schema.contacts.state,
        createdAt: schema.contacts.createdAt,
        owner: schema.users.name,
        stage: latestDeal.stage,
        color: latestDeal.color,
        value: latestDeal.value,
      })
      .from(schema.contacts)
      .leftJoin(schema.users, eq(schema.contacts.ownerId, schema.users.id))
      .leftJoin(latestDeal, eq(latestDeal.contactId, schema.contacts.id))
      .where(
        and(
          q
            ? or(
                ilike(schema.contacts.name, `%${q}%`),
                ilike(schema.contacts.company, `%${q}%`),
                ilike(schema.contacts.email, `%${q}%`),
                digits.length >= 4 ? ilike(schema.contacts.phone, `%${digits}%`) : sql`false`,
              )
            : undefined,
          origem ? eq(schema.contacts.source, origem) : undefined,
        ),
      )
      .orderBy(desc(schema.contacts.createdAt))
      .limit(300),
    getFormOptions(user),
  ]);

  return (
    <>
      <PageToolbar
        title="Leads e contatos"
        filters={
          <>
            <form data-tour="contacts-search" className="relative w-56 shrink-0 sm:w-72">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Buscar nome, instituição, e-mail…" aria-label="Buscar contatos" className="h-9 pl-8" />
              {origem && <input type="hidden" name="origem" value={origem} />}
            </form>
            {["", ...SOURCES].map((s) => (
              <Link
                key={s || "all"}
                href={{ query: { ...(q ? { q } : {}), ...(s ? { origem: s } : {}) } }}
                className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[13px] whitespace-nowrap transition-colors max-md:min-h-10 ${
                  origem === s ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {s || "Todas as origens"}
              </Link>
            ))}
            <span className="text-xs whitespace-nowrap text-muted-foreground">{rows.length} {rows.length === 1 ? "registro" : "registros"}</span>
          </>
        }
        actions={canEdit ? <NewContactButton team={options.team} /> : undefined}
      />
      <ToolArea>
      <div className="p-4 sm:p-5">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title={q || origem ? "Nada encontrado" : "Nenhum lead ainda"}>
            {q || origem ? "Tente outro termo de busca." : "Cadastre o primeiro lead."}
          </EmptyState>
        ) : (
          <div data-tour="contacts-list" className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">Contato</th>
                  <th className="px-4 py-2.5 font-medium">Etapa</th>
                  <th className="px-4 py-2.5 font-medium">Origem</th>
                  <th className="px-4 py-2.5 font-medium">Responsável</th>
                  <th className="px-4 py-2.5 text-right font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/contatos/${r.id}`} className="grid leading-tight">
                        <span className="font-medium group-hover:underline">{r.name}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {[r.company, [r.city, r.state].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <div className="grid leading-tight">
                        <span>{r.phone ? fmtPhone(r.phone) : "—"}</span>
                        <span className="text-[12px]">{r.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.stage ? (
                        <span className="flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full" style={{ background: r.color ?? undefined }} />
                          {r.stage}
                          {!!r.value && <span className="text-muted-foreground">· {money(r.value)}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{r.source ? <Badge variant="secondary">{r.source}</Badge> : "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.owner ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmtDate(r.createdAt, "dd/MM/yy")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </ToolArea>
    </>
  );
}
