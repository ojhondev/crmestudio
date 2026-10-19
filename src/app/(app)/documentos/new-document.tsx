"use client";

import { useState, useTransition } from "react";
import { FileSignature, Loader2, Plus, Presentation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { createDocument } from "./actions";

type Opt = { value: string; label: string; hint?: string | null };

export function NewDocumentButton({
  contractTemplates,
  deckTemplates,
  deals,
  defaultDealId,
  defaultKind = "contrato",
  label = "Novo documento",
  variant = "default",
}: {
  contractTemplates: Opt[];
  deckTemplates: Opt[];
  deals: Opt[];
  defaultDealId?: string;
  defaultKind?: "contrato" | "apresentacao";
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"contrato" | "apresentacao">(defaultKind);
  const [template, setTemplate] = useState("");
  const [dealId, setDealId] = useState(defaultDealId ?? "");
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const templates = kind === "contrato" ? contractTemplates : deckTemplates;

  const submit = () =>
    start(async () => {
      const r = await createDocument({ kind, template: template || templates[0]?.value, dealId: dealId || null, title });
      if (r && "error" in r && r.error) toast.error(r.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={variant}>
          <Plus /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo documento</DialogTitle>
          <DialogDescription>Escolha o tipo e o ponto de partida. Os dados do cliente e do negócio entram sozinhos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de documento">
            {(
              [
                { k: "contrato", t: "Contrato", d: "Texto jurídico com cláusulas e aceite online", icon: FileSignature },
                { k: "apresentacao", t: "Apresentação", d: "Proposta comercial em slides", icon: Presentation },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                role="radio"
                aria-checked={kind === o.k}
                onClick={() => {
                  setKind(o.k);
                  setTemplate("");
                }}
                className={cn("grid gap-1 rounded-xl border p-3 text-left", kind === o.k ? "border-brand bg-brand-soft" : "hover:border-foreground/30")}
              >
                <o.icon className="size-4.5 text-brand" />
                <span className="text-[14px] font-medium">{o.t}</span>
                <span className="text-[12px] text-muted-foreground">{o.d}</span>
              </button>
            ))}
          </div>
          <Field label="Modelo">
            <SimpleSelect value={template || templates[0]?.value} onValueChange={setTemplate} options={templates} />
          </Field>
          <Field label="Negócio" hint="Opcional. Com um negócio vinculado, cliente, valor e local são preenchidos automaticamente.">
            <SimpleSelect value={dealId} onValueChange={setDealId} options={deals} allowNone noneLabel="Sem negócio por enquanto" />
          </Field>
          <Field label="Título" hint="Opcional. Se vazio, usamos o nome do modelo e do cliente.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Criar e abrir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
