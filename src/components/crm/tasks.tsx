"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { addTask, deleteTask, toggleTask } from "@/app/(app)/negocios/actions";

export type TaskRow = {
  id: string;
  title: string;
  dueAt: string | null;
  doneAt: string | null;
  status?: "a_fazer" | "em_andamento" | "travada" | "concluida";
  priority?: "baixa" | "media" | "alta" | "urgente";
  dealId?: string | null;
  dealTitle?: string | null;
};

export function TaskList({
  tasks,
  dealId,
  contactId,
  showDeal,
  compose = true,
  variant = "list",
}: {
  tasks: TaskRow[];
  dealId?: string;
  contactId?: string | null;
  showDeal?: boolean;
  compose?: boolean;
  /** "grouped": tela larga, com progresso e as tarefas agrupadas pelo prefixo do título ("Analisar: …") */
  variant?: "list" | "grouped";
}) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, { id, done }: { id: string; done: boolean }) =>
    state.map((t) => (t.id === id ? { ...t, doneAt: done ? new Date().toISOString() : null } : t)),
  );
  const [, start] = useTransition();
  const [state, action, pending] = useActionState(addTask, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const [now] = useState(() => Date.now());

  if (variant === "grouped") {
    const done = optimistic.filter((t) => t.doneAt).length;
    const pct = optimistic.length ? Math.round((done / optimistic.length) * 100) : 0;
    // grupo = texto antes de ": " no título (ex.: "Analisar: Ler o edital" → "Analisar"); sem prefixo vai para "Outras"
    const groups = new Map<string, TaskRow[]>();
    for (const t of optimistic) {
      const m = /^([^:]{2,28}):\s+\S/.exec(t.title);
      const key = m ? m[1].trim() : "Outras";
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const fmtDay = (iso: string) => fmtDateTime(iso);
    return (
      <div className="grid gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-semibold">
              {done} de {optimistic.length} concluídas
            </p>
            <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das tarefas">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {compose && (
            <form ref={ref} action={action} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
              {dealId && <input type="hidden" name="dealId" value={dealId} />}
              {contactId && <input type="hidden" name="contactId" value={contactId} />}
              <Input name="title" placeholder="Nova tarefa — o que precisa ser feito?" aria-label="Título da nova tarefa" className="h-10 text-[13px]" />
              <Input name="dueAt" type="datetime-local" aria-label="Prazo (opcional)" className="h-10 text-[13px] text-muted-foreground" />
              <Button variant="outline" disabled={pending} className="h-10" aria-label="Adicionar tarefa">
                <Plus /> Adicionar
              </Button>
            </form>
          )}
        </div>
        {!optimistic.length && <p className="px-1 text-[13px] text-muted-foreground">Nenhuma tarefa ainda.</p>}
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {[...groups].map(([name, rows]) => {
            const gDone = rows.filter((r) => r.doneAt).length;
            return (
              <section key={name} className="rounded-xl border bg-card">
                <header className="flex items-center gap-2 border-b px-4 py-2.5">
                  <h3 className="text-[13px] font-semibold">{name}</h3>
                  <span className={cn("ml-auto rounded-full px-2 py-px text-xs font-semibold tabular-nums", gDone === rows.length ? "bg-brand-soft text-brand" : "bg-secondary text-foreground")}>
                    {gDone}/{rows.length}
                  </span>
                </header>
                <ul className="divide-y">
                  {rows.map((t) => {
                    const late = !t.doneAt && t.dueAt && new Date(t.dueAt).getTime() < now;
                    const title = name === "Outras" ? t.title : t.title.replace(/^[^:]{2,28}:\s+/, "");
                    return (
                      <li key={t.id} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 max-md:py-3">
                        <Checkbox
                          className="mt-0.5 max-md:mt-1"
                          checked={!!t.doneAt}
                          onCheckedChange={(v) =>
                            start(async () => {
                              setOptimistic({ id: t.id, done: !!v });
                              await toggleTask(t.id, !!v);
                            })
                          }
                        />
                        <div className="grid min-w-0 flex-1 gap-0.5 leading-snug">
                          <span className={cn("text-[13.5px]", t.doneAt && "text-muted-foreground line-through")}>{title}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className={cn(late && "font-medium text-destructive")}>{t.dueAt ? `${late ? "Atrasada · " : ""}${fmtDay(t.dueAt)}` : "sem prazo"}</span>
                            {!t.doneAt && t.status === "em_andamento" && <span>· em andamento</span>}
                            {!t.doneAt && t.status === "travada" && <span className="font-medium text-destructive">· travada</span>}
                            {!t.doneAt && t.priority === "urgente" && <span className="font-medium text-destructive">· urgente</span>}
                            {!t.doneAt && t.priority === "alta" && <span className="font-medium text-foreground">· prioridade alta</span>}
                          </span>
                        </div>
                        <button
                          aria-label="Excluir tarefa"
                          onClick={() => start(() => deleteTask(t.id))}
                          className="grid size-6 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:size-11 max-md:opacity-100"
                        >
                          <X className="size-3.5 text-muted-foreground" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      {optimistic.map((t) => {
        const late = !t.doneAt && t.dueAt && new Date(t.dueAt).getTime() < now;
        return (
          <div key={t.id} className="group flex items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/60">
            <Checkbox
              className="mt-0.5 max-md:mt-2"
              checked={!!t.doneAt}
              onCheckedChange={(v) =>
                start(async () => {
                  setOptimistic({ id: t.id, done: !!v });
                  await toggleTask(t.id, !!v);
                })
              }
            />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className={cn("text-[13px]", t.doneAt && "text-muted-foreground line-through")}>{t.title}</span>
              <span className={cn("text-xs text-muted-foreground", late && "text-destructive")}>
                {t.dueAt ? fmtDateTime(t.dueAt) : "sem prazo"}
                {!t.doneAt && t.status === "em_andamento" && " · em andamento"}
                {!t.doneAt && t.status === "travada" && <span className="font-medium text-destructive"> · travada</span>}
                {!t.doneAt && t.priority === "urgente" && <span className="font-medium text-destructive"> · urgente</span>}
                {!t.doneAt && t.priority === "alta" && <span className="font-medium"> · prioridade alta</span>}
                {showDeal && t.dealTitle && t.dealId && (
                  <>
                    {" · "}
                    <Link href={`/negocios/${t.dealId}`} className="hover:underline">
                      {t.dealTitle}
                    </Link>
                  </>
                )}
              </span>
            </div>
            <button
              aria-label="Excluir tarefa"
              onClick={() => start(() => deleteTask(t.id))}
              className="grid size-6 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:size-11 max-md:opacity-100"
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        );
      })}
      {!optimistic.length && <p className="px-1 py-1 text-[13px] text-muted-foreground">Nenhuma tarefa. {compose ? "Escreva abaixo o que precisa ser feito e toque em +." : ""}</p>}
      {compose && (
        <form ref={ref} action={action} className="mt-2 grid gap-1.5">
          {dealId && <input type="hidden" name="dealId" value={dealId} />}
          {contactId && <input type="hidden" name="contactId" value={contactId} />}
          <div className="flex gap-1.5">
            <Input name="title" placeholder="Nova tarefa — o que precisa ser feito?" aria-label="Título da nova tarefa" className="h-8 text-[13px]" />
            <Button size="icon" variant="outline" disabled={pending} aria-label="Adicionar tarefa">
              <Plus />
            </Button>
          </div>
          <Input name="dueAt" type="datetime-local" aria-label="Prazo (opcional)" className="h-8 text-[13px] text-muted-foreground" />
        </form>
      )}
    </div>
  );
}
