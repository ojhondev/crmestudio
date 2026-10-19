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
}: {
  tasks: TaskRow[];
  dealId?: string;
  contactId?: string | null;
  showDeal?: boolean;
  compose?: boolean;
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
              className="grid size-6 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:size-10 max-md:opacity-100"
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
