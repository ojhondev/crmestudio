"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Radar, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requestScanAction } from "./actions";
import type { RunDTO } from "@/lib/editais/queries";

const EVENT = "editais:scan";
const active = (r: RunDTO) => r.status === "solicitada" || r.status === "executando";

/** Botão da barra de ferramentas: pede a varredura (grava o pedido para o GitHub e roda a rápida já). */
export function ScanButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      data-tour="edital-scan"
      disabled={pending}
      className="max-md:h-11"
      onClick={() =>
        start(async () => {
          const r = await requestScanAction();
          if (!r || !("ok" in r)) return;
          window.dispatchEvent(new Event(EVENT));
          toast.success(r.alreadyOpen ? "Já havia um pedido em andamento — acompanhe abaixo." : "Busca pedida: a varredura rápida já começou e o GitHub fará a completa.", {
            description: r.alreadyOpen ? undefined : r.githubDispatched ? "Disparei o GitHub agora mesmo." : "O GitHub verifica pedidos a cada 30 minutos.",
          });
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Search />} Buscar oportunidades
    </Button>
  );
}

function summary(runs: RunDTO[]) {
  const req = runs.find((r) => r.mode === "completa" && r.parentId === null && r.trigger !== "agendada" && r.trigger !== "github") ?? null;
  const full = runs.find((r) => r.mode === "completa") ?? null;
  const quick = runs.find((r) => r.mode === "rapida" && (!req || r.parentId === req.id)) ?? null;
  return { full, quick };
}

function n(v: unknown) {
  return typeof v === "number" ? v : 0;
}

/** Estado das rodadas com polling leve (5 s enquanto algo está em andamento). */
export function RunStatus({ initial }: { initial: RunDTO[] }) {
  const router = useRouter();
  const [runs, setRuns] = useState(initial);
  // quando a página recarrega com dados novos do servidor, eles valem mais que o último polling
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRuns(initial);
  }
  const [watch, setWatch] = useState(initial.some(active));
  const wasActive = useRef(initial.some(active));

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/editais/status", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { runs: RunDTO[] };
      setRuns(j.runs);
      const now = j.runs.some(active);
      if (wasActive.current && !now) router.refresh();
      wasActive.current = now;
      setWatch(now);
    } catch {
      /* sem rede: tenta de novo no próximo ciclo */
    }
  }, [router]);

  useEffect(() => {
    const on = () => {
      wasActive.current = true;
      setWatch(true);
      void poll();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [poll]);

  useEffect(() => {
    if (!watch) return;
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [watch, poll]);

  const { full, quick } = summary(runs);
  if (!full && !quick) {
    return (
      <div data-tour="edital-run" className="flex items-start gap-2.5 rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
        <Radar className="mt-0.5 size-4 shrink-0" />
        <p>Nenhuma varredura ainda. Use <strong className="font-medium text-foreground">Buscar oportunidades</strong> para procurar editais de restauro no PNCP.</p>
      </div>
    );
  }

  const lines: { key: string; icon: "spin" | "ok" | "warn" | "wait"; text: React.ReactNode }[] = [];
  if (quick) {
    const s = quick.stats;
    lines.push({
      key: "q",
      icon: quick.status === "executando" ? "spin" : quick.status === "concluida" ? "ok" : "warn",
      text:
        quick.status === "executando"
          ? "Varredura rápida em andamento…"
          : quick.status === "concluida"
            ? `Varredura rápida concluída ${fmtDateTime(quick.finishedAt)} — ${n(s.created)} ${n(s.created) === 1 ? "edital novo" : "editais novos"}, ${n(s.relevant)} relevantes encontrados.`
            : `Varredura rápida parou antes do fim (${quick.error ?? "o PNCP demorou"}); a completa do GitHub cobre o resto.`,
    });
  }
  if (full) {
    const s = full.stats;
    const link = full.runUrl ? (
      <a href={full.runUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 underline underline-offset-2">
        ver execução <ExternalLink className="size-3" />
      </a>
    ) : null;
    lines.push({
      key: "f",
      icon: full.status === "executando" ? "spin" : full.status === "solicitada" ? "wait" : full.status === "concluida" ? "ok" : "warn",
      text:
        full.status === "solicitada" ? (
          <>Varredura completa solicitada por {full.requestedByName ?? "alguém"} — o GitHub atende em até ~30 minutos.</>
        ) : full.status === "executando" ? (
          <>
            Varredura completa rodando no GitHub ({n(s.scanned)} editais vistos, {n(s.created)} novos até agora).{link}
          </>
        ) : full.status === "concluida" ? (
          <>
            Varredura completa concluída {fmtDateTime(full.finishedAt)} — {n(s.created)} {n(s.created) === 1 ? "novo" : "novos"}, {n(s.relevant)} relevantes em {n(s.scanned)} editais vistos.{link}
          </>
        ) : full.status === "parcial" ? (
          <>Varredura completa parou no meio ({full.error ?? "interrompida"}); será retomada automaticamente.{link}</>
        ) : (
          <>Varredura completa falhou: {full.error ?? "erro"}.{link}</>
        ),
    });
  }

  return (
    <div data-tour="edital-run" role="status" aria-live="polite" className="grid gap-1.5 rounded-xl border bg-card px-4 py-3 text-[13px]">
      {lines.map((l) => (
        <p key={l.key} className="flex items-start gap-2.5">
          {l.icon === "spin" ? (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" />
          ) : l.icon === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : l.icon === "wait" ? (
            <Radar className="mt-0.5 size-4 shrink-0 text-brand" />
          ) : (
            <CircleAlert className={cn("mt-0.5 size-4 shrink-0 text-brand")} />
          )}
          <span className="min-w-0 break-words">{l.text}</span>
        </p>
      ))}
    </div>
  );
}
