"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { scanAction } from "@/lib/editais-app/actions/radar";
import { fromNow } from "@/lib/format";
import type { RunDTO } from "@/lib/editais/queries";

const active = (r: RunDTO) => r.status === "solicitada" || r.status === "executando";

/**
 * “Buscar oportunidades” com um estado simples ao lado: buscando… / última busca há X (N novos) / erro.
 * Faz uma consulta leve a cada 5 s só enquanto há busca em andamento.
 */
export function ScanControl({ lastFinishedAt, initialBusy }: { lastFinishedAt: string | null; initialBusy: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(initialBusy);
  const [last, setLast] = useState<{ at: string | null; created: number | null; failed: boolean }>({ at: lastFinishedAt, created: null, failed: false });
  const was = useRef(initialBusy);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/editais/status", { cache: "no-store" });
      if (!res.ok) return;
      const { runs } = (await res.json()) as { runs: RunDTO[] };
      const now = runs.some(active);
      const done = runs.find((r) => r.status === "concluida" || r.status === "parcial" || r.status === "falhou");
      if (done) setLast({ at: done.finishedAt, created: typeof done.stats.created === "number" ? done.stats.created : null, failed: done.status === "falhou" });
      if (was.current && !now) router.refresh();
      was.current = now;
      setBusy(now);
    } catch {
      /* sem rede: tenta no próximo ciclo */
    }
  }, [router]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [busy, poll]);

  function go() {
    start(async () => {
      const r = await scanAction();
      if (!r || "error" in r) return void toast.error(r && "error" in r ? String(r.error) : "Não foi possível buscar agora.");
      was.current = true;
      setBusy(true);
      toast.success(r.alreadyOpen ? "Já há uma busca em andamento." : "Buscando oportunidades…", { description: r.alreadyOpen ? undefined : "A varredura rápida já começou; a completa roda no GitHub." });
      void poll();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={go} disabled={pending} className="min-h-11 md:min-h-9">
        {pending || busy ? <Loader2 className="animate-spin" /> : <Search />} {busy ? "Buscando…" : "Buscar oportunidades"}
      </Button>
      <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {busy ? (
          "Procurando editais de restauro no PNCP."
        ) : last.failed ? (
          <>
            <TriangleAlert className="size-3.5 text-brand" /> A última busca falhou.
          </>
        ) : last.at ? (
          <>
            <CheckCircle2 className="size-3.5" /> Última busca {fromNow(last.at)}
            {last.created !== null ? ` · ${last.created} ${last.created === 1 ? "novo" : "novos"}` : ""}
          </>
        ) : (
          "Nenhuma busca ainda."
        )}
      </p>
    </div>
  );
}
