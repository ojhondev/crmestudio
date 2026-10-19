"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, Lock, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Field, SimpleSelect } from "@/components/form";
import { fmtDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LEVELS,
  LEVEL_LABEL,
  MODULES,
  PROFILES,
  SELECTABLE_PROFILES,
  atLeast,
  detectProfile,
  type Level,
  type ModuleKey,
  type Permissions,
  type ProfileKey,
} from "@/lib/permissions";
import { createMember, resetPassword, saveMemberAccess, setMemberActive } from "./actions";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "equipe" | "parceiro";
  profile: ProfileKey;
  title: string | null;
  phone: string | null;
  active: boolean;
  ownOnly: boolean;
  /** gestor/supervisor (recebe os avisos da pessoa) */
  supervisorId: string | null;
  perms: Permissions;
  lastLoginAt: string | null;
  mustChange: boolean;
};

type Viewer = { id: string; isAdmin: boolean; perms: Permissions };

const profileOptions = (isAdmin: boolean) =>
  SELECTABLE_PROFILES.filter((p) => isAdmin || p !== "administrador").map((p) => ({ value: p, label: PROFILES[p].label }));

function Credentials({ email, password }: { email: string; password: string }) {
  const text = `Acesso ao Restaura Gestão do Estúdio Restaura\n${typeof window !== "undefined" ? window.location.origin : ""}/login\nE-mail: ${email}\nSenha provisória: ${password}\n(No primeiro acesso você cria a sua senha.)`;
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-muted/40 p-3 font-mono text-[12.5px] break-all whitespace-pre-wrap">{text}</div>
      <p className="text-[12px] text-muted-foreground">Esta senha aparece só agora. Envie por um canal privado — no primeiro acesso a pessoa será obrigada a criar a própria senha.</p>
      <Button onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copiado"))}>
        <Copy /> Copiar acesso
      </Button>
    </div>
  );
}

