"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Link2, Mail, MessageCircle, MailCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { InvitePack } from "@/lib/editais-app/partners";
import { Button } from "@/components/ui/button";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado`);
  } catch {
    toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
  }
}

/**
 * O convite pronto: se o e-mail saiu, avisa; se não (sem provedor), mostra o texto para copiar,
 * o botão do WhatsApp e o mailto. A senha provisória aparece só aqui, uma vez.
 */
export function InvitePanel({ pack, name }: { pack: InvitePack; name: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-5">
      {pack.emailed ? (
        <p className="flex items-start gap-3 rounded-2xl bg-emerald-100 px-4 py-3 text-[15px] text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300">
          <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden /> O e-mail com o convite foi enviado para {name.split(" ")[0]}. Se preferir, você também pode mandar o texto abaixo por WhatsApp.
        </p>
      ) : (
        <p className="flex items-start gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-[15px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Convite pendente de envio.</strong> {pack.mailNote} Mande o texto abaixo para {name.split(" ")[0]}.
          </span>
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button type="button" className="min-h-12 rounded-xl" onClick={() => copy(pack.text, "Convite")}>
          <Copy /> Copiar o convite
        </Button>
        <Button asChild variant="outline" className="min-h-12 rounded-xl">
          <a href={pack.whatsapp} target="_blank" rel="noreferrer noopener">
            <MessageCircle /> Abrir no WhatsApp
          </a>
        </Button>
        <Button asChild variant="outline" className="min-h-12 rounded-xl">
          <a href={pack.mailto}>
            <Mail /> Abrir no e-mail
          </a>
        </Button>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="convite-texto" className="text-sm font-medium text-muted-foreground">
          Texto do convite
        </label>
        <textarea id="convite-texto" readOnly value={pack.text} rows={10} onFocus={(e) => e.currentTarget.select()} className="w-full resize-y rounded-2xl border bg-card px-4 py-3 text-[15px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link2 className="size-4 text-muted-foreground" aria-hidden />
        <span className="break-all">{pack.link}</span>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => copy(pack.link, "Link")}>
          <Copy /> Copiar o link
        </Button>
      </div>

      {pack.tempPassword && (
        <div className="rounded-2xl border border-dashed p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4" aria-hidden /> Senha provisória
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Já está no texto acima. Ela só aparece agora; se perder, gere outra na ficha do parceiro. Quem entra pelo Google não precisa dela.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-muted px-3 py-2 text-base tracking-wide">{shown ? pack.tempPassword : "•••••••••••"}</code>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setShown((s) => !s)}>
              {shown ? "Ocultar" : "Mostrar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => copy(pack.tempPassword as string, "Senha")}>
              <Check /> Copiar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
