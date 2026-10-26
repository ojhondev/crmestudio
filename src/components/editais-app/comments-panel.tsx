"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, FileCheck2, Link2, Loader2, Lock, MessageCircle, Send, Star, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { timeAgo } from "@/lib/notifications-types";
import { splitMentions, type Mentionable } from "@/lib/editais-app/mentions";
import { commentAction, reviewAction } from "@/lib/editais-app/actions/radar";
import type { CommentDTO } from "@/lib/editais-app/radar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Pill } from "./primitives";

type Kind = "comentario" | "link" | "revisao";
const KIND_OPTS: { key: Kind; label: string; icon: React.ElementType }[] = [
  { key: "comentario", label: "Comentário", icon: MessageCircle },
  { key: "link", label: "Anexar link", icon: Link2 },
  { key: "revisao", label: "Enviar para revisão", icon: FileCheck2 },
];

/** Conversa do edital/proposta: comentários, menções (@nome), links anexados e documentos enviados para revisão. */
export function CommentsPanel({
  editalId,
  comments,
  people,
  isStaff,
  canPost,
  now,
}: {
  editalId: string;
  comments: CommentDTO[];
  people: Mentionable[];
  isStaff: boolean;
  canPost: boolean;
  now: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<Kind>("comentario");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [internal, setInternal] = useState(false);

  function send(ev: React.FormEvent) {
    ev.preventDefault();
    start(async () => {
      const r = await commentAction({ editalId, body, kind, linkUrl: url, linkName: name, internal });
      if ("error" in r) return void toast.error(r.error);
      setBody("");
      setUrl("");
      setName("");
      toast.success(kind === "revisao" ? "Enviado para revisão" : kind === "link" ? "Link anexado" : "Comentário publicado");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {canPost ? (
        <form onSubmit={send} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border bg-card p-3 sm:p-4">
          <div role="radiogroup" aria-label="Tipo de mensagem" className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {KIND_OPTS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={kind === k.key}
                onClick={() => setKind(k.key)}
                className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", kind === k.key ? "border-brand bg-brand-soft font-medium" : "hover:bg-muted")}
              >
                <k.icon className="size-4" aria-hidden /> {k.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="comentario-texto">
            Mensagem
          </label>
          <textarea
            id="comentario-texto"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={kind === "comentario" ? "Escreva para a equipe… use @nome para chamar alguém" : kind === "link" ? "O que é este link? (opcional)" : "O que precisa ser revisado? (opcional)"}
            className="w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:text-sm"
          />
          {kind !== "comentario" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Atestado Sorocaba)" aria-label="Nome do link" maxLength={80} className="h-11 rounded-xl border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-10 md:text-sm" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" aria-label="Endereço do link" inputMode="url" className="h-11 rounded-xl border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-10 md:text-sm" />
              <p className="text-xs text-muted-foreground sm:col-span-2">O app guarda só o link — o arquivo fica no seu Drive ou no site de origem.</p>
            </div>
          )}
          {people.length > 0 && kind === "comentario" && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto" aria-label="Mencionar">
              {people.slice(0, 12).map((p) => (
                <button key={p.id} type="button" onClick={() => setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${p.name} `)} className="min-h-9 shrink-0 rounded-full bg-muted px-3 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  @{p.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isStaff ? (
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-5 accent-[var(--brand)]" />
                <Lock className="size-3.5 text-muted-foreground" aria-hidden /> Só a equipe vê
              </label>
            ) : (
              <span />
            )}
            <Button type="submit" className="min-h-11 px-5" disabled={pending || (kind === "comentario" ? !body.trim() : !url.trim())}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Você pode ler a conversa. Para comentar, peça à equipe o acesso “Pode contribuir”.</p>
      )}

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
      ) : (
        <ul className="grid gap-3">
          {comments.map((c) => (
            <li key={c.id} className={cn("flex gap-3 rounded-2xl p-1", c.internal && "bg-muted/50")}>
              <Avatar className="mt-0.5 size-9 shrink-0">
                <AvatarFallback className={cn("text-xs font-semibold", c.isPartner ? "bg-brand-soft text-brand" : "bg-secondary")}>{initials(c.userName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold">{c.userName}</span>
                  {c.isPartner && <Pill tone="brand">Parceiro</Pill>}
                  {c.internal && (
                    <Pill tone="mute">
                      <Lock aria-hidden /> Só equipe
                    </Pill>
                  )}
                  <span className="text-xs text-muted-foreground">{timeAgo(c.at, now)}</span>
                </p>
                {c.kind === "interesse" ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[15px]">
                    <Star className="size-4 text-brand" aria-hidden /> Marcou interesse neste edital.
                  </p>
                ) : (
                  c.body && (
                    <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                      {splitMentions(c.body, people).map((s, i) =>
                        s.mention ? (
                          <span key={i} className="rounded bg-brand-soft px-1 font-medium text-brand">
                            {s.text}
                          </span>
                        ) : (
                          <span key={i}>{s.text}</span>
                        ),
                      )}
                    </p>
                  )
                )}
                {c.linkUrl && (
                  <a href={c.linkUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border bg-card px-3 text-sm outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-ring">
                    {c.kind === "revisao" ? <FileCheck2 className="size-4 shrink-0 text-brand" /> : <Link2 className="size-4 shrink-0 text-brand" />}
                    <span className="truncate">{c.linkName ?? "Abrir link"}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                )}
                {c.kind === "revisao" && (
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    {c.reviewStatus === "aprovado" ? (
                      <Pill tone="good">
                        <Check aria-hidden /> Aprovado
                      </Pill>
                    ) : c.reviewStatus === "ajustar" ? (
                      <Pill tone="warn">
                        <TriangleAlert aria-hidden /> Pediram ajustes
                      </Pill>
                    ) : (
                      <Pill tone="info">Aguardando revisão</Pill>
                    )}
                    {isStaff && (
                      <>
                        <ReviewButton id={c.id} status="aprovado" label="Aprovar" />
                        <ReviewButton id={c.id} status="ajustar" label="Pedir ajustes" />
                      </>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewButton({ id, status, label }: { id: string; status: "aprovado" | "ajustar"; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-9 rounded-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await reviewAction(id, status);
          if ("error" in r) return void toast.error(r.error);
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
