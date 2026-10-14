"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/form";
import { SERVICES, SOURCES } from "@/lib/constants";
import { fmtPhone } from "@/lib/format";
import type { Contact } from "@/lib/db/schema";
import { createContact, updateContact } from "./actions";

type Team = { id: string; name: string }[];

function ContactFields({ contact, team }: { contact?: Contact; team: Team }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <Field label="Nome" htmlFor="name">
        <Input id="name" name="name" required defaultValue={contact?.name} placeholder="Pe. João Silva" />
      </Field>
      <Field label="Cargo / função" htmlFor="role">
        <Input id="role" name="role" defaultValue={contact?.role ?? ""} placeholder="Pároco, ecônomo, arquiteto…" />
      </Field>
      <Field label="Instituição / empresa" htmlFor="company" className="sm:col-span-2">
        <Input id="company" name="company" defaultValue={contact?.company ?? ""} placeholder="Paróquia Nossa Senhora da Candelária" />
      </Field>
      <Field label="WhatsApp" htmlFor="phone">
        <Input id="phone" name="phone" inputMode="tel" defaultValue={contact?.phone ? fmtPhone(contact.phone) : ""} placeholder="(11) 99999-0000" />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} />
      </Field>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <Field label="Cidade" htmlFor="city">
          <Input id="city" name="city" defaultValue={contact?.city ?? ""} />
        </Field>
        <Field label="UF" htmlFor="state">
          <Input id="state" name="state" maxLength={2} defaultValue={contact?.state ?? ""} className="uppercase" />
        </Field>
      </div>
      <Field label="Origem">
        <SimpleSelect name="source" options={SOURCES} allowNone defaultValue={contact?.source} />
      </Field>
      <Field label="Responsável">
        <SimpleSelect name="ownerId" allowNone defaultValue={contact?.ownerId} options={team.map((u) => ({ value: u.id, label: u.name }))} />
      </Field>
      <Field label="Etiquetas" htmlFor="tags" hint="Separadas por vírgula">
        <Input id="tags" name="tags" defaultValue={contact?.tags.join(", ") ?? ""} placeholder="diocese, IPHAN, recorrente" />
      </Field>
      <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={3} defaultValue={contact?.notes ?? ""} />
      </Field>
    </div>
  );
}

export function NewContactButton({ team }: { team: Team }) {
  const [open, setOpen] = useState(false);
  const [withDeal, setWithDeal] = useState(true);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await createContact(prev, fd);
    if (r?.ok) {
      setOpen(false);
      toast.success("Lead cadastrado");
      router.push(`/contatos/${r.id}`);
    }
    return r;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Novo lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-normal">Novo lead</DialogTitle>
        </DialogHeader>
        <form action={action} className="grid gap-5">
          <ContactFields team={team} />
          <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Switch id="createDeal" name="createDeal" checked={withDeal} onCheckedChange={setWithDeal} />
              <Label htmlFor="createDeal" className="text-[13px]">
                Já abrir um negócio no funil
              </Label>
            </div>
            {withDeal && (
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <Input name="dealTitle" placeholder="Nome do negócio (opcional)" />
                <Input name="dealValue" inputMode="decimal" placeholder="Valor R$" />
                <div className="sm:col-span-2">
                  <SimpleSelect name="service" options={SERVICES} allowNone noneLabel="Serviço" />
                </div>
              </div>
            )}
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Salvar lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditContactForm({ contact, team }: { contact: Contact; team: Team }) {
  const [state, action, pending] = useActionState(updateContact, null);
  useEffect(() => {
    if (state?.ok) toast.success("Contato atualizado");
  }, [state]);
  return (
    <form action={action} className="grid gap-5">
      <ContactFields contact={contact} team={team} />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Salvar
        </Button>
      </div>
    </form>
  );
}
