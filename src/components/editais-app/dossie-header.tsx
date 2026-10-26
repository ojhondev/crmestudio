"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Handshake, Loader2, Pencil, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { dossieDataAction, recalcAction } from "@/lib/editais-app/actions/propostas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShareDialog, type SharePartner } from "./dialogs";
import { ShareChip, type ShareLine } from "./detail-actions";

/** Barra de ações da proposta (equipe): compartilhar com parceiros e editar os dados (data limite, responsável, nº). */
export function DossieActions({
  editalId,
  shares,
  partners,
  team,
  data,
}: {
  editalId: string;
  shares: ShareLine[];
  partners: SharePartner[];
  team: { id: string; name: string }[];
  data: { numero: string; processo: string; sessionLocal: string; ownerId: string };
}) {
  const router = useRouter();
  const [share, setShare] = useState(false);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(data);
  const [pending, start] = useTransition();
  const input = "h-11 w-full rounded-xl border bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-10 md:text-sm";

  function save() {
    start(async () => {
      const r = await dossieDataAction(editalId, { numero: f.numero, processo: f.processo, sessionAt: f.sessionLocal || null, ownerId: f.ownerId || null });
      if ("error" in r) return void toast.error(r.error);
      if (f.sessionLocal !== data.sessionLocal) {
        const rc = await recalcAction(editalId);
        if ("error" in rc) toast.message("Dados salvos", { description: rc.error });
        else toast.success("Dados salvos e prazos recalculados");
      } else toast.success("Dados salvos");
      setEdit(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Handshake className="size-4 text-muted-foreground" aria-hidden />
      {shares.length === 0 && <span className="text-sm text-muted-foreground">Sem parceiros</span>}
      {shares.map((s) => (
        <ShareChip key={s.id} s={s} editalId={editalId} onChange={() => router.refresh()} />
      ))}
      <Button variant="outline" size="sm" className="min-h-11 rounded-full md:min-h-9" onClick={() => setShare(true)}>
        <Share2 /> Compartilhar
      </Button>
      <Button variant="outline" size="sm" className="min-h-11 rounded-full md:min-h-9" onClick={() => setEdit(true)}>
        <Pencil /> Dados da proposta
      </Button>

      {share && (
        <ShareDialog
          editalIds={[editalId]}
          partners={partners.filter((p) => !shares.some((s) => s.partnerId === p.id))}
          hasDossie
          open
          onOpenChange={(o) => !o && setShare(false)}
          onDone={() => {
            setShare(false);
            router.refresh();
          }}
        />
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="ed-title text-xl">Dados da proposta</DialogTitle>
              <DialogDescription>Mudar a data limite recalcula os prazos do checklist que ainda estão abertos.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <label className="grid gap-1 text-[13px] font-medium">
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden /> Data limite da sessão
                </span>
                <input type="datetime-local" value={f.sessionLocal} onChange={(e) => setF({ ...f, sessionLocal: e.target.value })} className={input} />
              </label>
              <label className="grid gap-1 text-[13px] font-medium">
                Responsável
                <select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} className={input}>
                  <option value="">Ninguém</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[13px] font-medium">
                  Nº do edital
                  <input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} className={input} maxLength={80} />
                </label>
                <label className="grid gap-1 text-[13px] font-medium">
                  Nº do processo
                  <input value={f.processo} onChange={(e) => setF({ ...f, processo: e.target.value })} className={input} maxLength={80} />
                </label>
              </div>
              <Button className="min-h-12 rounded-xl" onClick={save} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
