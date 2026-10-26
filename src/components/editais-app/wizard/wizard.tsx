"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { advance, clampIndex, firstInvalid, progressPct, readDraft, visibleSteps, type StepDef } from "@/lib/editais-app/wizard-engine";

export type WizStep<V> = StepDef<V> & {
  /** a pergunta (uma por tela) */
  title: string;
  help?: string;
  /** passo opcional: mostra “Pular” */
  optional?: boolean;
  render: (c: { v: V; set: (patch: Partial<V>) => void; next: () => void; error: string | null }) => React.ReactNode;
};

export type WizardOk = { ok: true; href: string; title?: string; message?: string; next?: { label: string; href: string }; /** dados para uma tela final própria (renderDone) */ data?: unknown };
export type WizardResult = WizardOk | { error: string };

type Props<V extends object> = {
  /** chave do rascunho (um por fluxo e por edital) */
  id: string;
  /** nome do fluxo, no topo */
  name: string;
  closeHref: string;
  initial: V;
  steps: WizStep<V>[];
  /** passo final “Revise” (opcional) */
  review?: (v: V, go: (stepId: string) => void) => React.ReactNode;
  reviewTitle?: string;
  submitLabel?: string;
  onSubmit: (v: V) => Promise<WizardResult>;
  /** tela final própria (ex.: convite pronto para copiar); sem ela, a tela de sucesso padrão */
  renderDone?: (r: WizardOk) => React.ReactNode;
};

/**
 * Assistente passo a passo (uma pergunta por tela): barra de progresso, Continuar / Voltar, Enter avança,
 * rascunho salvo sozinho neste aparelho e uma tela final de sucesso. Regras de passo em lib/editais-app/wizard-engine.ts.
 */
