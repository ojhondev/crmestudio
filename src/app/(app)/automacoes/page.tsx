import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { ensureBuiltinRules } from "@/lib/automations-engine";
import { fmtDateTime, todayISO } from "@/lib/format";
import { addDays } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { RuleBoard, RunNowButton, type RuleVM } from "./rules";

export const metadata: Metadata = { title: "Automações" };

export default async function AutomacoesPage({ searchParams }: PageProps<"/automacoes">) {
  const user = await requireAccess("configuracoes", "view");
  const canManage = has(user, "configuracoes", "manage");
  const sp = await searchParams;
  const aba = sp.aba === "registro" ? "registro" : "regras";
  await ensureBuiltinRules();

  const since = new Date(`${addDays(todayISO(), -30)}T00:00:00-03:00`);
  const [rules, users, stages, stats] = await Promise.all([
    db.select().from(schema.automationRules).orderBy(asc(schema.automationRules.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)),
    db.select({ id: schema.stages.id, name: schema.stages.name }).from(schema.stages).orderBy(asc(schema.stages.position)),
    db
      .select({ ruleId: schema.automationRuns.ruleId, n: sql<number>`count(*)::int`, last: sql<string>`max(${schema.automationRuns.at})` })
      .from(schema.automationRuns)
      .where(gte(schema.automationRuns.at, since))
      .groupBy(schema.automationRuns.ruleId),
  ]);
  const statOf = new Map(stats.map((s) => [s.ruleId, s]));
  const vms: RuleVM[] = rules.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    trigger: r.trigger,
    enabled: r.enabled,
    builtin: r.builtin,
    params: r.params ?? {},
    conditions: r.conditions ?? [],
    actions: r.actions ?? [],
    runs30: statOf.get(r.id)?.n ?? 0,
    lastRun: statOf.get(r.id)?.last ? new Date(statOf.get(r.id)!.last).toISOString() : null,
  }));

  const runs =
    aba === "registro"
      ? await db.select().from(schema.automationRuns).orderBy(desc(schema.automationRuns.at)).limit(200)
      : [];

  const tab = (key: string, label: string, href: string) => (
    <Link
      href={href}
      className={cn("rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors max-md:py-2.5", aba === key ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageToolbar
        title="Automações"
        filters={
          <div data-tour="auto-tabs" className="flex gap-1">
            {tab("regras", `Regras (${rules.filter((r) => r.enabled).length} ligadas)`, "/automacoes")}
            {tab("registro", "Registro", "/automacoes?aba=registro")}
          </div>
        }
        actions={canManage && aba === "regras" ? <RunNowButton /> : undefined}
      />
      <ToolArea>
        <div className="grid gap-4 p-3 sm:p-5">
          {aba === "regras" ? (
            <RuleBoard rules={vms} users={users} stages={stages} canManage={canManage} />
          ) : runs.length ? (
            <ul className="overflow-hidden rounded-xl border bg-card" data-tour="auto-log">
              {runs.map((r) => (
                <li key={r.id} className="grid gap-0.5 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[150px_1fr] sm:gap-4">
                  <span className="text-[12px] text-muted-foreground tabular-nums">{fmtDateTime(r.at)}</span>
                  <span className="grid gap-0.5 text-[13px] leading-snug">
                    <span>
                      <span className="font-medium">{r.ruleName}</span>
                      {r.entityLabel && <span className="text-muted-foreground"> · {r.entity === "tarefa" ? "tarefa" : "negócio"} “{r.entityLabel}”</span>}
                      {r.status === "erro" && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">com erro</span>}
                    </span>
                    <span className="text-[12.5px] break-words text-muted-foreground">{r.summary}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
              <p className="text-sm font-medium">Nenhuma execução registrada ainda</p>
              <p className="max-w-sm text-[13px] text-muted-foreground">Quando uma regra agir (avisar, atribuir, criar tarefa…), o que foi feito aparece aqui, com data e hora.</p>
            </div>
          )}
        </div>
      </ToolArea>
    </>
  );
}
