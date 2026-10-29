import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IN_DEVELOPMENT } from "@/lib/modules-status";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { BookOpen, FileSignature, FileText, Presentation } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { docScope, templateOptions } from "@/lib/docs/server";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DocStatusBadge } from "@/components/docs/status";
import { EmptyState } from "@/components/page-header";
import { PageToolbar, ToolArea, ToolbarSep } from "@/components/toolbar";
import { NewDocumentButton } from "./new-document";

export const metadata: Metadata = { title: "Documentos" };

const KINDS = [
  { v: "", l: "Todos" },
  { v: "contrato", l: "Contratos" },
  { v: "apresentacao", l: "Apresentações" },
] as const;
const STATUSES = [
  { v: "", l: "Todos" },
  { v: "rascunho", l: "Rascunhos" },
  { v: "enviado", l: "Enviados" },
  { v: "aceito", l: "Aceitos" },
  { v: "cancelado", l: "Cancelados" },
] as const;

export default async function DocumentsPage({ searchParams }: PageProps<"/documentos">) {
  if (IN_DEVELOPMENT.documentos) redirect("/");
  const user = await requireAccess("documentos");
  const canEdit = has(user, "documentos", "edit");
  const canManage = has(user, "documentos", "manage");
  const sp = await searchParams;
  const kind = sp.tipo === "contrato" || sp.tipo === "apresentacao" ? sp.tipo : "";
  const status = ["rascunho", "enviado", "aceito", "cancelado"].includes(String(sp.status)) ? String(sp.status) : "";

  const [rows, tpl, deals] = await Promise.all([
    db
      .select({
        id: schema.documents.id,
        kind: schema.documents.kind,
        number: schema.documents.number,
        title: schema.documents.title,
        status: schema.documents.status,
        updatedAt: schema.documents.updatedAt,
        sentAt: schema.documents.sentAt,
        contact: schema.contacts.name,
        deal: schema.deals.title,
      })
      .from(schema.documents)
      .leftJoin(schema.contacts, eq(schema.documents.contactId, schema.contacts.id))
      .leftJoin(schema.deals, eq(schema.documents.dealId, schema.deals.id))
      .where(and(docScope(user), kind ? eq(schema.documents.kind, kind) : undefined, status ? eq(schema.documents.status, status as "rascunho") : undefined))
      .orderBy(desc(schema.documents.updatedAt))
      .limit(300),
    templateOptions(),
    db.select({ id: schema.deals.id, title: schema.deals.title }).from(schema.deals).where(dealScope(user)).orderBy(desc(schema.deals.updatedAt)).limit(200),
  ]);

  const href = (k: string, s: string) => `/documentos${k || s ? `?${new URLSearchParams({ ...(k && { tipo: k }), ...(s && { status: s }) })}` : ""}`;
  const pill = (active: boolean) => cn("inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap max-md:min-h-10", active ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/40");

  return (
    <>
      <PageToolbar
        title="Documentos"
        filters={
          <>
            <div className="flex shrink-0 gap-1.5" aria-label="Filtrar por tipo">
              {KINDS.map((k) => (
                <Link key={k.v} href={href(k.v, status)} className={pill(kind === k.v)} aria-current={kind === k.v}>
                  {k.l}
                </Link>
              ))}
            </div>
            <ToolbarSep />
            <div className="flex shrink-0 gap-1.5" aria-label="Filtrar por situação">
              {STATUSES.map((s) => (
                <Link key={s.v} href={href(kind, s.v)} className={pill(status === s.v)} aria-current={status === s.v}>
                  {s.l}
                </Link>
              ))}
            </div>
          </>
        }
        actions={
          <>
            {canManage && (
              <Button asChild variant="outline" size="sm">
                <Link href="/documentos/modelos" aria-label="Modelos e cláusulas"><BookOpen className="md:hidden" /><span className="max-md:hidden">Modelos e cláusulas</span></Link>
              </Button>
            )}
            {canEdit && <NewDocumentButton {...tpl} deals={deals.map((d) => ({ value: d.id, label: d.title }))} />}
          </>
        }
      />
      <ToolArea>
      <div className="p-4 sm:p-5">
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhum documento por aqui">
            {canEdit ? "Crie o primeiro contrato ou proposta: escolha um modelo e os dados do cliente entram sozinhos." : "Quando houver documentos, eles aparecem aqui."}
          </EmptyState>
        ) : (
          <ul data-tour="docs-list" className="grid gap-2.5">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/documentos/${r.id}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 hover:border-foreground/30 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">{r.kind === "contrato" ? <FileSignature className="size-4.5" /> : <Presentation className="size-4.5" />}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{r.title}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {r.number} · {[r.contact, r.deal].filter(Boolean).join(" · ") || "Sem cliente vinculado"} · atualizado em {fmtDate(r.updatedAt)}
                    </span>
                  </span>
                  <DocStatusBadge status={r.status} className="col-start-2 justify-self-start sm:col-start-3 sm:justify-self-end" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      </ToolArea>
    </>
  );
}
