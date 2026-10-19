import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarPlus, Mail, MessageCircle, Phone, Plus } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { getFormOptions } from "@/lib/options";
import { fmtDate, fmtDateTime, fmtPhone, money } from "@/lib/format";
import { EVENT_TYPES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody } from "@/components/page-header";
import { Section } from "@/components/crm/section";
import { Timeline } from "@/components/crm/timeline";
import { ActivityComposer } from "@/components/crm/activity-composer";
import { TaskList } from "@/components/crm/tasks";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { EmailDraftButton } from "@/components/ana/email-draft";
import { AnaFocusSetter } from "@/components/ana/ana-provider";
import { EditDealForm } from "../deal-form";
import { deleteDeal } from "../actions";

export const metadata: Metadata = { title: "Negócio" };

export default async function DealPage({ params }: PageProps<"/negocios/[id]">) {
  const { id } = await params;
  const user = await requireAccess("negocios");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, id)).limit(1);
  if (!deal) notFound();
  if (user.ownOnly && deal.partnerId !== user.id && deal.ownerId !== user.id) notFound();
  const canEdit = has(user, "negocios", "edit");
  const canDelete = has(user, "negocios", "manage");
  const canFinance = has(user, "financeiro");
  const canFinanceEdit = has(user, "financeiro", "edit");
  const canContacts = has(user, "contatos") && !user.ownOnly;
  const canInbox = has(user, "atendimento", "edit");
  const canSchedule = has(user, "agenda", "edit");

  const [options, contact, activities, taskRows, eventRows, txRows, conv] = await Promise.all([
    getFormOptions(user),
    deal.contactId
      ? db.select().from(schema.contacts).where(eq(schema.contacts.id, deal.contactId)).then((r) => r[0] ?? null)
      : null,
    db
      .select({
        id: schema.activities.id,
        type: schema.activities.type,
        body: schema.activities.body,
        createdAt: schema.activities.createdAt,
        userName: schema.users.name,
      })
      .from(schema.activities)
      .leftJoin(schema.users, eq(schema.activities.userId, schema.users.id))
      .where(eq(schema.activities.dealId, id))
      .orderBy(desc(schema.activities.createdAt)),
    db.select().from(schema.tasks).where(eq(schema.tasks.dealId, id)).orderBy(asc(schema.tasks.doneAt), asc(schema.tasks.dueAt)),
    db.select().from(schema.events).where(eq(schema.events.dealId, id)).orderBy(desc(schema.events.startsAt)),
    !canFinance ? [] : db.select().from(schema.transactions).where(eq(schema.transactions.dealId, id)).orderBy(asc(schema.transactions.dueDate)),
    deal.contactId && canInbox
      ? db
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(eq(schema.conversations.contactId, deal.contactId))
          .then((r) => r[0] ?? null)
      : null,
  ]);
  const stage = options.stages.find((s) => s.id === deal.stageId)!;

  return (
    <>
      <AnaFocusSetter kind="deal" id={deal.id} label={deal.title} />
      <div className="px-5 pt-6 pb-5 sm:px-8 lg:px-10">
        <Link href="/negocios" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Negócios
        </Link>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: stage.color }} />
                {stage.name}
              </Badge>
              {deal.service && <Badge variant="secondary">{deal.service}</Badge>}
            </div>
            <h1 className="h-display text-[28px] sm:text-[32px]">{deal.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="num text-xl text-foreground">{money(deal.valueCents)}</span>
              {deal.expectedClose && <> · previsão {fmtDate(deal.expectedClose)}</>}
              {deal.location && <> · {deal.location}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <EmailDraftButton dealId={deal.id} to={contact?.email} />}
            {canDelete && (
              <ConfirmButton
                action={deleteDeal.bind(null, deal.id)}
                title="Excluir este negócio?"
                description="O histórico, tarefas e eventos ligados a ele também serão apagados."
              />
            )}
          </div>
        </div>
      </div>

      <PageBody className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Tabs defaultValue="historico" className="min-w-0">
          <TabsList>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          </TabsList>
          <TabsContent value="historico" className="mt-4 grid gap-6">
            {canEdit && <ActivityComposer dealId={deal.id} contactId={deal.contactId} />}
            <Timeline items={activities} />
          </TabsContent>
          <TabsContent value="detalhes" className="mt-4 rounded-xl border bg-card p-5">
            {canEdit ? (
              <EditDealForm options={options} deal={deal} isPartner={user.ownOnly} />
            ) : (
              <p className="text-[13px] text-muted-foreground">Você tem acesso somente leitura a Negócios. Peça a um administrador para liberar a edição.</p>
            )}
          </TabsContent>
        </Tabs>

        <div className="grid gap-4">
          <Section title="Cliente">
            {contact ? (
              <div className="grid gap-2 text-[13px]">
                <Link href={canContacts ? `/contatos/${contact.id}` : "#"} className="font-medium hover:underline">
                  {contact.name}
                </Link>
                {(contact.role || contact.company) && (
                  <p className="-mt-1.5 text-muted-foreground">{[contact.role, contact.company].filter(Boolean).join(" · ")}</p>
                )}
                {contact.phone && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-3.5" /> {fmtPhone(contact.phone)}
                  </p>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                    <Mail className="size-3.5" /> {contact.email}
                  </a>
                )}
                {canInbox && contact.phone && (
                  <Button asChild variant="outline" size="sm" className="mt-1 w-fit">
                    <Link href={conv ? `/atendimento?c=${conv.id}` : `/atendimento/abrir?phone=${contact.phone}`}>
                      <MessageCircle /> {conv ? "Abrir conversa" : "Iniciar conversa"}
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Sem cliente vinculado.</p>
            )}
          </Section>

          <Section title="Tarefas">
            <TaskList
              dealId={deal.id}
              contactId={deal.contactId}
              compose={canEdit}
              tasks={taskRows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, doneAt: t.doneAt?.toISOString() ?? null }))}
            />
          </Section>

          <Section
            title="Agenda"
            action={
              canSchedule ? (
                <Button asChild variant="ghost" size="icon-sm" aria-label="Agendar">
                  <Link href={`/agenda?novo=1&deal=${deal.id}`}>
                    <CalendarPlus />
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {eventRows.length ? (
              <ul className="grid gap-2">
                {eventRows.map((e) => (
                  <li key={e.id} className="flex gap-2.5 text-[13px]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: EVENT_TYPES[e.type]?.color }} />
                    <span className="grid leading-tight">
                      <span>{e.title}</span>
                      <span className="text-[11.5px] text-muted-foreground">{fmtDateTime(e.startsAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">Nada agendado.</p>
            )}
          </Section>

          {canFinance && (
            <Section
              title="Financeiro"
              action={
                canFinanceEdit ? (
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Lançar">
                    <Link href={`/financeiro?novo=receita&deal=${deal.id}`}>
                      <Plus />
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {txRows.length ? (
                <ul className="grid gap-2 text-[13px]">
                  {txRows.map((t) => (
                    <li key={t.id} className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate">{t.description}</span>
                      <span className={t.kind === "receita" ? "tabular-nums" : "text-destructive tabular-nums"}>
                        {t.kind === "despesa" && "−"}
                        {money(t.amountCents)}
                      </span>
                      <span className="w-14 text-right text-[11px] text-muted-foreground">{t.paidAt ? "pago" : fmtDate(t.dueDate, "dd/MM")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">Nenhum lançamento.</p>
              )}
            </Section>
          )}
        </div>
      </PageBody>
    </>
  );
}
