"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Field, SimpleSelect } from "@/components/form";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/db/schema";
import { createMember, resetPassword, updateMember } from "./actions";

const ROLE_OPTS = [
  { value: "admin", label: "Administrador" },
  { value: "equipe", label: "Equipe" },
  { value: "parceiro", label: "Parceiro comercial" },
];

type Member = { id: string; name: string; email: string; role: Role; title: string | null; phone: string | null; active: boolean };

function Credentials({ email, password }: { email: string; password: string }) {
  const text = `Acesso ao app do Estúdio Restaura\n${typeof window !== "undefined" ? window.location.origin : ""}/login\nE-mail: ${email}\nSenha provisória: ${password}`;
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-muted/40 p-3 font-mono text-[12.5px] whitespace-pre-wrap">{text}</div>
      <p className="text-[12px] text-muted-foreground">
        Esta senha aparece só agora. Envie para a pessoa por um canal privado e peça que troque em Ajustes no primeiro acesso.
      </p>
      <Button onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copiado"))}>
        <Copy /> Copiar acesso
      </Button>
    </div>
  );
}

export function NewMemberButton() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await createMember(prev, fd);
    if (r?.ok && r.password) setShown({ email: r.email!, password: r.password });
    return r;
  }, null);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setShown(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Adicionar pessoa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-normal">{shown ? "Conta criada" : "Adicionar pessoa"}</DialogTitle>
          {!shown && <DialogDescription>Funcionário, sócio ou parceiro comercial.</DialogDescription>}
        </DialogHeader>
        {shown ? (
          <Credentials {...shown} />
        ) : (
          <form action={action} className="grid gap-4">
            <Field label="Nome" htmlFor="m-name">
              <Input id="m-name" name="name" required />
            </Field>
            <Field label="E-mail" htmlFor="m-email">
              <Input id="m-email" name="email" type="email" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Papel">
                <SimpleSelect name="role" defaultValue="equipe" options={ROLE_OPTS} />
              </Field>
              <Field label="Cargo / empresa" htmlFor="m-title">
                <Input id="m-title" name="title" placeholder="Arquiteta, Construtora X…" />
              </Field>
            </div>
            <Field label="Telefone" htmlFor="m-phone">
              <Input id="m-phone" name="phone" inputMode="tel" />
            </Field>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Criar conta
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MemberList({ users, meId }: { users: Member[]; meId: string }) {
  const [pending, start] = useTransition();
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      {users.map((u) => (
        <div key={u.id} className={cn("flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0", !u.active && "opacity-55")}>
          <Avatar className="size-9">
            <AvatarFallback className="bg-secondary text-[11.5px]">{initials(u.name)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="text-[13.5px] font-medium">
              {u.name} {u.id === meId && <span className="text-[11.5px] font-normal text-muted-foreground">(você)</span>}
            </span>
            <span className="truncate text-[12px] text-muted-foreground">
              {u.email}
              {u.title && ` · ${u.title}`}
            </span>
          </div>
          <div className="w-44">
            <SimpleSelect
              options={ROLE_OPTS}
              defaultValue={u.role}
              onValueChange={(v) =>
                start(async () => {
                  const r = await updateMember(u.id, { role: v as Role });
                  if (r?.error) toast.error(r.error);
                  else toast.success("Papel atualizado");
                })
              }
              className="h-8 text-[12.5px]"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Switch
              checked={u.active}
              disabled={pending || u.id === meId}
              onCheckedChange={(v) =>
                start(async () => {
                  const r = await updateMember(u.id, { active: v });
                  if (r?.error) toast.error(r.error);
                })
              }
            />
            {u.active ? "Ativo" : "Inativo"}
          </label>
          {u.id !== meId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await resetPassword(u.id);
                  if (r?.ok && r.password) setReset({ email: r.email!, password: r.password });
                  else if (r?.error) toast.error(r.error);
                })
              }
            >
              <KeyRound /> Nova senha
            </Button>
          )}
        </div>
      ))}
      <Dialog open={!!reset} onOpenChange={(v) => !v && setReset(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-normal">Nova senha provisória</DialogTitle>
          </DialogHeader>
          {reset && <Credentials {...reset} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
