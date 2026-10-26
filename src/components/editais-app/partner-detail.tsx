"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, KeyRound, Loader2, RotateCw, Send, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";
import { INVITE_LABEL } from "@/lib/editais-app/invite";
import { ROLE_LABEL, SCOPE_LABEL } from "@/lib/editais-app/access";
import { radarCompletoAction, reactivatePartnerAction, resendInviteAction, resetPartnerPasswordAction, revokePartnerAction } from "@/lib/editais-app/actions/partners";
import { unshareAction, updateShareAction } from "@/lib/editais-app/actions/radar";
import type { InvitePack, PartnerDTO, PartnerShareRow } from "@/lib/editais-app/partners";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvitePanel } from "./invite-panel";
import { Pill, daysText, type Tone } from "./primitives";

const TONE: Record<string, Tone> = { pendente: "warn", aceito: "good", revogado: "mute" };

export function PartnerDetail({ p, shares, now }: { p: PartnerDTO; shares: (PartnerShareRow & { daysLeft: number | null })[]; now: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pack, setPack] = useState<InvitePack | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const revoked = p.state === "revogado";

  function run(fn: () => Promise<{ error: string } | { ok: true; pack?: InvitePack }>, okMsg: string, openPack = false) {
    start(async () => {
      const r = await fn();
      if ("error" in r) return void toast.error(r.error);
      toast.success(okMsg);
      if (openPack && "pack" in r && r.pack) setPack(r.pack);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <section className="ed-card grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="ed-title text-2xl">{p.name}</h2>
            <p className="text-[15px] text-muted-foreground">{[p.company, p.areas].filter(Boolean).join(" · ") || "Parceiro de editais"}</p>
          </div>
          <Pill tone={TONE[p.state]}>{INVITE_LABEL[p.state]}</Pill>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">E-mail</dt>
            <dd className="break-all">{p.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">WhatsApp</dt>
            <dd>{p.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Convite</dt>
            <dd>{p.channel === "email" ? `Enviado por e-mail${p.inviteSentAt ? ` em ${fmtDateTime(p.inviteSentAt)}` : ""}` : "Pendente de envio (manual)"} · {p.inviteCount} {p.inviteCount === 1 ? "vez" : "vezes"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Último acesso</dt>
            <dd>{p.lastLoginAt ? fmtDateTime(p.lastLoginAt) : "Ainda não entrou"}</dd>
          </div>
        </dl>
        {p.inviteError && <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">Último envio por e-mail falhou: {p.inviteError}</p>}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {!revoked && (
            <>
              <Button className="min-h-11 rounded-full" disabled={pending} onClick={() => run(() => resendInviteAction(p.id), "Convite refeito", true)}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />} {p.state === "aceito" ? "Reenviar o convite" : "Reenviar / copiar o convite"}
              </Button>
              <Button variant="outline" className="min-h-11 rounded-full" disabled={pending} onClick={() => run(() => resetPartnerPasswordAction(p.id), "Nova senha provisória gerada", true)}>
                <KeyRound /> Nova senha provisória
              </Button>
              <Button variant="destructive" className="min-h-11 rounded-full" disabled={pending} onClick={() => setConfirmRevoke(true)}>
                <Ban /> Revogar acesso
              </Button>
            </>
          )}
          {revoked && (
            <Button className="min-h-11 rounded-full" disabled={pending} onClick={() => run(() => reactivatePartnerAction(p.id), "Acesso reativado", true)}>
              <UserCheck /> Reativar o acesso
            </Button>
          )}
        </div>

        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--brand)]"
            checked={p.radarCompleto}
            disabled={pending || revoked}
            onChange={(e) => run(() => radarCompletoAction(p.id, e.target.checked), e.target.checked ? "Radar completo liberado" : "Radar completo desligado")}
          />
          <span>
            <span className="block text-[15px] font-medium">Liberar o Radar completo</span>
            <span className="block text-[13px] text-muted-foreground">Ele passa a ver todos os editais coletados (só leitura, sem as notas da equipe). Desligado, vê apenas o que for compartilhado.</span>
          </span>
        </label>
      </section>

      <section aria-labelledby="comp" className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 id="comp" className="ed-title text-xl">
            Compartilhado com {p.name.split(" ")[0]} <span className="text-base text-muted-foreground">({shares.length})</span>
          </h2>
          <Link href="/editais/radar" className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-2">
            Compartilhar mais no Radar
          </Link>
        </div>
        {shares.length === 0 ? (
          <p className="ed-card p-5 text-sm text-muted-foreground">Nada compartilhado ainda. No Radar, toque em Compartilhar num edital ou use “Selecionar vários”.</p>
        ) : (
          <ul className="grid gap-3">
            {shares.map((s) => (
              <ShareRow key={s.id} s={s} partnerId={p.id} now={now} onChange={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>

      {pack && (
        <Dialog open onOpenChange={(o) => !o && setPack(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="ed-title text-xl">Convite para {p.name.split(" ")[0]}</DialogTitle>
              <DialogDescription>Copie o texto ou mande pelo WhatsApp.</DialogDescription>
            </DialogHeader>
            <InvitePanel pack={pack} name={p.name} />
          </DialogContent>
        </Dialog>
      )}

      {confirmRevoke && (
        <Dialog open onOpenChange={(o) => !o && setConfirmRevoke(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="ed-title text-xl">Revogar o acesso de {p.name.split(" ")[0]}?</DialogTitle>
              <DialogDescription>A conta é desativada e as sessões abertas caem agora. Os compartilhamentos ficam guardados, caso você reative depois.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" className="min-h-12 rounded-xl" onClick={() => setConfirmRevoke(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="min-h-12 rounded-xl"
                disabled={pending}
                onClick={() => {
                  setConfirmRevoke(false);
                  run(() => revokePartnerAction(p.id), "Acesso revogado");
                }}
              >
                Revogar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ShareRow({ s, partnerId, now, onChange }: { s: PartnerShareRow & { daysLeft: number | null }; partnerId: string; now: number; onChange: () => void }) {
  const [pending, start] = useTransition();
  void now;
  const patch = (p: Parameters<typeof updateShareAction>[1]) =>
    start(async () => {
      const r = await updateShareAction(s.id, p);
      if ("error" in r) return void toast.error(r.error);
      onChange();
    });
  const sel = "h-11 rounded-xl border bg-card px-2 text-base md:h-9 md:text-sm";
  return (
    <li className="ed-card grid gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/editais/radar/${s.editalId}`} className="line-clamp-2 text-[16px] leading-snug font-medium underline-offset-2 hover:underline">
            {s.title}
          </Link>
          <p className="text-[13px] text-muted-foreground">
            {s.uf ? `${s.uf} · ` : ""}
            {s.organ} · {daysText(s.daysLeft)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Parar de compartilhar"
          title="Parar de compartilhar"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await unshareAction(s.editalId, partnerId);
              if ("error" in r) return void toast.error(r.error);
              toast.success("Deixou de compartilhar");
              onChange();
            })
          }
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[13px]">
          <span className="sr-only">Papel</span>
          <select aria-label="Papel do parceiro" value={s.role} onChange={(e) => patch({ role: e.target.value })} className={sel}>
            {(["ver", "contribuir"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[13px]">
          <span className="sr-only">Alcance</span>
          <select aria-label="Alcance do compartilhamento" value={s.scope} onChange={(e) => patch({ scope: e.target.value })} className={sel}>
            {(["edital", "proposta"] as const).map((r) => (
              <option key={r} value={r}>
                {SCOPE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        {s.scope === "proposta" && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-[13px]">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={s.showDocs} onChange={(e) => patch({ showDocs: e.target.checked })} /> Documentos
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[13px]">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={s.showSheet} onChange={(e) => patch({ showSheet: e.target.checked })} /> Planilha
            </label>
          </>
        )}
        <RotateCw className="hidden" aria-hidden />
      </div>
    </li>
  );
}
