"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Copy, Eraser, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnaText } from "./ana-text";
import { useAnaStream } from "./use-ana-stream";
import type { AnaFocus } from "./ana-provider";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Como está o funil esta semana?",
  "Quais clientes estão esperando resposta?",
  "O que tenho na agenda nos próximos dias?",
  "Tem alguma conta vencida ou vencendo?",
];

const STORAGE = "ana:chat";

export function AnaSheet({
  open,
  onOpenChange,
  sendRef,
  focus,
  enabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sendRef: React.RefObject<((q: string) => void) | null>;
  focus: AnaFocus | null;
  enabled: boolean;
}) {
  // Histórico só nesta aba do navegador (não é dado do negócio).
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return typeof window === "undefined" ? [] : JSON.parse(sessionStorage.getItem(STORAGE) || "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const { loading, run, stop } = useAnaStream();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(msgs.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    await run({ mode: "chat", messages: history, focus: focus ? { kind: focus.kind, id: focus.id } : null }, (full) =>
      setMsgs([...history, { role: "assistant", content: full }]),
    );
  }

  // o provider chama isto quando alguém abre a Ana já com uma pergunta
  useEffect(() => {
    sendRef.current = send;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand">
              <Sparkles className="size-4" />
            </span>
            <div className="grid">
              <SheetTitle className="text-base font-medium">Ana</SheetTitle>
              <SheetDescription className="text-xs">
                Copiloto do estúdio — lê o CRM, a agenda e o atendimento.
              </SheetDescription>
            </div>
            {msgs.length > 0 && (
              <Button variant="ghost" size="icon-sm" className="mr-8 ml-auto" aria-label="Limpar conversa" onClick={() => setMsgs([])}>
                <Eraser />
              </Button>
            )}
          </div>
          {focus && (
            <p className="mt-2 w-fit rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              Olhando: <span className="text-foreground">{focus.label}</span>
            </p>
          )}
        </SheetHeader>

        <div className="thin-scroll flex-1 overflow-y-auto px-5 py-5">
          {!enabled && (
            <p className="mb-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              A Ana ainda não está conectada: falta configurar a chave <code>ANTHROPIC_API_KEY</code> no servidor.
            </p>
          )}
          {msgs.length === 0 ? (
            <div className="grid gap-5 pt-6">
              <p className="font-serif text-xl leading-snug">Olá! Em que posso ajudar hoje?</p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-10 justify-self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[13.5px] text-primary-foreground">
                    {m.content}
                  </div>
                ) : (
                  <div key={i} className="group grid gap-1.5">
                    {m.content ? (
                      <AnaText text={m.content} />
                    ) : (
                      <span className="flex gap-1 py-2">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="size-1.5 animate-pulse rounded-full bg-brand/60" style={{ animationDelay: `${d * 150}ms` }} />
                        ))}
                      </span>
                    )}
                    {m.content && !(loading && i === msgs.length - 1) && (
                      <button
                        className="flex w-fit items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                        onClick={() => navigator.clipboard.writeText(m.content).then(() => toast.success("Copiado"))}
                      >
                        <Copy className="size-3" /> copiar
                      </button>
                    )}
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form
          className="border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Pergunte ou peça um rascunho…"
              rows={2}
              className="min-h-[52px] resize-none pr-12 text-[13.5px]"
            />
            <Button
              type={loading ? "button" : "submit"}
              size="icon-sm"
              onClick={loading ? stop : undefined}
              className={cn("absolute right-2 bottom-2 rounded-full", !loading && "bg-brand hover:bg-brand/85")}
              aria-label={loading ? "Parar" : "Enviar"}
            >
              {loading ? <Square className="size-3" /> : <ArrowUp />}
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">
            A Ana sugere e redige; quem envia é sempre você.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
