import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { Search, Star, Table2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { fmtDate, fromNow } from "@/lib/format";
import { sheetScope } from "@/lib/sheets/server";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { cn } from "@/lib/utils";
import { ImportButton, NewSheetButton, RowMenu } from "./list-client";

export const metadata: Metadata = { title: "Planilhas" };

const ORDERS = [
  { v: "recentes", l: "Recentes" },
  { v: "nome", l: "Nome" },
  { v: "criacao", l: "Criação" },
] as const;

export default async function SheetsPage({ searchParams }: PageProps<"/planilhas">) {
  const user = await requireAccess("planilhas");
  const canEdit = has(user, "planilhas", "edit");
  const canManage = has(user, "planilhas", "manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const ordem = ORDERS.find((o) => o.v === sp.ordem)?.v ?? "recentes";
  const fav = sp.fav === "1";

  const tabCount = db
    .select({ sheetId: schema.sheetTabs.sheetId, n: sql<number>`count(*)::int`.as("n") })
    .from(schema.sheetTabs)
    .groupBy(schema.sheetTabs.sheetId)
    .as("tc");

  const [rows, deals, contacts] = await Promise.all([
    db
      .select({
        id: schema.sheets.id,
        name: schema.sheets.name,
        favorite: schema.sheets.favorite,
        updatedAt: schema.sheets.updatedAt,
        createdAt: schema.sheets.createdAt,
        owner: schema.users.name,
        deal: schema.deals.title,
        dealId: schema.sheets.dealId,
        contactId: schema.sheets.contactId,
        contact: schema.contacts.name,
        tabs: tabCount.n,
      })
      .from(schema.sheets)
      .leftJoin(schema.users, eq(schema.sheets.ownerId, schema.users.id))
      .leftJoin(schema.deals, eq(schema.sheets.dealId, schema.deals.id))
      .leftJoin(schema.contacts, eq(schema.sheets.contactId, schema.contacts.id))
      .leftJoin(tabCount, eq(tabCount.sheetId, schema.sheets.id))
      .where(and(sheetScope(user), q ? ilike(schema.sheets.name, `%${q.replace(/[%_]/g, "")}%`) : undefined, fav ? eq(schema.sheets.favorite, true) : undefined))
      .orderBy(
        desc(schema.sheets.favorite),
        ordem === "nome" ? asc(schema.sheets.name) : ordem === "criacao" ? desc(schema.sheets.createdAt) : desc(schema.sheets.updatedAt),
      )
      .limit(300),
    canEdit ? db.select({ id: schema.deals.id, title: schema.deals.title }).from(schema.deals).where(dealScope(user)).orderBy(desc(schema.deals.updatedAt)).limit(200) : Promise.resolve([]),
    canEdit ? db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).orderBy(asc(schema.contacts.name)).limit(500) : Promise.resolve([]),
  ]);
  const contactOpts = contacts.map((c) => ({ value: c.id, label: c.name }));
  const dealOpts = deals.map((d) => ({ value: d.id, label: d.title }));
  const href = (o: string, f: boolean) => ({ query: { ...(q ? { q } : {}), ...(o !== "recentes" ? { ordem: o } : {}), ...(f ? { fav: "1" } : {}) } });
  const chip = (active: boolean) =>
    cn("inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[13px] whitespace-nowrap transition-colors max-md:min-h-10", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30");

  return (
    <>
      <PageToolbar
        title="Planilhas"
        filters={
          <>
            <form data-tour="sheets-search" className="relative w-48 shrink-0 sm:w-64">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Buscar planilha…" aria-label="Buscar planilhas" className="h-9 pl-8" />
              {ordem !== "recentes" && <input type="hidden" name="ordem" value={ordem} />}
              {fav && <input type="hidden" name="fav" value="1" />}
            </form>
            <div data-tour="sheets-order" className="flex items-center gap-1.5">
              {ORDERS.map((o) => (
                <Link key={o.v} href={href(o.v, fav)} className={chip(ordem === o.v)}>
                  {o.l}
                </Link>
              ))}
              <Link href={href(ordem, !fav)} className={cn(chip(fav), "gap-1")}>
                <Star className="size-3.5" /> Favoritas
              </Link>
            </div>
          </>
        }
        actions={
          canEdit ? (
            <>
              <ImportButton deals={dealOpts} />
              <NewSheetButton deals={dealOpts} />
            </>
          ) : undefined
        }
      />
      <ToolArea>
        <div className="p-4 sm:p-5">
          {rows.length === 0 ? (
            <EmptyState icon={Table2} title={q || fav ? "Nada encontrado" : "Nenhuma planilha ainda"}>
              {q || fav ? "Tente outro termo ou limpe os filtros." : canEdit ? "Crie uma planilha em branco, parta de um modelo (materiais, custos, orçamento…) ou importe um arquivo do Excel, Google Sheets ou LibreOffice." : "Quando houver planilhas, elas aparecem aqui."}
            </EmptyState>
          ) : (
            <ul data-tour="sheets-list" className="grid gap-2.5">
              {rows.map((r) => (
                <li key={r.id} className="group flex items-center gap-2 rounded-xl border bg-card pr-2 hover:border-foreground/30">
                  <Link href={`/planilhas/${r.id}`} className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-4 py-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                      <Table2 className="size-4.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-medium">{r.name}</span>
                        {r.favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorita" />}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {r.tabs ?? 1} {(r.tabs ?? 1) === 1 ? "aba" : "abas"} · {r.owner ?? "—"} · editada {fromNow(r.updatedAt)} · criada em {fmtDate(r.createdAt)}
                        {(r.deal || r.contact) && ` · ${[r.deal, r.contact].filter(Boolean).join(" · ")}`}
                      </span>
                    </span>
                  </Link>
                  <RowMenu id={r.id} name={r.name} favorite={r.favorite} dealId={r.dealId} contactId={r.contactId} deals={dealOpts} contacts={contactOpts} canEdit={canEdit} canManage={canManage} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </ToolArea>
    </>
  );
}
