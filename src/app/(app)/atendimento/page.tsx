import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { MessageCircle, Search } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { insideWindow, whatsappConnected } from "@/lib/whatsapp";
import { fmtPhone, fmtRelativeShort, initials, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { Thread } from "./thread";
import { startConversation } from "./actions";

export const metadata: Metadata = { title: "Atendimento" };

const FILTERS = [
  { key: "abertas", label: "Abertas" },
  { key: "nao-lidas", label: "Não lidas" },
  { key: "minhas", label: "Minhas" },
  { key: "resolvidas", label: "Resolvidas" },
];

export default async function InboxPage({ searchParams }: PageProps<"/atendimento">) {
  const user = await requireAccess("atendimento");
  const sp = await searchParams;
  const selected = typeof sp.c === "string" && /^[0-9a-f-]{36}$/.test(sp.c) ? sp.c : null;
  const filter = typeof sp.f === "string" ? sp.f : "abertas";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const novo = typeof sp.novo === "string" ? sp.novo : "";

  const displayName = sql<string>`coalesce(${schema.contacts.name}, ${schema.conversations.profileName}, ${schema.conversations.phone})`;
  const list = await db
    .select({
      id: schema.conversations.id,
      name: displayName,
      company: schema.contacts.company,
      phone: schema.conversations.phone,
      preview: schema.conversations.preview,
      unread: schema.conversations.unread,
      at: schema.conversations.lastMessageAt,
      status: schema.conversations.status,
    })
    .from(schema.conversations)
    .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
    .where(
      and(
        filter === "resolvidas" ? eq(schema.conversations.status, "resolvida") : eq(schema.conversations.status, "aberta"),
        filter === "nao-lidas" ? gt(schema.conversations.unread, 0) : undefined,
        filter === "minhas" ? eq(schema.conversations.assigneeId, user.id) : undefined,
        q
          ? or(
              ilike(schema.contacts.name, `%${q}%`),
              ilike(schema.conversations.profileName, `%${q}%`),
              ilike(schema.conversations.phone, `%${q.replace(/\D/g, "") || q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(sql`${schema.conversations.lastMessageAt} desc nulls last`)
    .limit(200);

  let thread: React.ComponentProps<typeof Thread> | null = null;
  if (selected) {
    const [conv] = await db
      .select({
        id: schema.conversations.id,
        phone: schema.conversations.phone,
        profileName: schema.conversations.profileName,
        status: schema.conversations.status,
        unread: schema.conversations.unread,
        assigneeId: schema.conversations.assigneeId,
        lastInboundAt: schema.conversations.lastInboundAt,
        contactId: schema.contacts.id,
        contactName: schema.contacts.name,
        company: schema.contacts.company,
        email: schema.contacts.email,
      })
      .from(schema.conversations)
      .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
      .where(eq(schema.conversations.id, selected))
      .limit(1);
    if (conv) {
      const [msgs, team, deals] = await Promise.all([
        db
          .select({
            id: schema.messages.id,
            direction: schema.messages.direction,
            body: schema.messages.body,
            status: schema.messages.status,
            createdAt: schema.messages.createdAt,
            author: schema.users.name,
          })
          .from(schema.messages)
          .leftJoin(schema.users, eq(schema.messages.authorId, schema.users.id))
          .where(eq(schema.messages.conversationId, conv.id))
          .orderBy(asc(schema.messages.createdAt))
          .limit(500),
        db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(and(eq(schema.users.active, true), sql`${schema.users.role} <> 'parceiro'`)),
        conv.contactId
          ? db
              .select({ id: schema.deals.id, title: schema.deals.title, stage: schema.stages.name, color: schema.stages.color, value: schema.deals.valueCents })
              .from(schema.deals)
              .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
              .where(eq(schema.deals.contactId, conv.contactId))
              .orderBy(desc(schema.deals.updatedAt))
          : [],
      ]);
      thread = {
        conv: {
          ...conv,
          name: conv.contactName || conv.profileName || fmtPhone(conv.phone),
          phoneLabel: fmtPhone(conv.phone),
          windowOpen: insideWindow(conv.lastInboundAt),
        },
        messages: msgs.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        team,
        deals: deals.map((d) => ({ ...d, valueLabel: money(d.value) })),
        connected: whatsappConnected(),
        canEdit: has(user, "atendimento", "edit"),
      };
    }
  }

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(filter !== "abertas" ? { f: filter } : {}), ...(q ? { q } : {}), ...extra });
    return `/atendimento${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="grid h-[calc(100svh-3.5rem-4.25rem-env(safe-area-inset-bottom))] min-h-0 grid-cols-[minmax(0,1fr)] md:h-[calc(100svh-3.5rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Lista */}
      <aside data-tour="inbox-list" className={cn("flex min-h-0 flex-col border-r bg-card", thread && "hidden lg:flex")}>
        <div className="grid gap-3 border-b px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <h1 className="h-display text-2xl">Atendimento</h1>
            <span
              className={cn(
                "ml-auto rounded-full px-2 py-0.5 text-[11px]",
                whatsappConnected() ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
              )}
              title={whatsappConnected() ? "WhatsApp Cloud API conectada" : "Modo simulado: configure a Cloud API em Ajustes"}
            >
              {whatsappConnected() ? "WhatsApp conectado" : "modo simulado"}
            </span>
          </div>
          <form className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Buscar conversa" className="pl-8" />
            {filter !== "abertas" && <input type="hidden" name="f" value={filter} />}
          </form>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/atendimento?${new URLSearchParams({ ...(f.key !== "abertas" ? { f: f.key } : {}), ...(q ? { q } : {}) })}`}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground",
                  filter === f.key && "bg-foreground text-background hover:text-background",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                href={qs({ c: c.id })}
                className={cn(
                  "flex gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/50",
                  selected === c.id && "bg-brand-soft/60 hover:bg-brand-soft/60",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[11.5px] font-medium">
                  {/^\d/.test(c.name) ? "#" : initials(c.name)}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("truncate text-[13.5px]", c.unread > 0 && "font-semibold")}>
                      {/^\d+$/.test(c.name) ? fmtPhone(c.name) : c.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtRelativeShort(c.at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-[12.5px] text-muted-foreground", c.unread > 0 && "text-foreground/80")}>
                      {c.preview || c.company || "Sem mensagens"}
                    </span>
                    {c.unread > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-brand px-1.5 text-[10.5px] leading-[18px] font-medium text-white">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {!list.length && <li className="px-4 py-10 text-center text-[13px] text-muted-foreground">Nenhuma conversa aqui.</li>}
        </ul>
        <form action={startConversation} className="flex gap-2 border-t p-3">
          <Input name="phone" defaultValue={novo} placeholder="Nova conversa: (11) 9…" inputMode="tel" className="h-8 text-[13px]" />
          <button className="shrink-0 rounded-md bg-primary px-3 text-[12.5px] text-primary-foreground hover:bg-primary/85">Abrir</button>
        </form>
      </aside>

      {/* Conversa */}
      <section className={cn("min-h-0", !thread && "hidden lg:block")}>
        {thread ? (
          <Thread key={thread.conv.id} {...thread} />
        ) : (
          <div className="grid h-full place-items-center p-8">
            <EmptyState icon={MessageCircle} title="Selecione uma conversa">
              As mensagens do WhatsApp do estúdio chegam aqui. A Ana resume, sugere respostas e redige e-mails.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}
