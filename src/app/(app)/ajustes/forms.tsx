"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SimpleSelect } from "@/components/form";
import { ConfirmButton } from "@/components/crm/confirm-button";
import type { Stage, StageKind } from "@/lib/db/schema";
import { addStage, changePassword, clearDemoData, moveStage, removeStage, saveStage, updateProfile } from "./actions";
import { saveStudio } from "../documentos/actions";
import type { StudioProfile } from "@/lib/docs/types";

function useToastState(state: { ok?: boolean; msg?: string; error?: string } | null, reset?: () => void) {
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.msg ?? "Salvo");
      reset?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  useToastState(state);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Nome" htmlFor="p-name">
        <Input id="p-name" name="name" defaultValue={name} required />
      </Field>
      <Field label="E-mail de acesso">
        <Input value={email} disabled />
      </Field>
      <Field label="Telefone" htmlFor="p-phone">
        <Input id="p-phone" name="phone" defaultValue={phone ?? ""} inputMode="tel" />
      </Field>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button className="w-fit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Salvar
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changePassword, null);
  useToastState(state, () => ref.current?.reset());
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <Field label="Senha atual" htmlFor="pw-cur">
        <Input id="pw-cur" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nova senha" htmlFor="pw-new" hint="Mínimo de 8 caracteres">
        <Input id="pw-new" name="next" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button className="w-fit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Alterar senha
      </Button>
    </form>
  );
}

const KINDS = [
  { value: "aberto", label: "Em andamento" },
  { value: "ganho", label: "Ganho" },
  { value: "perdido", label: "Perdido" },
];

export function StagesEditor({ stages }: { stages: Stage[] }) {
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  return (
    <div className="grid gap-2">
      {stages.map((s, i) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            defaultValue={s.color}
            aria-label="Cor"
            className="size-8 cursor-pointer rounded border bg-transparent p-0.5"
            onBlur={(e) => e.target.value !== s.color && start(() => saveStage(s.id, { color: e.target.value }))}
          />
          <Input
            defaultValue={s.name}
            className="h-8 max-w-64"
            onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && start(() => saveStage(s.id, { name: e.target.value.trim() }))}
          />
          <div className="w-40">
            <SimpleSelect options={KINDS} defaultValue={s.kind} className="h-8" onValueChange={(v) => start(() => saveStage(s.id, { kind: v as StageKind }))} />
          </div>
          <label className="flex items-center gap-1 text-[12px] text-muted-foreground" title="Chance de fechar o negócio nesta etapa — usada na previsão do funil">
            <Input
              type="number"
              min={0}
              max={100}
              defaultValue={s.probability}
              disabled={s.kind !== "aberto"}
              aria-label={`Chance de fechar em ${s.name} (%)`}
              className="h-8 w-[68px] px-2 text-right"
              onBlur={(e) => Number(e.target.value) !== s.probability && start(() => saveStage(s.id, { probability: Number(e.target.value) }))}
            />
            %
          </label>
          <Button variant="ghost" size="icon-sm" disabled={pending || i === 0} onClick={() => start(() => moveStage(s.id, -1))} aria-label="Subir">
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending || i === stages.length - 1}
            onClick={() => start(() => moveStage(s.id, 1))}
            aria-label="Descer"
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label="Excluir etapa"
            onClick={() =>
              start(async () => {
                const r = await removeStage(s.id);
                if (r?.error) toast.error(r.error);
              })
            }
          >
            <X />
          </Button>
        </div>
      ))}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await addStage(newName);
            setNewName("");
          });
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova etapa" className="h-8 max-w-64" />
        <Button variant="outline" size="sm" disabled={pending || !newName.trim()}>
          <Plus /> Adicionar
        </Button>
      </form>
    </div>
  );
}

export function DemoDataButton() {
  return (
    <ConfirmButton
      label="Remover exemplos"
      confirmLabel="Remover"
      title="Remover dados de exemplo?"
      description="Apaga apenas os registros criados como demonstração."
      action={async () => {
        const r = await clearDemoData();
        toast.success(`${r.n} contatos de exemplo removidos`);
      }}
    />
  );
}

export function StudioForm({ studio }: { studio: StudioProfile }) {
  const [state, action, pending] = useActionState(saveStudio, null);
  useToastState(state);
  const f = (name: keyof StudioProfile, label: string, extra?: { hint?: string; span?: boolean }) => (
    <Field label={label} htmlFor={`st-${name}`} hint={extra?.hint} className={extra?.span ? "sm:col-span-2" : undefined}>
      <Input id={`st-${name}`} name={name} defaultValue={studio[name]} />
    </Field>
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {f("name", "Nome do estúdio")}
      {f("legalName", "Razão social")}
      {f("document", "CNPJ")}
      {f("phone", "Telefone")}
      {f("email", "E-mail")}
      {f("city", "Cidade / UF")}
      {f("address", "Endereço completo", { span: true })}
      {f("responsible", "Responsável técnico / signatário")}
      {f("responsibleDocument", "CPF do responsável")}
      {f("forum", "Foro (comarca)", { hint: "Ex.: São Paulo/SP — entra na cláusula de foro dos contratos.", span: true })}
      {state?.error && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
      <Button className="w-fit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Salvar dados
      </Button>
    </form>
  );
}