export function Wizard<V extends object>({ id, name, closeHref, initial, steps, review, reviewTitle = "Revise e conclua", submitLabel = "Concluir", onSubmit, renderDone }: Props<V>) {
  const [v, setV] = useState<V>(initial);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<WizardOk | null>(null);
  const [restored, setRestored] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const ready = useRef(false);
  const key = `ed-wiz:${id}`;

  const vis = useMemo(() => visibleSteps(steps, v), [steps, v]);
  const hasReview = !!review;
  const total = vis.length + (hasReview ? 1 : 0);
  const idx = clampIndex(index, vis.length, hasReview);
  const onReview = hasReview && idx === vis.length;
  const step = onReview ? null : vis[idx];

  // recupera o rascunho deste aparelho
  useEffect(() => {
    try {
      const d = readDraft<V>(localStorage.getItem(key));
      if (d) {
        // restaura depois da hidratação (localStorage só existe no navegador)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setV({ ...initial, ...d.v });
        setIndex(d.index);
        setRestored(d.index > 0);
      }
    } catch {
      /* sem armazenamento: segue sem rascunho */
    }
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // salva o rascunho sozinho
  useEffect(() => {
    if (!ready.current || done) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ v, index: idx, at: Date.now() }));
      } catch {
        /* cheio ou bloqueado: ignora */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [v, idx, key, done]);

  // foco: no primeiro campo da pergunta, ou no título
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? headRef.current;
      el?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(t);
  }, [idx, done]);

  const set = useCallback((patch: Partial<V>) => {
    setV((cur) => ({ ...cur, ...patch }));
    setError(null);
  }, []);

  const finish = useCallback(async () => {
    const bad = firstInvalid(steps, v);
    if (bad) {
      setDir("back");
      setIndex(bad.index);
      setError(bad.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await onSubmit(v);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* ok */
      }
      setDone(r);
    } catch {
      setError("Não foi possível concluir agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }, [steps, v, onSubmit, key]);

  const next = useCallback(() => {
    if (busy) return;
    if (onReview) return void finish();
    const a = advance(steps, v, idx, { hasReview });
    if (a.kind === "error") return setError(a.error);
    if (a.kind === "submit") return void finish();
    setError(null);
    setDir("fwd");
    setIndex(a.index);
  }, [busy, onReview, finish, steps, v, idx, hasReview]);

  const back = useCallback(() => {
    if (busy || idx === 0) return;
    setError(null);
    setDir("back");
    setIndex(idx - 1);
  }, [busy, idx]);

  const goTo = useCallback(
    (stepId: string) => {
      const i = vis.findIndex((s) => s.id === stepId);
      if (i >= 0) {
        setDir("back");
        setIndex(i);
      }
    },
    [vis],
  );

  // Enter avança (menos em área de texto e em botões); Alt+← volta
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === "ArrowLeft" && e.altKey) return void back();
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "BODY";
      if (tag === "TEXTAREA") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          next();
        }
        return;
      }
      if (tag === "BUTTON" || tag === "A" || tag === "SELECT" || tag === "SUMMARY") return;
      e.preventDefault();
      next();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [next, back, done]);

  function restart() {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ok */
    }
    setV(initial);
    setIndex(0);
    setRestored(false);
    setError(null);
  }

  if (done && renderDone) return <>{renderDone(done)}</>;
  if (done) {
    return (
      <div className="grid min-h-svh place-items-center px-6 py-10">
        <div className="ed-step-in grid max-w-md justify-items-center gap-5 text-center" role="status">
          <span className="grid size-16 place-items-center rounded-full bg-brand text-on-brand">
            <Check className="size-8" strokeWidth={2.4} />
          </span>
          <h1 className="ed-title text-3xl">{done.title ?? "Pronto!"}</h1>
          {done.message && <p className="text-[17px] text-muted-foreground">{done.message}</p>}
          <div className="grid w-full gap-2.5">
            {done.next && (
              <Button asChild size="lg" className="h-14 rounded-2xl text-base">
                <Link href={done.next.href}>
                  {done.next.label} <ArrowRight />
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant={done.next ? "outline" : "default"} className="h-14 rounded-2xl text-base">
              <Link href={done.href}>{done.next ? "Voltar" : "Continuar"}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const pct = progressPct(idx, total);
  const title = onReview ? reviewTitle : step?.title;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-3 sm:px-5">
          <Link href={closeHref} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label="Sair do assistente (o rascunho fica salvo)">
            <X className="size-5" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
          <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {Math.min(idx + 1, total)} / {total}
          </p>
        </div>
        <div className="h-1 bg-muted" role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full bg-brand transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="flex-1">
        <div className="mx-auto max-w-2xl px-5 pt-8 pb-40 sm:pt-14">
          {restored && idx > 0 && (
            <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-brand-soft px-4 py-2.5 text-sm">
              Retomamos de onde você parou.
              <button type="button" onClick={restart} className="inline-flex min-h-8 items-center gap-1 font-medium underline underline-offset-2">
                <RotateCcw className="size-3.5" /> Recomeçar
              </button>
            </p>
          )}
          <p aria-live="polite" className="sr-only">
            Passo {Math.min(idx + 1, total)} de {total}: {title}
          </p>
          <div key={`${onReview ? "review" : step?.id}`} ref={bodyRef} className={dir === "fwd" ? "ed-step-in" : "ed-step-back"}>
            <h1 ref={headRef} tabIndex={-1} className="ed-title mb-2 text-[28px] outline-none sm:text-[40px]">
              {title}
            </h1>
            {!onReview && step?.help && <p className="mb-6 text-[17px] text-muted-foreground">{step.help}</p>}
            <div className="mt-6">{onReview ? review?.(v, goTo) : step?.render({ v, set, next, error })}</div>
            {error && (
              <p role="alert" className="mt-5 rounded-xl bg-red-100 px-4 py-3 text-[15px] text-red-900 dark:bg-red-500/15 dark:text-red-300">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="ed-safe-bottom fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-3 pb-1 sm:px-5">
          <Button type="button" variant="outline" size="lg" onClick={back} disabled={idx === 0 || busy} className="h-12 rounded-2xl px-4 sm:px-5" aria-label="Voltar">
            <ArrowLeft /> <span className="max-sm:sr-only">Voltar</span>
          </Button>
          {step?.optional && !onReview && (
            <Button type="button" variant="ghost" size="lg" className="h-12 rounded-2xl" onClick={() => (idx + 1 < total ? (setDir("fwd"), setIndex(idx + 1)) : void finish())}>
              Pular
            </Button>
          )}
          <Button type="button" size="lg" onClick={next} disabled={busy} className="h-12 flex-1 rounded-2xl text-base">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {onReview || (!hasReview && idx === vis.length - 1) ? submitLabel : "Continuar"}
            {!busy && !(onReview || (!hasReview && idx === vis.length - 1)) && <ArrowRight />}
            <kbd className={cn("ml-1 hidden rounded border border-current/30 px-1.5 py-0.5 text-[11px] font-normal opacity-70 sm:inline")}>Enter ↵</kbd>
          </Button>
        </div>
      </footer>
    </div>
  );
}

/** Linha “pergunta → resposta” da tela de revisão, com botão para corrigir. */
export function ReviewRow({ label, value, onEdit }: { label: string; value: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-[17px] font-medium break-words">{value || <span className="text-muted-foreground">—</span>}</div>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="min-h-11 shrink-0 px-2 text-sm font-medium text-brand underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Editar
        </button>
      )}
    </div>
  );
}
