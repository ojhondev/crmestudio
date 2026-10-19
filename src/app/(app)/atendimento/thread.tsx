"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CircleCheck,
  Clock,
  FlaskConical,
  Loader2,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  StickyNote,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtTime, sameDayBR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SimpleSelect } from "@/components/form";
import { AnaText } from "@/components/ana/ana-text";
import { useAnaStream } from "@/components/ana/use-ana-stream";
import { EmailDraftButton } from "@/components/ana/email-draft";
import { AnaFocusSetter } from "@/components/ana/ana-provider";
import { cn } from "@/lib/utils";
import { assignConversation, markRead, sendMessage, setStatus, simulateInbound } from "./actions";

type Msg = { id: string; direction: "in" | "out" | "note"; body: string; status: string | null; createdAt: string; author: string | null };

export function Thread({
  conv,
  messages,
  team,
  deals,
  connected,
  canEdit = true,
}: {
  conv: {
    id: string;
    name: string;
    phoneLabel: string;
    phone: string;
    status: "aberta" | "resolvida";
    unread: number;
    assigneeId: string | null;
    contactId: string | null;
    company: string | null;
    email: string | null;
    windowOpen: boolean;
  };
  messages: Msg[];
  team: { id: string; name: string }[];
  deals: { id: string; title: string; stage: string; color: string; valueLabel: string }[];
  connected: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const [pending, start] = useTransition();
  const [sideOpen, setSideOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // marca como lida ao abrir
  useEffect(() => {
    if (conv.unread > 0) markRead(conv.id);
  }, [conv.id, conv.unread]);

  // atualiza a conversa a cada 6s enquanto a aba estiver visível
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 6000);
    return () => clearInterval(t);
  }, [router]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const res = await sendMessage(conv.id, body, note);
      if (res?.error) toast.error(res.error);
      else {
        setText("");
        router.refresh();
      }
    });
  }

  const side = (
    <SidePanel conv={conv} deals={deals} connected={connected} onUseReply={(r) => (setText(r), setNote(false), setSideOpen(false))} />
  );

  return (
    <div className="flex h-full min-h-0 max-lg:fixed max-lg:inset-0 max-lg:z-[45] max-lg:h-auto max-lg:bg-background">
      <AnaFocusSetter kind="conversation" id={conv.id} label={conv.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-4 lg:pt-3">
          <Link href="/atendimento" className="-ml-1 grid size-8 place-items-center rounded-md hover:bg-muted lg:hidden" aria-label="Voltar">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="grid min-w-0 flex-1 leading-tight">
            {conv.contactId ? (
              <Link href={`/contatos/${conv.contactId}`} className="truncate text-[14.5px] font-medium hover:underline">
                {conv.name}
              </Link>
            ) : (
              <span className="truncate text-[14.5px] font-medium">{conv.name}</span>
            )}
            <span className="truncate text-[12px] text-muted-foreground">
              {conv.phoneLabel}
              {conv.company && ` · ${conv.company}`}
            </span>
          </div>
          <div className={cn("hidden w-40 sm:block", !canEdit && "sm:hidden")}>
            <SimpleSelect
              options={team.map((u) => ({ value: u.id, label: u.name }))}
              defaultValue={conv.assigneeId}
              allowNone
              noneLabel="Sem responsável"
              onValueChange={(v) => start(() => assignConversation(conv.id, v === "__none" ? null : v))}
              className="h-8 text-[12.5px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit}
            onClick={() =>
              start(async () => {
                await setStatus(conv.id, conv.status === "aberta" ? "resolvida" : "aberta");
                toast.success(conv.status === "aberta" ? "Conversa resolvida" : "Conversa reaberta");
              })
            }
          >
            {conv.status === "aberta" ? <CircleCheck /> : <RotateCcw />}
            <span className="hidden sm:inline">{conv.status === "aberta" ? "Resolver" : "Reabrir"}</span>
          </Button>
          <Button variant="outline" size="sm" className="xl:hidden" data-tour="thread-ana-button" onClick={() => setSideOpen(true)}>
            <Sparkles className="text-brand" /> Ana
          </Button>
        </header>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-muted/50 px-4 py-5 sm:px-8">
          <div className="mx-auto grid max-w-3xl gap-1.5">
            {messages.map((m, i) => {
              const date = new Date(m.createdAt);
              const prev = messages[i - 1];
              const newDay = !prev || !sameDayBR(prev.createdAt, date);
              return (
                <div key={m.id} className="grid gap-1.5">
                  {newDay && (
                    <p className="my-3 justify-self-center rounded-full bg-card px-3 py-1 text-xs text-muted-foreground">
                      {fmtDate(date, "EEEE, d 'de' MMMM")}
                    </p>
                  )}
                  <Bubble m={m} />
                </div>
              );
            })}
            {!messages.length && <p className="py-10 text-center text-[13px] text-muted-foreground">Nenhuma mensagem ainda.</p>}
            <div ref={endRef} />
          </div>
        </div>

        {!canEdit && (
          <div data-tour="thread-composer" className="safe-bottom border-t bg-card p-3 text-center text-[12.5px] text-muted-foreground">
            Você tem acesso somente leitura ao Atendimento.
          </div>
        )}
        <div data-tour="thread-composer" className={cn("safe-bottom border-t bg-card p-3", !canEdit && "hidden")}>
          {!conv.windowOpen && !note && (
            <p className="mb-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <Clock className="size-3.5" /> Passaram 24h desde a última mensagem do cliente: a Meta só libera texto livre depois que ele escrever de novo.
            </p>
          )}
          <div className={cn("rounded-xl border transition-colors", note && "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10")}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={note ? "Nota interna (o cliente não vê)…" : "Escreva uma mensagem…"}
              rows={2}
              className="max-h-48 min-h-[56px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center gap-1 px-2 pb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNote((v) => !v)}
                className={cn("text-muted-foreground", note && "bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/20")}
              >
                <StickyNote /> Nota
              </Button>
              {!connected && <SimulateButton conversationId={conv.id} />}
              <Button onClick={send} disabled={pending || !text.trim()} size="sm" className="ml-auto">
                {pending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
                {note ? "Salvar nota" : "Enviar"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <aside data-tour="thread-side" className="thin-scroll hidden w-[340px] shrink-0 overflow-y-auto border-l bg-card xl:block">{side}</aside>
      <Sheet open={sideOpen} onOpenChange={setSideOpen}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">Ana e contato</SheetTitle>
          {side}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const time = fmtTime(m.createdAt);
  if (m.direction === "note")
    return (
      <div className="my-1 justify-self-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 sm:max-w-[80%]">
        <span className="font-medium">Nota de {m.author ?? "equipe"}:</span> <span className="whitespace-pre-wrap">{m.body}</span>
        <span className="ml-2 text-xs text-amber-700/70 dark:text-amber-300/60">{time}</span>
      </div>
    );
  const out = m.direction === "out";
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug sm:max-w-[70%]",
        out ? "justify-self-end rounded-br-md bg-primary text-primary-foreground" : "justify-self-start rounded-bl-md bg-card",
      )}
    >
      <p className="whitespace-pre-wrap">{m.body}</p>
      <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-xs", out ? "text-primary-foreground/60" : "text-muted-foreground")}>
        {out && m.author && <span className="mr-auto pr-3">{m.author.split(" ")[0]}</span>}
        {time}
        {out &&
          (m.status === "read" ? (
            <CheckCheck className="size-3 text-sky-300" />
          ) : m.status === "delivered" ? (
            <CheckCheck className="size-3" />
          ) : m.status === "failed" ? (
            <span className="text-red-300">falhou</span>
          ) : (
            <Check className="size-3" />
          ))}
      </p>
    </div>
  );
}