export function NewMemberButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await createMember(prev, fd);
    if (r?.ok && r.password) {
      setShown({ email: r.email!, password: r.password });
      router.refresh();
    }
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
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-normal">{shown ? "Conta criada" : "Adicionar pessoa"}</DialogTitle>
          {!shown && <DialogDescription>Funcionário, sócio ou parceiro. Você ajusta as permissões depois, se precisar.</DialogDescription>}
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
            <Field label="Perfil de acesso" hint="O perfil define o que a pessoa vê. Dá para refinar módulo a módulo depois.">
              <SimpleSelect name="profile" defaultValue="comercial" options={profileOptions(isAdmin)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo / empresa" htmlFor="m-title">
                <Input id="m-title" name="title" placeholder="Arquiteta, Construtora X…" />
              </Field>
              <Field label="Telefone" htmlFor="m-phone">
                <Input id="m-phone" name="phone" inputMode="tel" />
              </Field>
            </div>
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

export function MemberList({ members, viewer, canManage }: { members: Member[]; viewer: Viewer; canManage: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const current = members.find((m) => m.id === openId) ?? null;
  return (
    <>
      <div data-tour="team-list" className="grid gap-2">
        {members.map((m) => {
          const prof = PROFILES[m.profile] ?? PROFILES.personalizado;
          return (
            <button
              key={m.id}
              onClick={() => setOpenId(m.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-foreground/25 sm:p-4",
                !m.active && "opacity-55",
              )}
            >
              <Avatar className="size-10">
                <AvatarFallback className="bg-secondary text-[12px]">{initials(m.name)}</AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-[14px] font-medium">
                  {m.name} {m.id === viewer.id && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
                </span>
                <span className="truncate text-[12px] text-muted-foreground">
                  {m.email}
                  {m.title && ` · ${m.title}`}
                </span>
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {!m.active ? "Conta desativada" : m.mustChange ? "Ainda não criou a senha pessoal" : m.lastLoginAt ? `Último acesso ${fmtDateTime(m.lastLoginAt)}` : "Nunca entrou"}
                </span>
              </span>
              <Badge variant="outline" className="shrink-0 gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: prof.color }} />
                {prof.label}
              </Badge>
            </button>
          );
        })}
      </div>
      {current && <MemberSheet key={current.id} member={current} people={members} viewer={viewer} canManage={canManage} onClose={() => setOpenId(null)} />}
    </>
  );
}

const LEVEL_SHORT: Record<Level, string> = { none: "Nenhum", view: "Ver", edit: "Editar", manage: "Gerenciar" };

function LevelPicker({ value, allowed, disabledAbove, onChange, label }: { value: Level; allowed: Level[]; disabledAbove: Level; onChange: (l: Level) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-lg bg-muted p-0.5 sm:w-auto">
      {allowed.map((l) => {
        const blocked = !atLeast(disabledAbove, l);
        const active = value === l;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={blocked}
            onClick={() => onChange(l)}
            title={blocked ? "Você não pode conceder mais acesso do que tem" : LEVEL_LABEL[l]}
            className={cn(
              "h-8 flex-1 rounded-md px-2.5 text-[12px] whitespace-nowrap text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-35 sm:flex-none",
              active && "bg-card font-medium text-foreground shadow-sm",
              active && l === "manage" && "text-brand",
            )}
          >
            {LEVEL_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}

function MemberSheet({ member, people, viewer, canManage, onClose }: { member: Member; people: Member[]; viewer: Viewer; canManage: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(member.name);
  const [title, setTitle] = useState(member.title ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [perms, setPerms] = useState<Permissions>(member.perms);
  const [ownOnly, setOwnOnly] = useState(member.ownOnly);
  const [supervisorId, setSupervisorId] = useState(member.supervisorId ?? "__none");
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const isSelf = member.id === viewer.id;
  const targetIsAdmin = member.role === "admin";
  // administrador (ou a própria pessoa) tem o acesso travado; só dados pessoais mudam
  const accessLocked = !canManage || isSelf || (targetIsAdmin && !viewer.isAdmin) || (targetIsAdmin && member.profile === "administrador");
  const detected: ProfileKey = targetIsAdmin ? "administrador" : detectProfile(perms, ownOnly);
  const prof = PROFILES[detected];

  function pickProfile(p: string) {
    if (p === "personalizado") return;
    const preset = PROFILES[p as ProfileKey];
    setPerms(preset.perms);
    setOwnOnly(preset.ownOnly);
  }

  function save() {
    start(async () => {
      const r = await saveMemberAccess(member.id, { name, title, phone, profile: detected, permissions: perms, ownOnly, supervisorId: supervisorId === "__none" ? null : supervisorId });
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Alterações salvas");
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-3 pr-8">
            <Avatar className="size-11">
              <AvatarFallback className="bg-secondary">{initials(member.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 leading-tight">
              <SheetTitle className="truncate text-base font-medium">{member.name}</SheetTitle>
              <SheetDescription className="truncate text-xs">{member.email}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {creds ? (
            <div className="grid gap-3">
              <p className="text-sm font-medium">Nova senha provisória</p>
              <Credentials {...creds} />
              <Button variant="ghost" onClick={() => setCreds(null)}>
                Voltar
              </Button>
            </div>
          ) : (
            <div className="grid gap-6">
              <section className="grid gap-3">
                <h3 className="label">Dados</h3>
                <Field label="Nome" htmlFor="ms-name">
                  <Input id="ms-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cargo / empresa" htmlFor="ms-title">
                    <Input id="ms-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} />
                  </Field>
                  <Field label="Telefone" htmlFor="ms-phone">
                    <Input id="ms-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" disabled={!canManage} />
                  </Field>
                </div>
                <Field label="Gestor / supervisor" htmlFor="ms-sup" hint="Recebe os avisos de atraso, tarefas e negócios desta pessoa. Sem gestor, quem recebe são os administradores.">
                  <SimpleSelect
                    id="ms-sup"
                    value={supervisorId}
                    onValueChange={setSupervisorId}
                    allowNone
                    noneLabel="Sem gestor (avisa os administradores)"
                    options={people.filter((p) => p.id !== member.id && p.active && p.role !== "parceiro").map((p) => ({ value: p.id, label: p.name }))}
                    className={!canManage ? "pointer-events-none opacity-60" : undefined}
                  />
                </Field>
              </section>

              <section className="grid gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="label">Acesso</h3>
                  <Badge variant="outline" className="ml-auto gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ background: prof.color }} />
                    {prof.label}
                  </Badge>
                </div>

                {accessLocked && (
                  <p className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-[12.5px] text-muted-foreground">
                    <Lock className="mt-0.5 size-3.5 shrink-0" />
                    {targetIsAdmin
                      ? "Administradores têm acesso total. Só outro administrador pode alterar este acesso."
                      : isSelf
                        ? "Você não pode alterar o seu próprio acesso. Peça a outro administrador."
                        : "Você só pode consultar as permissões."}
                  </p>
                )}

                {!targetIsAdmin && (
                  <Field label="Perfil" hint={prof.description}>
                    <SimpleSelect
                      value={detected}
                      onValueChange={pickProfile}
                      options={[...profileOptions(viewer.isAdmin).filter((o) => o.value !== "administrador"), { value: "personalizado", label: "Personalizado (ajustado abaixo)" }]}
                      className={accessLocked ? "pointer-events-none opacity-60" : undefined}
                    />
                  </Field>
                )}

                <div className={cn("grid divide-y rounded-xl border", accessLocked && "pointer-events-none opacity-60")}>
                  {MODULES.map((m) => (
                    <div key={m.key} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                      <div className="grid leading-tight">
                        <span className="flex items-center gap-2 text-[13.5px] font-medium">
                          {m.label}
                          {m.soon && <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">em breve</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">{m.help}</span>
                      </div>
                      <LevelPicker
                        label={m.label}
                        value={targetIsAdmin ? "manage" : perms[m.key]}
                        allowed={m.levels ?? LEVELS}
                        disabledAbove={viewer.isAdmin ? "manage" : viewer.perms[m.key]}
                        onChange={(l) => setPerms((p) => ({ ...p, [m.key as ModuleKey]: l }))}
                      />
                    </div>
                  ))}
                </div>

                {!targetIsAdmin && (
                  <label className={cn("flex items-start gap-3 rounded-xl border p-3", accessLocked && "pointer-events-none opacity-60")}>
                    <Switch checked={ownOnly} onCheckedChange={setOwnOnly} className="mt-0.5" />
                    <span className="grid leading-tight">
                      <span className="text-[13.5px] font-medium">Ver só os próprios</span>
                      <span className="text-xs text-muted-foreground">Só enxerga os negócios em que é responsável ou foi indicado, e a própria agenda. Ideal para parceiros comerciais.</span>
                    </span>
                  </label>
                )}
              </section>

              {canManage && !isSelf && (
                <section className="grid gap-3">
                  <h3 className="label">Conta</h3>
                  <div className="flex items-center gap-3 rounded-xl border p-3">
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    <span className="grid flex-1 leading-tight">
                      <span className="text-[13.5px] font-medium">Conta ativa</span>
                      <span className="text-xs text-muted-foreground">Desativar impede o login e desconecta os aparelhos na hora. O histórico é mantido.</span>
                    </span>
                    <Switch
                      checked={member.active}
                      disabled={pending || (targetIsAdmin && !viewer.isAdmin)}
                      onCheckedChange={(v) =>
                        start(async () => {
                          const r = await setMemberActive(member.id, v);
                          if (r?.error) toast.error(r.error);
                          else {
                            toast.success(v ? "Conta reativada" : "Conta desativada");
                            router.refresh();
                          }
                        })
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={pending || (targetIsAdmin && !viewer.isAdmin)}
                    className="w-fit"
                    onClick={() =>
                      start(async () => {
                        const r = await resetPassword(member.id);
                        if (r?.error) toast.error(r.error);
                        else if (r?.password) setCreds({ email: r.email!, password: r.password });
                      })
                    }
                  >
                    <KeyRound /> Gerar nova senha provisória
                  </Button>
                  <p className="text-xs text-muted-foreground">Gerar uma nova senha desconecta a pessoa de todos os aparelhos.</p>
                </section>
              )}
            </div>
          )}
        </div>

        {!creds && canManage && (
          <SheetFooter className="border-t px-5 py-3">
            <div className="flex w-full justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Salvar
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
