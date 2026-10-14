"use client";

import { useState } from "react";
import { Copy, Mail, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAnaStream } from "./use-ana-stream";

function splitEmail(text: string) {
  const m = text.match(/^\s*Assunto:\s*(.+)\n+([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: "", body: text.trim() };
}

/** Pede à Ana um rascunho de e-mail a partir de uma conversa ou negócio. */
export function EmailDraftButton({
  conversationId,
  dealId,
  to,
  size = "default",
  variant = "outline",
}: {
  conversationId?: string;
  dealId?: string;
  to?: string | null;
  size?: "default" | "sm";
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const { text, loading, run } = useAnaStream();
  const { subject, body } = splitEmail(text);

  const generate = () => run({ mode: "email", conversationId, dealId, hint: hint || undefined });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Mail /> E-mail com a Ana
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-normal">
            <Sparkles className="size-4 text-brand" /> Rascunho de e-mail
          </DialogTitle>
          <DialogDescription>Diga o objetivo (opcional) e a Ana escreve com base no histórico.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Ex.: enviar proposta do restauro do forro, cobrar retorno, agradecer a visita…"
            onKeyDown={(e) => e.key === "Enter" && generate()}
          />
          <Button onClick={generate} disabled={loading} className="bg-brand hover:bg-brand/85">
            {text ? <RotateCcw /> : <Sparkles />} {text ? "Refazer" : "Gerar"}
          </Button>
        </div>
        {(text || loading) && (
          <div className="grid gap-2">
            <Input value={subject} readOnly placeholder="Assunto" className="font-medium" />
            <Textarea value={loading && !text ? "Escrevendo…" : body} readOnly rows={14} className="text-[13.5px] leading-relaxed" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() =>
                  navigator.clipboard.writeText(subject ? `Assunto: ${subject}\n\n${body}` : body).then(() => toast.success("Copiado"))
                }
              >
                <Copy /> Copiar
              </Button>
              <Button asChild disabled={loading}>
                <a href={`mailto:${to ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                  <Mail /> Abrir no e-mail
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
