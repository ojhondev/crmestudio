"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Share2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DISCARD_REASONS } from "@/lib/editais/types";
import { ROLE_HELP, ROLE_LABEL, type PartnerRole, type ShareScope } from "@/lib/editais-app/access";
import { discardAction, shareAction } from "@/lib/editais-app/actions/radar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Descartar com o motivo em UM toque: escolher o motivo já descarta. */
export function DiscardDialog({ editalId, open, onOpenChange, onDone }: { editalId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  function pick(reason: string) {
    setBusy(reason);
    start(async () => {
      const r = await discardAction(editalId, reason);
      setBusy(null);
      if ("error" in r) return void toast.error(r.error);
      toast.success("Descartado", { description: reason });
      onOpenChange(false);
      onDone();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="ed-title text-xl">Por que descartar?</DialogTitle>
          <DialogDescription>Toque no motivo. Ele fica registrado e ajuda a afinar o Radar.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {DISCARD_REASONS.map((r) => (
            <li key={r}>
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(r)}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-4 text-left text-[15px] transition-colors outline-none hover:border-brand hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {r}
                {busy === r && <Loader2 className="size-4 animate-spin" />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export type SharePartner = { id: string; name: string; company: string | null };

/** Compartilhar um ou mais editais com parceiros (o parceiro só enxerga o que for compartilhado). */
export function ShareDialog({
  editalIds,
  partners,
  open,
  onOpenChange,
  onDone,
  hasDossie,
  preselect,
}: {
  editalIds: string[];
  partners: SharePartner[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  /** já existe proposta? (liga “incluir a proposta” por padrão) */
  hasDossie?: boolean;
  preselect?: string[];
}) {
  const [picked, setPicked] = useState<string[]>(preselect ?? []);
  const [role, setRole] = useState<PartnerRole>("ver");
  const [scope, setScope] = useState<ShareScope>(hasDossie ? "proposta" : "edital");
  const [showDocs, setShowDocs] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!picked.length) return void toast.error("Escolha pelo menos um parceiro.");
    start(async () => {
      const r = await shareAction({ editalIds, partnerIds: picked, role, scope, showDocs, showSheet });
      if ("error" in r) return void toast.error(r.error);
      toast.success(editalIds.length > 1 ? `${editalIds.length} editais compartilhados` : "Compartilhado", { description: "Os parceiros receberam um aviso no app." });
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="ed-title text-xl">Compartilhar{editalIds.length > 1 ? ` ${editalIds.length} editais` : ""}</DialogTitle>
          <DialogDescription>O parceiro só enxerga o que você compartilhar aqui.</DialogDescription>
        </DialogHeader>

        {partners.length === 0 ? (
          <div className="grid gap-3 rounded-xl border border-dashed p-5 text-center">
            <UserPlus className="mx-auto size-6 text-brand" />
            <p className="text-sm">Você ainda não tem parceiros ativos.</p>
            <Button asChild>
              <Link href="/editais/parceiros">Convidar um parceiro</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-medium">Com quem?</legend>
              {partners.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <label key={p.id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", on ? "border-brand bg-brand-soft" : "hover:bg-muted")}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setPicked((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))} />
                    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-brand bg-brand text-on-brand" : "bg-background")}>
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{p.name}</span>
                      {p.company && <span className="block truncate text-xs text-muted-foreground">{p.company}</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-medium">O que ele pode fazer?</legend>
              {(["ver", "contribuir"] as PartnerRole[]).map((r) => (
                <label key={r} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", role === r ? "border-brand bg-brand-soft" : "hover:bg-muted")}>
                  <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                  <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", role === r ? "border-brand bg-brand text-on-brand" : "bg-background")}>
                    {role === r && <Check className="size-3.5" />}
                  </span>
                  <span>
                    <span className="block text-[15px] font-medium">{ROLE_LABEL[r]}</span>
                    <span className="block text-xs text-muted-foreground">{ROLE_HELP[r]}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-medium">Incluir a proposta?</legend>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={scope === "proposta"} onChange={(e) => setScope(e.target.checked ? "proposta" : "edital")} />
                <span className="text-[15px]">Sim, mostrar também a proposta (etapas e checklist)</span>
              </label>
              {scope === "proposta" && (
                <div className="grid gap-1 pl-2">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={showDocs} onChange={(e) => setShowDocs(e.target.checked)} /> Mostrar os documentos gerados
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={showSheet} onChange={(e) => setShowSheet(e.target.checked)} /> Mostrar a planilha de preços
                  </label>
                  <p className="text-xs text-muted-foreground">Por padrão, documentos e planilha de preços ficam só com a equipe.</p>
                </div>
              )}
            </fieldset>

            <Button size="lg" className="h-12 w-full text-[15px] md:h-11" disabled={pending || !picked.length} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" /> : <Share2 />} Compartilhar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
