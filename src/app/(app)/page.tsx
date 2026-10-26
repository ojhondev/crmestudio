import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { ArrowRight, CalendarDays, Lock } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireUser } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { EVENT_TYPES } from "@/lib/constants";
import { fmtDate, fmtTime, money, moneyShort, todayISO } from "@/lib/format";
import { StartGuide } from "@/components/start-guide";
import { AvisosCard } from "@/components/avisos-card";
import { EditaisCard } from "@/components/editais-card";
import { PropostasCard } from "@/components/propostas-card";
import { dashboardPropostas } from "@/lib/propostas/server";
import { dashboardEditais } from "@/lib/editais/queries";
import { getAvisos } from "@/lib/avisos";
import { scheduleLazyTick } from "@/lib/automations-engine";
import { PageBody } from "@/components/page-header";
import { Section } from "@/components/crm/section";
import { TaskList } from "@/components/crm/tasks";
import { ANA_UI_ENABLED } from "@/lib/ana-flag";
import { AskAna } from "@/components/ana/ask-ana";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const canDeals = has(user, "negocios");
  const canAgenda = has(user, "agenda");
  const canFinance = has(user, "financeiro");
  const canEditais = has(user, "editais");
  const today = todayISO();
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00-03:00`);
  const dayStart = new Date(`${today}T00:00:00-03:00`);
  const in7 = new Date(dayStart.getTime() + 7 * 864e5);
  const in30 = new Date(dayStart.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const scope = dealScope(user);

  // cada bloco só consulta o banco se a pessoa tem acesso ao módulo correspondente
  const funnelQ = () =>
    db
      .select({
        id: schema.stages.id,
        name: schema.stages.name,
        color: schema.stages.color,
        kind: schema.stages.kind,
        n: sql<number>`count(${schema.deals.id})::int`,
        total: sql<number>`coalesce(sum(${schema.deals.valueCents}),0)::bigint`,
      })
      .from(schema.stages)
      .leftJoin(schema.deals, and(eq(schema.deals.stageId, schema.stages.id), scope))
      .groupBy(schema.stages.id)
      .orderBy(asc(schema.stages.position));
  const wonQ = () =>
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${schema.deals.valueCents}),0)::bigint` })
      .from(schema.deals)
      .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
      .where(and(eq(schema.stages.kind, "ganho"), gte(schema.deals.closedAt, monthStart), scope));
  const agendaQ = () =>
    db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        type: schema.events.type,
        startsAt: schema.events.startsAt,
        allDay: schema.events.allDay,
        location: schema.events.location,
      })
      .from(schema.events)
      .where(and(gte(schema.events.endsAt, dayStart), lt(schema.events.startsAt, in7), user.ownOnly ? eq(schema.events.userId, user.id) : undefined))
      .orderBy(asc(schema.events.startsAt))
      .limit(8);
  const tasksQ = () =>
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        dueAt: schema.tasks.dueAt,
        doneAt: schema.tasks.doneAt,
        dealId: schema.tasks.dealId,
        dealTitle: schema.deals.title,
      })
      .from(schema.tasks)
      .leftJoin(schema.deals, eq(schema.tasks.dealId, schema.deals.id))
      .where(and(eq(schema.tasks.assigneeId, user.id), isNull(schema.tasks.doneAt)))
      .orderBy(sql`${schema.tasks.dueAt} asc nulls last`)
      .limit(8);
  const receivableQ = () =>
    db
      .select({
        total: sql<number>`coalesce(sum(${schema.transactions.amountCents}),0)::bigint`,
        late: sql<number>`coalesce(sum(${schema.transactions.amountCents}) filter (where ${schema.transactions.dueDate} < ${today}),0)::bigint`,
      })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.kind, "receita"), isNull(schema.transactions.paidAt), lte(schema.transactions.dueDate, in30)));

  scheduleLazyTick(); // abrir o painel também "acorda" as regras de tempo (no máximo 1 rodada a cada 15 min)
  const [funnel, [won], agenda, myTasks, [receivable], avisos, editaisData, propostasData] = await Promise.all([
    canDeals ? funnelQ() : [],
    canDeals ? wonQ() : [],
    canAgenda ? agendaQ() : [],
    tasksQ(),
    canFinance ? receivableQ() : [],
    getAvisos(user),
    canEditais ? dashboardEditais().catch(() => null) : null,
    canEditais ? dashboardPropostas().catch(() => null) : null,
  ]);

  const open = funnel.filter((s) => s.kind === "aberto");
  const openTotal = open.reduce((s, x) => s + Number(x.total), 0);
  const openCount = open.reduce((s, x) => s + x.n, 0);
  const maxStage = Math.max(1, ...open.map((s) => Number(s.total)));
  const hour = Number(fmtTime(new Date()).slice(0, 2));
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <>
      <header className="flex flex-col gap-5 px-5 pt-8 pb-6 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:px-10">
        <div className="min-w-0">
          <p className="label mb-2 capitalize">{fmtDate(today, "EEEE, d 'de' MMMM")}</p>
          <h1 className="h-display text-[34px] sm:text-[40px]">
            {hello}, {user.name.split(" ")[0]}.
          </h1>
        </div>
        <AvisosCard data={avisos} />
      </header>

      <PageBody className="grid gap-5">
        {sp.negado && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <Lock className="size-4 shrink-0" /> Você não tem acesso a essa área. Se precisar dela, peça a um administrador.
          </div>
        )}

        <StartGuide
          actions={[
      has(user, "contatos", "edit") && { href: "/contatos", t: "Cadastrar um lead", d: "Guarde nome, contato e origem de quem pediu um orçamento." },
      has(user, "tarefas", "edit") && { href: "/tarefas", t: "Criar uma tarefa", d: "Organize o que precisa ser feito, com responsável e prazo." },
      has(user, "negocios") && { href: "/negocios", t: "Acompanhar o funil", d: "Arraste os negócios entre as etapas conforme avançam." },
      has(user, "documentos", "edit") && { href: "/documentos", t: "Gerar um contrato", d: "Escolha um modelo; os dados do cliente entram sozinhos." },
      has(user, "editais") && { href: "/editais/como-usar", t: "Aprender a usar os Editais", d: "Radar, propostas passo a passo, acervo e parceiros." },
      { href: "/notificacoes", t: "Conferir seus avisos", d: "Atrasos, prazos e leads parados chegam no sino e no quadro Avisos." },
          ].filter(Boolean) as { href: string; t: string; d: string }[]}
        />

        <div data-tour="dash-kpis" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {canDeals && <Kpi label="No funil" value={moneyShort(openTotal)} sub={`${openCount} negócios em andamento`} href="/negocios" />}
          {canDeals && <Kpi label="Fechado no mês" value={moneyShort(Number(won?.total ?? 0))} sub={`${won?.n ?? 0} negócios ganhos`} href="/negocios" />}
          {canFinance && (
            <Kpi
              label="A receber · 30 dias"
              value={moneyShort(Number(receivable?.total ?? 0))}
              sub={Number(receivable?.late) ? `${money(Number(receivable?.late))} em atraso` : "nada em atraso"}
              alert={Number(receivable?.late) > 0}
              href="/financeiro/lancamentos?v=abertos"
            />
          )}
          {canAgenda && (!canDeals || !canFinance) && (
            <Kpi label="Próximos 7 dias" value={String(agenda.length)} sub="compromissos na agenda" href="/agenda" />
          )}
        </div>

        {propostasData && <PropostasCard data={propostasData} />}

        {editaisData && <EditaisCard data={editaisData} />}

        {ANA_UI_ENABLED && <AskAna />}

        <div className="grid items-start gap-5 lg:grid-cols-3">
          {canDeals && (
            <Section
              tour="dash-funnel"
              title="Funil"
              className="lg:col-span-2"
              action={
                <Link href="/negocios" className="flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-md:min-h-10">
                  Abrir quadro <ArrowRight className="size-3" />
                </Link>
              }
            >
              <div className="grid gap-2.5">
                {open.map((s) => (
                  <div key={s.id} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[170px_1fr_auto]">
                    <span className="flex items-center gap-2 truncate">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${(Number(s.total) / maxStage) * 100}%`, background: s.color }} />
                    </div>
                    <span className="num w-28 text-right text-[12.5px] text-muted-foreground">
                      {s.n} · {moneyShort(Number(s.total))}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Minhas tarefas">
            <TaskList
              compose={false}
              showDeal
              tasks={myTasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null, doneAt: t.doneAt?.toISOString() ?? null }))}
            />
          </Section>

          {canAgenda && (
            <Section
              title="Próximos 7 dias"
              className={canDeals ? "lg:col-span-1" : "lg:col-span-2"}
              action={
                <Link href="/agenda" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground max-md:size-11" aria-label="Agenda">
                  <CalendarDays className="size-4" />
                </Link>
              }
            >
              {agenda.length ? (
                <ul className="grid gap-3">
                  {agenda.map((e) => (
                    <li key={e.id} className="flex gap-3 text-[13px]">
                      <span className="w-12 shrink-0 text-xs leading-tight text-muted-foreground">
                        <span className="block capitalize">{fmtDate(e.startsAt, "EEE")}</span>
                        {e.allDay ? "dia" : fmtTime(e.startsAt)}
                      </span>
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: EVENT_TYPES[e.type]?.color }} />
                      <span className="grid leading-tight">
                        <span>{e.title}</span>
                        {e.location && <span className="text-xs text-muted-foreground">{e.location}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">Agenda livre.</p>
              )}
            </Section>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Kpi({ label, value, sub, href, alert }: { label: string; value: string; sub: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="group grid gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <span className="label">{label}</span>
      <span className="num-xl text-[25px] whitespace-nowrap sm:text-[30px]">{value}</span>
      <span className={alert ? "text-[12px] text-brand" : "text-[12px] text-muted-foreground"}>{sub}</span>
    </Link>
  );
}
