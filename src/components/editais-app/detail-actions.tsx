"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardList, Handshake, Loader2, RotateCcw, Share2, Star, ThumbsDown, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { interestAction, ownerAction, restoreAction, unshareAction, updateShareAction } from "@/lib/editais-app/actions/radar";
import { ROLE_LABEL, type PartnerRole } from "@/lib/editais-app/access";
import { DiscardDialog, ShareDialog, type SharePartner } from "./dialogs";
import { Pill } from "./primitives";

export type ShareLine = { id: string; partnerId: string; partnerName: string; role: PartnerRole; scope: string };

/** O PRÓXIMO PASSO do edital: um botão grande, conforme o momento. */
export function NextStep({
  editalId,
  triage,
  hasDossie,
  mode,
  canEdit,
  canContribute,
  proposalVisible,
  partners,
  shares,
  ownerId,
  team,
}: {
  editalId: string;
  triage: string;
  hasDossie: boolean;
  mode: "staff" | "partner";
  canEdit: boolean;
  canContribute: boolean;
  proposalVisible: boolean;
  partners: SharePartner[];
  shares: ShareLine[];
  ownerId: string | null;
  team: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [discard, setDiscard] = useState(false);
  const [share, setShare] = useState(false);
  const staff = mode === "staff";

  function interest() {
    start(async () => {
      const r = await interestAction(editalId);
      if ("error" in r) return void toast.error(r.error);
      toast.success(staff ? "Marcado como interessante" : "Interesse registrado — a equipe foi avisada");
      router.refresh();
    });
  }
  function restore() {
    start(async () => {
      const r = await restoreAction(editalId);
      if ("error" in r) return void toast.error(r.error);
      toast.success("Voltou para Novos");
      router.refresh();
    });
  }

  const big = "h-14 w-full rounded-2xl text-base sm:w-auto sm:min-w-64";
  const interested = ["interessante", "em_analise"].includes(triage);

  return (
    <section aria-labelledby="proximo" className="ed-card grid gap-4 border-brand/30 bg-brand-soft/40 p-5">
      <h2 id="proximo" className="ed-title text-xl">
        {staff ? "Próximo passo" : "O que você pode fazer"}
      </h2>

      <div className="flex flex-wrap gap-3">
        {staff && canEdit ? (
          hasDossie ? (
            <Button asChild className={big}>
              <Link href={`/editais/propostas/${editalId}`}>
                <ClipboardList /> Abrir a proposta
              </Link>
            </Button>
          ) : triage === "descartado" ? (
            <Button className={big} variant="outline" onClick={restore} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restaurar para Novos
            </Button>
          ) : interested || triage === "em_proposta" ? (
            <Button asChild className={big}>
              <Link href={`/editais/participar/${editalId}`}>
                <ArrowRight /> Vou participar
              </Link>
            </Button>
          ) : (
            <>
              <Button className={big} onClick={interest} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Star />} Tenho interesse
              </Button>
              <Button asChild variant="outline" className="h-14 rounded-2xl px-6 text-base">
                <Link href={`/editais/participar/${editalId}`}>Já vou participar</Link>
              </Button>
            </>
          )
        ) : null}
        {!staff && proposalVisible && (
          <Button asChild className={big}>
            <Link href={`/editais/propostas/${editalId}`}>
              <ClipboardList /> Ver a proposta
            </Link>
          </Button>
        )}
        {!staff && canContribute && !proposalVisible && (
          <Button className={big} onClick={interest} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Star />} Tenho interesse
          </Button>
        )}
        {!staff && !canContribute && !proposalVisible && <p className="text-sm text-muted-foreground">Você acompanha este edital. Para comentar ou marcar interesse, peça à equipe o acesso “Pode contribuir”.</p>}
        {staff && canEdit && triage !== "descartado" && !hasDossie && (
          <Button variant="outline" className="h-14 rounded-2xl px-6 text-base" onClick={() => setDiscard(true)}>
            <ThumbsDown /> Descartar
          </Button>
        )}
      </div>

      {staff && canEdit && (
        <div className="grid gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Handshake className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Parceiros</span>
            {shares.length === 0 && <span className="text-sm text-muted-foreground">Ninguém ainda.</span>}
            {shares.map((s) => (
              <ShareChip key={s.id} s={s} editalId={editalId} onChange={() => router.refresh()} />
            ))}
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShare(true)}>
              <Share2 /> Compartilhar
            </Button>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Responsável</span>
            <select
              defaultValue={ownerId ?? ""}
              onChange={(e) =>
                start(async () => {
                  const r = await ownerAction(editalId, e.target.value || null);
                  if ("error" in r) return void toast.error(r.error);
                  toast.success("Responsável atualizado");
                  router.refresh();
                })
              }
              className="h-11 rounded-xl border bg-card px-3 text-base md:h-9 md:text-sm"
            >
              <option value="">Sem responsável</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {discard && (
        <DiscardDialog
          editalId={editalId}
          open
          onOpenChange={(o) => !o && setDiscard(false)}
          onDone={() => {
            setDiscard(false);
            router.refresh();
          }}
        />
      )}
      {share && (
        <ShareDialog
          editalIds={[editalId]}
          partners={partners.filter((p) => !shares.some((s) => s.partnerId === p.id))}
          hasDossie={hasDossie}
          open
          onOpenChange={(o) => !o && setShare(false)}
          onDone={() => {
            setShare(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

export function ShareChip({ s, editalId, onChange }: { s: ShareLine; editalId: string; onChange: () => void }) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-3 text-sm">
      {s.partnerName.split(" ")[0]}
      <Pill tone={s.role === "contribuir" ? "brand" : "mute"} className="px-2">
        {ROLE_LABEL[s.role]}
      </Pill>
      <button
        type="button"
        aria-label={`Alternar ${s.partnerName} entre só ver e contribuir`}
        title="Alternar entre só ver e contribuir"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await updateShareAction(s.id, { role: s.role === "ver" ? "contribuir" : "ver" });
            if ("error" in r) return void toast.error(r.error);
            onChange();
          })
        }
        className="grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label={`Parar de compartilhar com ${s.partnerName}`}
        title="Parar de compartilhar"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await unshareAction(editalId, s.partnerId);
            if ("error" in r) return void toast.error(r.error);
            toast.success("Deixou de compartilhar");
            onChange();
          })
        }
        className="grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
