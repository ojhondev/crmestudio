"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarCheck, CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EVENT_TYPES } from "@/lib/constants";
import { disconnectGoogle, saveSyncTypes, syncNow } from "./calendar-actions";

export type GoogleInfo = {
  connected: boolean;
  email: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  syncTypes: string[] | null;
  hasCalendar: boolean;
  realtime: boolean;
  configured: boolean;
};

const RESULT: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Google Agenda conectado! Já estamos sincronizando." },
  negado: { ok: false, text: "Você cancelou a autorização no Google. Nada foi conectado." },
  escopo: { ok: false, text: "A permissão da agenda não foi concedida. Tente de novo e deixe a caixa da Agenda marcada." },
  sem_refresh: { ok: false, text: "O Google não liberou o acesso contínuo. Tente conectar de novo." },
  estado: { ok: false, text: "A conexão expirou ou veio de outra janela. Tente conectar de novo." },
  troca: { ok: false, text: "Não foi possível concluir a conexão com o Google. Tente de novo." },
  nao_configurado: { ok: false, text: "O Google ainda não está configurado neste sistema." },
};

function ago(iso: string | null) {
  if (!iso) return "ainda não sincronizou";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora há pouco";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} dia(s)`;
}

/** Sincronização em duas vias com o Google Agenda da própria pessoa. */
export function GoogleSync({ info, result }: { info: GoogleInfo; result?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!result);
  const [busy, start] = useTransition();
  const [confirmOff, setConfirmOff] = useState(false);
  const [types, setTypes] = useState<string[]>(info.syncTypes ?? Object.keys(EVENT_TYPES));
  const ran = useRef(false);

  // resultado do retorno do Google (?google=...)
  useEffect(() => {
    if (!result) return;
    const r = RESULT[result];
    if (r) (r.ok ? toast.success : toast.error)(r.text);
    router.replace("/agenda");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ao abrir a Agenda, atualiza em segundo plano (se faz mais de 2 min)
  useEffect(() => {
    const stale = !info.lastSyncAt || Date.now() - new Date(info.lastSyncAt).getTime() > 2 * 60_000;
    if (ran.current || !info.connected || !stale) return;
    ran.current = true;
    syncNow().then((r) => {
      if (r.ok && (r.changes ?? 0) > 0) router.refresh();
      else if (!r.ok) router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSync = () =>
    start(async () => {
      const r = await syncNow();
      if (!r.ok) toast.error(r.error ?? "Não foi possível sincronizar.");
      else if (r.busy) toast.info("Já existe uma sincronização em andamento.");
      else toast.success(r.changes ? `Sincronizado: ${r.changes} alteração(ões).` : "Tudo em dia.");
      router.refresh();
    });

  const toggle = (t: string, on: boolean) => setTypes((cur) => (on ? [...new Set([...cur, t])] : cur.filter((x) => x !== t)));
  const saveTypes = () =>
    start(async () => {
      const r = await saveSyncTypes(types);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Tipos salvos. Sincronizando…");
      const s = await syncNow();
      if (!s.ok) toast.error(s.error ?? "Falha ao sincronizar.");
      router.refresh();
    });

  const off = (removeEvents: boolean) =>
    start(async () => {
      await disconnectGoogle(removeEvents);
      toast.success(removeEvents ? "Desconectado e eventos removidos do Google." : "Desconectado. Os eventos continuam no seu Google Agenda.");
      setConfirmOff(false);
      setOpen(false);
      router.refresh();
    });

  const problem = info.connected && info.status !== "ativo";
  const typesChanged = JSON.stringify([...types].sort()) !== JSON.stringify([...(info.syncTypes ?? Object.keys(EVENT_TYPES))].sort());

  return (
    <>
      <Button variant="outline" aria-label="Google Agenda" onClick={() => setOpen(true)} className="relative">
        {problem ? <AlertTriangle className="text-destructive" /> : info.connected ? <CalendarCheck className="text-emerald-600" /> : <CalendarDays />}
        <span className="max-md:sr-only">Google Agenda</span>
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmOff(false); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-normal">Google Agenda</DialogTitle>
            <DialogDescription>Os eventos daqui aparecem no seu Google Agenda, e o que você marcar lá volta para cá.</DialogDescription>
          </DialogHeader>

          {!info.connected ? (
            <div className="grid gap-4 text-[13px]">
              <ul className="grid gap-2 text-muted-foreground">
                <li>• Criamos no seu Google uma agenda separada chamada <strong className="text-foreground">“Estúdio Restaura”</strong>.</li>
                <li>• Só ela é sincronizada. <strong className="text-foreground">Sua agenda pessoal não é lida nem alterada.</strong></li>
                <li>• Criou, mudou ou apagou aqui? Aparece lá. Fez isso lá? Aparece aqui.</li>
                <li>• Você pode desconectar quando quiser.</li>
              </ul>
              {info.status === "desconectado" && info.lastError && <p className="text-destructive">{info.lastError}</p>}
              {info.configured ? (
                <Button asChild size="lg" className="min-h-11">
                  <a href="/api/calendar/connect">
                    <CalendarDays /> Conectar Google Agenda
                  </a>
                </Button>
              ) : (
                <p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">O Google ainda não foi configurado neste sistema. Avise o administrador.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Prefere só ver a agenda no celular, sem editar por lá? Use o botão “Assinar por link”.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 text-[13px]">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-medium break-all">Conectado como {info.email ?? "sua conta Google"}</p>
                <p className="text-muted-foreground">
                  Última sincronização: {ago(info.lastSyncAt)}
                  {info.realtime ? " · atualização quase instantânea" : " · atualiza a cada 15 minutos e quando você abre a Agenda"}
                </p>
              </div>
              {problem && (
                <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{info.lastError ?? "Houve um problema na última sincronização."}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={doSync} disabled={busy} className="min-h-11">
                  {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar agora
                </Button>
                {info.status === "reautorizar" && (
                  <Button asChild variant="secondary" className="min-h-11">
                    <a href="/api/calendar/connect">Reconectar</a>
                  </Button>
                )}
              </div>

              <fieldset className="grid gap-1">
                <legend className="mb-1 font-medium">Quais eventos vão para o Google?</legend>
                {Object.entries(EVENT_TYPES).map(([k, t]) => (
                  <div key={k} className="flex min-h-11 items-center gap-3">
                    <Checkbox id={`gt-${k}`} checked={types.includes(k)} onCheckedChange={(v) => toggle(k, v === true)} />
                    <Label htmlFor={`gt-${k}`} className="flex-1 font-normal">{t.label}</Label>
                  </div>
                ))}
                {typesChanged && (
                  <Button size="sm" onClick={saveTypes} disabled={busy} className="mt-1 min-h-11 w-fit">
                    Salvar escolha
                  </Button>
                )}
              </fieldset>

              <div className="border-t pt-3">
                {!confirmOff ? (
                  <Button variant="ghost" className="min-h-11 text-muted-foreground hover:text-destructive" onClick={() => setConfirmOff(true)}>
                    Desconectar
                  </Button>
                ) : (
                  <div className="grid gap-2 rounded-lg border p-3">
                    <p className="font-medium">O que fazer com os eventos que já estão no seu Google Agenda?</p>
                    <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => off(false)}>
                      {busy && <Loader2 className="animate-spin" />} Desconectar e manter os eventos lá
                    </Button>
                    <Button variant="outline" className="min-h-11 text-destructive" disabled={busy} onClick={() => off(true)}>
                      Desconectar e remover os eventos do Google
                    </Button>
                    <Button variant="ghost" className="min-h-11" onClick={() => setConfirmOff(false)}>
                      Cancelar
                    </Button>
                    <p className="text-xs text-muted-foreground">Nada é apagado aqui no CRM, em nenhuma das opções.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
