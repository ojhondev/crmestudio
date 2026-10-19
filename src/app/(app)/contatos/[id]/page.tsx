import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { getFormOptions } from "@/lib/options";
import { fmtPhone, money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody } from "@/components/page-header";
import { Section } from "@/components/crm/section";
import { Timeline } from "@/components/crm/timeline";
import { ActivityComposer } from "@/components/crm/activity-composer";
import { TaskList } from "@/components/crm/tasks";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { AnaFocusSetter } from "@/components/ana/ana-provider";
import { NewDealButton } from "../../negocios/deal-form";
import { EditContactForm } from "../contact-form";
import { deleteContact } from "../actions";

export const metadata: Metadata = { title: "Contato" };

export default async function ContactPage({ params }: PageProps<"/contatos/[id]">) {
  const { id } = await params;
  const user = await requireAccess("contatos");
  const canEdit = has(user, "contatos", "edit");
  const canDelete = has(user, "contatos", "manage");
  const canDeal = has(user, "negocios", "edit");
  const canInbox = has(user, "atendimento", "edit");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1);
  if (!contact) notFound();

  const [options, deals, activities, taskRows, conv] = await Promise.all([
    getFormOptions(user),
    db
      .select({ id: schema.deals.id, title: schema.deals.title, value: schema.deals.valueCents, stage: schema.stages.name, color: schema.stages.color })
      .from(schema.deals)
      .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
      .where(eq(schema.deals.contactId, id))
      .orderBy(desc(schema.deals.updatedAt)),
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
      .where(eq(schema.activities.contactId, id))
      .orderBy(desc(schema.activities.createdAt))
      .limit(100),
    db.select().from(schema.tasks).where(eq(schema.tasks.contactId, id)).orderBy(asc(schema.tasks.doneAt), asc(schema.tasks.dueAt)),
    db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, id)).then((r) => r[0] ?? null),
  ]);

  return (
    <>
      <AnaFocusSetter kind="contact" id={contact.id} label={contact.name} />
      <div className="px-5 pt-6 pb-5 sm:px-8 lg:px-10">
        <Link href="/contatos" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Leads e contatos
        </Link>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {contact.source && <Badge variant="secondary">{contact.source}</Badge>}
              {contact.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
            <h1 className="h-display text-[28px] sm:text-[32px]">{contact.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[contact.role, contact.company, [contact.city, contact.state].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canInbox && contact.phone && (
              <Button asChild variant="outline">
                <Link href={conv ? `/atendimento?c=${conv.id}` : `/atendimento/abrir?phone=${contact.phone}`}>
                  <MessageCircle /> WhatsApp
                </Link>
              </Button>
            )}
            {canDeal && <NewDealButton options={options} defaultContactId={contact.id} label="Negócio" variant="outline" />}
            {canDelete && (
            <ConfirmButton
              action={deleteContact.bind(null, contact.id)}
              title="Excluir este contato?"
              description="Negócios, conversas, eventos e lançamentos ligados a ele também serão apagados."
            />
            )}
          </div>
        </div>
      </div>

      <PageBody className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Tabs defaultValue="historico" className="min-w-0">
          <TabsList>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            {canEdit && <TabsTrigger value="dados">Dados</TabsTrigger>}
          </TabsList>
          <TabsContent value="historico" className="mt-4 grid gap-6">
            {canEdit && <ActivityComposer contactId={contact.id} />}
            <Timeline items={activities} />
          </TabsContent>
          {canEdit && (
            <TabsContent value="dados" className="mt-4 rounded-xl border bg-card p-5">
              <EditContactForm contact={contact} team={options.team} />
            </TabsContent>
          )}
        </Tabs>

        <div className="grid gap-4">
          <Section title="Contato">
            <div className="grid gap-2 text-[13px] text-muted-foreground">
              <p className="flex items-center gap-2">
                <Phone className="size-3.5" /> {fmtPhone(contact.phone)}
              </p>
              <p className="flex items-center gap-2">
                <Mail className="size-3.5" />
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="hover:text-foreground">
                    {contact.email}
                  </a>
                ) : (
                  "—"
                )}
              </p>
              {contact.notes && <p className="mt-1 whitespace-pre-wrap text-foreground/80">{contact.notes}</p>}
            </div>
          </Section>
          <Section title="Negócios">
            {deals.length ? (
              <ul className="grid gap-2">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/negocios/${d.id}`} className="grid rounded-md px-1 py-1 leading-tight hover:bg-muted/60">
                      <span className="text-[13px] font-medium">{d.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full" style={{ background: d.color }} />
                        {d.stage} · {money(d.value)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">Nenhum negócio.</p>
            )}
          </Section>
          <Section title="Tarefas">
            <TaskList
              contactId={contact.id}
              compose={canEdit}
              tasks={taskRows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, doneAt: t.doneAt?.toISOString() ?? null, status: t.status, priority: t.priority }))}
            />
          </Section>
        </div>
      </PageBody>
    </>
  );
}
