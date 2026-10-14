"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/form";
import { PROPERTIES, SERVICES, SOURCES } from "@/lib/constants";
import { centsToInput } from "@/lib/format";
import type { Deal } from "@/lib/db/schema";
import type { FormOptions } from "@/lib/options";
import { createDeal, updateDeal } from "./actions";

export function DealFields({
  options,
  deal,
  defaultStageId,
  defaultContactId,
  isPartner,
}: {
  options: FormOptions;
  deal?: Deal;
  defaultStageId?: number;
  defaultContactId?: string;
  isPartner?: boolean;
}) {
  const [newContact, setNewContact] = useState(false);
  const lost = options.stages.find((s) => s.id === deal?.stageId)?.kind === "perdido";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {deal && <input type="hidden" name="id" value={deal.id} />}
      <Field label="Negócio" htmlFor="title" className="sm:col-span-2">
        <Input id="title" name="title" required defaultValue={deal?.title} placeholder="Ex.: Restauro do forro — Igreja Matriz de Itu" />
      </Field>

      <Field label="Cliente" className="sm:col-span-2">
        {newContact ? (
          <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2">
            <Input name="newContactName" placeholder="Nome *" required autoFocus />
            <Input name="newContactCompany" placeholder="Paróquia / empresa" />
            <Input name="newContactPhone" placeholder="WhatsApp (11) 9…" inputMode="tel" />
            <Input name="newContactEmail" type="email" placeholder="E-mail" />
            <div className="sm:col-span-2">
              <SimpleSelect name="source" options={SOURCES} allowNone noneLabel="Origem do lead" />
            </div>
            <button type="button" onClick={() => setNewContact(false)} className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline">
              escolher contato existente
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <SimpleSelect
              name="contactId"
              allowNone
              noneLabel="Sem cliente"
              defaultValue={deal?.contactId ?? defaultContactId}
              options={options.contacts.map((c) => ({ value: c.id, label: c.name, hint: c.hint }))}
            />
            <Button type="button" variant="outline" className="h-8" onClick={() => setNewContact(true)}>
              <UserPlus /> Novo
            </Button>
          </div>
        )}
      </Field>

      <Field label="Valor estimado (R$)" htmlFor="value">
        <Input id="value" name="value" inputMode="decimal" placeholder="0,00" defaultValue={deal ? centsToInput(deal.valueCents) : ""} />
      </Field>
      <Field label="Etapa">
        <SimpleSelect
          name="stageId"
          defaultValue={String(deal?.stageId ?? defaultStageId ?? options.stages[0]?.id)}
          options={options.stages.map((s) => ({ value: String(s.id), label: s.name }))}
        />
      </Field>
      <Field label="Serviço">
        <SimpleSelect name="service" options={SERVICES} allowNone defaultValue={deal?.service} />
      </Field>
      <Field label="Bem / imóvel">
        <SimpleSelect name="property" options={PROPERTIES} allowNone defaultValue={deal?.property} />
      </Field>
      <Field label="Local da obra" htmlFor="location">
        <Input id="location" name="location" placeholder="Cidade/UF" defaultValue={deal?.location ?? ""} />
      </Field>
      <Field label="Previsão de fechamento" htmlFor="expectedClose">
        <Input id="expectedClose" name="expectedClose" type="date" defaultValue={deal?.expectedClose ?? ""} />
      </Field>
      {!isPartner && (
        <>
          <Field label="Responsável">
            <SimpleSelect name="ownerId" allowNone defaultValue={deal?.ownerId} options={options.team.map((u) => ({ value: u.id, label: u.name }))} />
          </Field>
          <Field label="Parceiro comercial">
            <SimpleSelect name="partnerId" allowNone noneLabel="Nenhum" defaultValue={deal?.partnerId} options={options.partners.map((u) => ({ value: u.id, label: u.name }))} />
          </Field>
        </>
      )}
      {lost && (
        <Field label="Motivo da perda" htmlFor="lostReason" className="sm:col-span-2">
          <Input id="lostReason" name="lostReason" defaultValue={deal?.lostReason ?? ""} placeholder="Preço, prazo, escolheu outro escritório…" />
        </Field>
      )}
      <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={3} defaultValue={deal?.notes ?? ""} />
      </Field>
    </div>
  );
}

export function NewDealButton({
  options,
  isPartner,
  defaultContactId,
  label = "Novo negócio",
  variant = "default",
}: {
  options: FormOptions;
  isPartner?: boolean;
  defaultContactId?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await createDeal(prev, fd);
    if (r?.ok) {
      setOpen(false);
      toast.success("Negócio criado");
      router.refresh();
    }
    return r;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-normal">Novo negócio</DialogTitle>
        </DialogHeader>
        <form action={action} className="grid gap-5">
          <DealFields options={options} isPartner={isPartner} defaultContactId={defaultContactId} />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Criar negócio
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditDealForm({ options, deal, isPartner }: { options: FormOptions; deal: Deal; isPartner?: boolean }) {
  const [state, action, pending] = useActionState(updateDeal, null);
  useEffect(() => {
    if (state?.ok) toast.success("Alterações salvas");
  }, [state]);
  return (
    <form action={action} className="grid gap-5">
      <DealFields options={options} deal={deal} isPartner={isPartner} />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Salvar
        </Button>
      </div>
    </form>
  );
}
