"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Link2, Loader2, Plus, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "@/components/form";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { TaskColumn, TaskGroup, TaskRecur } from "@/lib/db/schema";
import { RECUR_LABEL, type TaskDTO } from "@/lib/tasks";
import { addTaskComment, getTaskFeed, type FeedItem } from "./actions";
import { Assignee, CustomCell, DueInput, LabelChip, PRIORITY, Pill, STATUS, type Patch, type User } from "./task-bits";

type Props = {
  task: TaskDTO | null;
  users: User[];
  canEdit: boolean;
  boardName: string | null | undefined;
  groups: TaskGroup[];
  columns: TaskColumn[];
  knownLabels: string[];
  onClose: () => void;
  patch: Patch;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
};

export function TaskSheet(props: Props) {
  const { task, boardName, onClose } = props;
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {task && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-left">{task.title}</SheetTitle>
              <SheetDescription>
                {boardName ? `Quadro: ${boardName}` : "Tarefa avulsa"}
                {task.dealTitle ? ` · Negócio: ${task.dealTitle}` : ""}
              </SheetDescription>
            </SheetHeader>
            <Body key={task.id} {...props} task={task} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({ task, users, canEdit, groups, columns, knownLabels, patch, remove, duplicate }: Props & { task: TaskDTO }) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [newSub, setNewSub] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const subs = task.subtasks;
  const doneSubs = subs.filter((s) => s.done).length;

  return (
    <div className="grid gap-5 px-4 pb-8">
      {canEdit && (
        <Input
          aria-label="Título da tarefa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && patch(task.id, { title })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="font-medium"
        />
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Situação">
          <Pill label="Situação" value={task.status} options={STATUS} disabled={!canEdit} onChange={(v) => patch(task.id, { status: v })} wide />
        </Field>
        <Field label="Prioridade">
          <Pill label="Prioridade" value={task.priority} options={PRIORITY} disabled={!canEdit} onChange={(v) => patch(task.id, { priority: v })} wide />
        </Field>
        <Field label="Responsável">
          <Assignee t={task} users={users} disabled={!canEdit} onChange={(v) => patch(task.id, { assigneeId: v })} />
        </Field>
        <Field label="Prazo">
          <DueInput t={task} disabled={!canEdit} onChange={(v) => patch(task.id, { dueAt: v })} />
        </Field>
        {task.boardId && groups.some((g) => g.boardId === task.boardId) && (
          <Field label="Grupo">
            <select value={task.groupId ?? ""} disabled={!canEdit} onChange={(e) => patch(task.id, { groupId: e.target.value })} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-[14px] max-md:h-10">
              {groups
                .filter((g) => g.boardId === task.boardId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Repetir">
          <span className="relative inline-flex items-center gap-1.5">
            <Repeat className="size-3.5 text-muted-foreground" />
            <select
              aria-label="Repetir"
              value={task.recur ?? ""}
              disabled={!canEdit}
              onChange={(e) => patch(task.id, { recur: e.target.value || null })}
              className="h-9 rounded-lg border border-input bg-background px-2 text-[14px] max-md:h-10"
            >
              <option value="">Não repete</option>
              {(Object.keys(RECUR_LABEL) as TaskRecur[]).map((r) => (
                <option key={r} value={r}>
                  {RECUR_LABEL[r]}
                </option>
              ))}
            </select>
          </span>
        </Field>
      </div>
      {task.recur && <p className="-mt-3 text-[12px] text-muted-foreground">Ao concluir, a próxima tarefa é criada sozinha com o prazo seguinte (precisa ter prazo).</p>}

      {columns.length > 0 && (
        <section className="grid gap-2">
          <h3 className="label">Campos do quadro</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {columns.map((c) => (
              <Field key={c.id} label={c.name}>
                <CustomCell col={c} value={task.custom[c.id]} users={users} disabled={!canEdit} onChange={(v) => patch(task.id, { custom: { [c.id]: v } })} />
              </Field>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="label">Etiquetas</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {task.labels.map((l) => (
            <LabelChip key={l} label={l} onRemove={canEdit ? () => patch(task.id, { labels: task.labels.filter((x) => x !== l) }) : undefined} />
          ))}
          {canEdit && (
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const v = newLabel.trim();
                if (v && !task.labels.includes(v)) patch(task.id, { labels: [...task.labels, v] });
                setNewLabel("");
              }}
            >
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} list="task-labels" placeholder="Nova etiqueta" aria-label="Nova etiqueta" className="h-7 w-32 text-[12.5px]" />
              <datalist id="task-labels">
                {knownLabels
                  .filter((l) => !task.labels.includes(l))
                  .map((l) => (
                    <option key={l} value={l} />
                  ))}
              </datalist>
            </form>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className="flex items-center gap-2 label">
          Checklist
          {subs.length > 0 && (
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              {doneSubs}/{subs.length}
            </span>
          )}
        </h3>
        {subs.length > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success" style={{ width: `${(doneSubs / subs.length) * 100}%` }} />
          </div>
        )}
        <ul className="grid gap-0.5">
          {subs.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={s.done}
                disabled={!canEdit}
                aria-label={s.text}
                onChange={(e) => patch(task.id, { subtasks: subs.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)) })}
                className="size-4 shrink-0 accent-brand"
              />
              <span className={cn("min-w-0 flex-1 text-[13.5px]", s.done && "text-muted-foreground line-through")}>{s.text}</span>
              {canEdit && (
                <button type="button" aria-label="Remover item" onClick={() => patch(task.id, { subtasks: subs.filter((x) => x.id !== s.id) })} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive max-md:opacity-100">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newSub.trim();
              if (v) patch(task.id, { subtasks: [...subs, { id: crypto.randomUUID().slice(0, 8), text: v, done: false }] });
              setNewSub("");
            }}
          >
            <Plus className="size-4 text-muted-foreground" />
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Adicionar item — digite e tecle Enter" aria-label="Novo item do checklist" className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-muted-foreground focus:outline-none" />
          </form>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="label">Anexos (links)</h3>
        <ul className="grid gap-1">
          {task.links.map((l) => (
            <li key={l.id} className="group flex items-center gap-2 text-[13.5px]">
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
              <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-brand underline-offset-2 hover:underline">
                {l.name}
              </a>
              {canEdit && (
                <button type="button" aria-label={`Remover ${l.name}`} onClick={() => patch(task.id, { links: task.links.filter((x) => x.id !== l.id) })} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive max-md:opacity-100">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form
            className="flex flex-wrap gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const url = /^https?:\/\//i.test(linkUrl.trim()) ? linkUrl.trim() : `https://${linkUrl.trim()}`;
              if (!linkUrl.trim()) return;
              patch(task.id, { links: [...task.links, { id: crypto.randomUUID().slice(0, 8), url, name: linkName.trim() }] });
              setLinkUrl("");
              setLinkName("");
            }}
          >
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Cole o link (Drive, foto, documento…)" aria-label="Link do anexo" className="h-8 min-w-40 flex-1 text-[13px]" />
            <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nome (opcional)" aria-label="Nome do anexo" className="h-8 w-32 text-[13px]" />
            <Button type="submit" size="sm" variant="outline" disabled={!linkUrl.trim()}>
              Anexar
            </Button>
          </form>
        )}
      </section>

      <Field label="Descrição e anotações">
        <Textarea rows={5} value={desc} disabled={!canEdit} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (task.description ?? "") && patch(task.id, { description: desc })} placeholder="Detalhes, o que falta fazer…" />
      </Field>

      <Feed taskId={task.id} canEdit={canEdit} refreshKey={`${task.status}|${task.assigneeId}|${task.dueAt}|${task.priority}|${task.groupId}`} />

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {task.dealId && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/negocios/${task.dealId}`}>
              <Link2 /> Abrir o negócio
            </Link>
          </Button>
        )}
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => duplicate(task.id)}>
            <Copy /> Duplicar
          </Button>
        )}
        {canEdit && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => window.confirm("Excluir esta tarefa?") && remove(task.id)}>
            <Trash2 /> Excluir
          </Button>
        )}
      </div>
    </div>
  );
}

function Feed({ taskId, canEdit, refreshKey }: { taskId: string; canEdit: boolean; refreshKey: string }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // espera um instante para a atividade da última alteração já estar gravada
    const id = setTimeout(() => {
      getTaskFeed(taskId).then((r) => alive && "items" in r && setItems(r.items));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [taskId, refreshKey]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await addTaskComment(taskId, text);
    setBusy(false);
    if ("error" in r) return void toast.error(r.error);
    setItems((a) => [r.item, ...(a ?? [])]);
    setText("");
  }

  return (
    <section className="grid gap-2">
      <h3 className="label">Comentários e atividade</h3>
      {canEdit && (
        <div className="grid gap-1.5">
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva um comentário…" aria-label="Novo comentário" />
          <Button type="button" size="sm" className="w-fit" disabled={busy || !text.trim()} onClick={send}>
            {busy && <Loader2 className="animate-spin" />} Comentar
          </Button>
        </div>
      )}
      {items === null ? (
        <p className="text-[12.5px] text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">Sem comentários nem alterações ainda.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((i) =>
            i.kind === "comentario" ? (
              <li key={i.id} className="rounded-lg border bg-muted/40 px-3 py-2 text-[13.5px]">
                <p className="text-xs text-muted-foreground">
                  <strong className="font-semibold text-foreground">{i.userName ?? "Alguém"}</strong> · {fmtDate(i.at, "dd/MM HH:mm")}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{i.body}</p>
              </li>
            ) : (
              <li key={i.id} className="px-1 text-[12.5px] text-muted-foreground">
                <strong className="font-medium text-foreground/80">{i.userName ?? "Sistema"}</strong> {i.body} · {fmtDate(i.at, "dd/MM HH:mm")}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
