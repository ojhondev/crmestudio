import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { addMonths, getSheetRows } from "@/lib/finance";
import { fmtDate, todayISO } from "@/lib/format";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";
import { Sheet } from "./sheet";

export const metadata: Metadata = { title: "Planilha financeira" };

const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};

export default async function SheetPage({ searchParams }: PageProps<"/financeiro/planilha">) {
  const user = await requireAccess("financeiro");
  const sp = await searchParams;
  const canEdit = has(user, "financeiro", "edit");
  const canDelete = has(user, "financeiro", "manage");
  const today = todayISO();
  const v = sp.v === "abertos" || sp.v === "todos" ? sp.v : null;
  const month = !v ? (typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7)) : null;

  const [rows, cats, contacts, deals] = await Promise.all([
    month ? getSheetRows({ from: `${month}-01`, to: `${addMonths(month, 1)}-01` }) : getSheetRows({ onlyOpen: v === "abertos" }),
    db.selectDistinct({ c: schema.transactions.category }).from(schema.transactions),
    db.select({ n: schema.contacts.name }).from(schema.contacts).orderBy(asc(schema.contacts.name)).limit(500),
    db.select({ n: schema.deals.title }).from(schema.deals).orderBy(asc(schema.deals.title)).limit(500),
  ]);
  const categories = [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...cats.map((r) => r.c ?? "").filter(Boolean)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const defaultDue = month && !today.startsWith(month) ? `${month}-01` : today;
  const sig = `${rows.length}:${rows.reduce((h, r) => h ^ hash(`${r.id}${r.due}${r.description}${r.amountCents}${r.paidAt}${r.category}${r.contact}${r.deal}${r.notes}${r.kind}`), 0)}`;
  const exportQuery = month ? `m=${month}` : `v=${v}`;

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={cn("inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] max-md:min-h-10 text-muted-foreground transition-colors hover:border-foreground/30", active && "border-foreground bg-foreground text-background hover:border-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Planilha" description="Edite os lançamentos como numa planilha — no celular ou no computador — e leve para o Excel ou o Google Sheets." />
      <PageBody className="grid gap-4">
        <div data-tour="sheet-period" className="flex flex-wrap items-center gap-2">
          {month && (
            <>
              <Button asChild variant="outline" size="icon" aria-label="Mês anterior">
                <Link href={`/financeiro/planilha?m=${addMonths(month, -1)}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              <Button asChild variant="outline" size="icon" aria-label="Próximo mês">
                <Link href={`/financeiro/planilha?m=${addMonths(month, 1)}`}>
                  <ChevronRight />
                </Link>
              </Button>
              <h2 className="mr-2 ml-1 text-lg font-light capitalize">{fmtDate(`${month}-15`, "MMMM 'de' yyyy")}</h2>
            </>
          )}
          {chip("/financeiro/planilha", "Mês", !!month)}
          {chip("/financeiro/planilha?v=abertos", "Em aberto", v === "abertos")}
          {chip("/financeiro/planilha?v=todos", "Tudo", v === "todos")}
        </div>
        {rows.length >= 3000 && <p className="rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Mostrando os 3.000 primeiros lançamentos. Filtre por mês para ver o restante.</p>}
        <Sheet key={sig} rows={rows} canEdit={canEdit} canDelete={canDelete} defaultDue={defaultDue} categories={categories} contacts={contacts.map((r) => r.n)} deals={deals.map((r) => r.n)} exportQuery={exportQuery} />
      </PageBody>
    </>
  );
}