function SimulateButton({ conversationId }: { conversationId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      title="Modo simulado: cria uma mensagem como se o cliente tivesse escrito"
      disabled={pending}
      onClick={() => {
        const t = window.prompt("Mensagem do cliente (simulação):", "Olá! Gostaria de saber sobre o orçamento.");
        if (t)
          start(async () => {
            await simulateInbound(conversationId, t);
            router.refresh();
          });
      }}
    >
      <FlaskConical /> Simular cliente
    </Button>
  );
}

function SidePanel({
  conv,
  deals,
  connected,
  onUseReply,
}: {
  conv: { id: string; contactId: string | null; email: string | null; name: string };
  deals: { id: string; title: string; stage: string; color: string; valueLabel: string }[];
  connected: boolean;
  onUseReply: (text: string) => void;
}) {
  const summary = useAnaStream();
  const reply = useAnaStream();
  const [hint, setHint] = useState("");

  return (
    <div className="grid gap-6 p-5">
      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
            <Sparkles className="size-3.5" />
          </span>
          <h2 className="text-[14px] font-medium">Ana</h2>
        </div>

        <div className="grid gap-2 rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <span className="label">Resumo</span>
            <Button size="xs" variant="ghost" disabled={summary.loading} onClick={() => summary.run({ mode: "summary", conversationId: conv.id })}>
              {summary.loading ? <Loader2 className="animate-spin" /> : <Wand2 />} {summary.text ? "Refazer" : "Resumir"}
            </Button>
          </div>
          {summary.text ? (
            <AnaText text={summary.text} className="text-[12.5px]" />
          ) : (
            <p className="text-[12px] text-muted-foreground">Resumo da conversa, o que o cliente quer e próximos passos.</p>
          )}
        </div>

        <div className="grid gap-2 rounded-xl border p-3">
          <span className="label">Sugerir resposta</span>
          <Textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            rows={2}
            placeholder="Opcional: “confirmar visita na quinta”, “explicar que o laudo vem antes do orçamento”…"
            className="min-h-0 resize-none text-[12.5px]"
          />
          <Button
            size="sm"
            className="bg-brand hover:bg-brand/85"
            disabled={reply.loading}
            onClick={() => reply.run({ mode: "reply", conversationId: conv.id, hint: hint || undefined })}
          >
            {reply.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Sugerir
          </Button>
          {reply.text && (
            <div className="grid gap-2 rounded-lg bg-muted/60 p-2.5">
              <p className="text-[12.5px] whitespace-pre-wrap">{reply.text}</p>
              {!reply.loading && (
                <Button size="xs" variant="outline" className="w-fit bg-card" onClick={() => onUseReply(reply.text.trim())}>
                  Usar no campo de mensagem
                </Button>
              )}
            </div>
          )}
        </div>

        <EmailDraftButton conversationId={conv.id} to={conv.email} size="sm" />
      </section>

      <section className="grid gap-2">
        <span className="label">Negócios</span>
        {deals.map((d) => (
          <Link key={d.id} href={`/negocios/${d.id}`} className="grid rounded-lg border px-3 py-2 leading-tight hover:border-foreground/20">
            <span className="text-[13px] font-medium">{d.title}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ background: d.color }} /> {d.stage} · {d.valueLabel}
            </span>
          </Link>
        ))}
        {!deals.length && <p className="text-[12.5px] text-muted-foreground">Nenhum negócio com este contato.</p>}
        {conv.contactId && (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href={`/contatos/${conv.contactId}`}>Ver ficha do contato</Link>
          </Button>
        )}
      </section>

      {!connected && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          WhatsApp em <strong>modo simulado</strong>: as mensagens ficam só no app até a Cloud API ser conectada em Ajustes.
        </p>
      )}
    </div>
  );
}
