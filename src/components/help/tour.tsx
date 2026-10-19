"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tours, tourForPath, type TourStep } from "@/lib/help";
import { cn } from "@/lib/utils";

type Ctx = {
  start: (id: string) => void;
  /** abre a tela do tour (se preciso) e inicia */
  launch: (id: string, href?: string) => void;
  startForPage: () => void;
  stop: () => void;
  active: boolean;
};
const PENDING = "restaura:pending-tour";
const TourContext = createContext<Ctx | null>(null);

export function useTour() {
  const c = use(TourContext);
  if (!c) throw new Error("useTour fora do TourProvider");
  return c;
}

const seenKey = (userId: string, id: string) => `restaura:tour:${userId}:${id}`;

/** Primeiro elemento visível entre os alvos candidatos (menu lateral × barra inferior). */
function findTarget(names?: string[]): HTMLElement | null {
  if (!names) return null;
  for (const n of names) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${n}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

export function TourProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tourId, setTourId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  // false no servidor/hidratação, true no navegador (portal só existe no cliente)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dirRef = useRef<1 | -1>(1);

  const steps: TourStep[] = useMemo(() => (tourId ? (tours[tourId]?.steps ?? []) : []), [tourId]);
  const step = steps[index];

  const markSeen = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(seenKey(userId, id), "1");
      } catch {}
    },
    [userId],
  );

  const stop = useCallback(() => {
    if (tourId) markSeen(tourId);
    setTourId(null);
    setIndex(0);
    setRect(null);
  }, [tourId, markSeen]);

  const start = useCallback((id: string) => {
    if (!tours[id]) return;
    dirRef.current = 1;
    setIndex(0);
    setTourId(id);
  }, []);

  const startForPage = useCallback(() => start(tourForPath(pathname)), [start, pathname]);

  const launch = useCallback(
    (id: string, href?: string) => {
      const target = href ?? (id.startsWith("/") ? id : "/");
      if (target === pathname || (target !== "/" && pathname.startsWith(target))) return start(id);
      try {
        sessionStorage.setItem(PENDING, id);
      } catch {}
      router.push(target);
    },
    [pathname, router, start],
  );

  // tour pedido de outra tela (ex.: Central de ajuda): inicia quando a tela abrir
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(PENDING);
    } catch {}
    if (!id) return;
    const dest = id.startsWith("/") ? id : "/";
    if (!(dest === "/" ? pathname === "/" : pathname.startsWith(dest))) return;
    try {
      sessionStorage.removeItem(PENDING);
    } catch {}
    const pending = id;
    const t = setTimeout(() => start(pending), 700);
    return () => clearTimeout(t);
  }, [pathname, start]);

  // primeira visita: tour de boas-vindas no Painel
  useEffect(() => {
    if (pathname !== "/") return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(seenKey(userId, "welcome"));
    } catch {}
    if (seen) return;
    const t = setTimeout(() => start("welcome"), 900);
    return () => clearTimeout(t);
  }, [pathname, userId, start]);

  // encerra o tour se a pessoa navegar para outra tela
  const startedAt = useRef(pathname);
  useEffect(() => {
    if (!tourId) startedAt.current = pathname;
    else if (tourId !== "welcome" && startedAt.current !== pathname) {
      setTourId(null);
      setRect(null);
    }
  }, [pathname, tourId]);

  // pula passos cujo alvo não existe na tela atual
  useEffect(() => {
    if (!tourId || !step) return;
    if (step.target && !findTarget(step.target)) {
      const next = index + dirRef.current;
      if (next < 0 || next >= steps.length) {
        if (next >= steps.length) stop();
        else setIndex(0);
      } else setIndex(next);
    }
  }, [tourId, step, index, steps.length, stop]);

  // mantém o destaque colado no alvo (rolagem, resize, menus que abrem)
  useEffect(() => {
    if (!tourId || !step) return;
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const measure = () => {
      const t = findTarget(step.target);
      if (!t) return setRect(null);
      const r = t.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const id = setInterval(measure, 150);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [tourId, step]);

  useEffect(() => {
    if (!tourId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, index, steps.length]);

  function go(dir: 1 | -1) {
    dirRef.current = dir;
    const next = index + dir;
    if (next >= steps.length) return stop();
    if (next < 0) return;
    setIndex(next);
  }

  const value = useMemo(() => ({ start, launch, startForPage, stop, active: !!tourId }), [start, launch, startForPage, stop, tourId]);

  // posição do cartão
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const isNarrow = vw < 640;
  const PAD = 6;
  const cardW = Math.min(340, vw - 24);
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cardW };
  } else if (isNarrow) {
    const targetInLowerHalf = rect.top + rect.height / 2 > vh / 2;
    cardStyle = targetInLowerHalf
      ? { left: 12, right: 12, top: "calc(4.25rem + env(safe-area-inset-top))" }
      : { left: 12, right: 12, bottom: "calc(5.25rem + env(safe-area-inset-bottom))" };
  } else {
    const below = rect.top + rect.height + 16 + 190 < vh;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
    // alvo muito alto/largo (ex.: quadro inteiro) → cartão dentro da tela, perto do topo
    cardStyle = rect.height > vh * 0.6 ? { left, top: 80, width: cardW } : below ? { left, top: rect.top + rect.height + 14, width: cardW } : { left, bottom: vh - rect.top + 14, width: cardW };
  }

  return (
    <TourContext value={value}>
      {children}
      {mounted &&
        tourId &&
        step &&
        createPortal(
          <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={tours[tourId].label}>
            {/* clique fora não fecha; evita toques acidentais na tela por baixo */}
            <div className="absolute inset-0" />
            {rect ? (
              <div
                className="pointer-events-none absolute rounded-xl ring-2 ring-brand transition-all duration-200"
                style={{
                  top: rect.top - PAD,
                  left: rect.left - PAD,
                  width: rect.width + PAD * 2,
                  height: rect.height + PAD * 2,
                  boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.62)",
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-black/62" />
            )}
            <div className={cn("absolute rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl")} style={cardStyle}>
              <div className="mb-1 flex items-start gap-2">
                <p className="label">
                  {index + 1} de {steps.length}
                </p>
                <button onClick={stop} aria-label="Fechar tour" className="-mt-1 -mr-1 ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>
              <h2 className="h-section text-[17px]">{step.title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{step.body}</p>
              <div className="mt-4 flex items-center gap-2">
                <div className="flex gap-1" aria-hidden>
                  {steps.map((_, i) => (
                    <span key={i} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-brand" : "w-1.5 bg-muted-foreground/30")} />
                  ))}
                </div>
                <div className="ml-auto flex gap-1.5">
                  {index > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => go(-1)}>
                      <ArrowLeft /> Voltar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={stop}>
                      Pular
                    </Button>
                  )}
                  <Button size="sm" onClick={() => go(1)} className="bg-brand text-white hover:bg-brand/90">
                    {index === steps.length - 1 ? "Concluir" : "Próximo"} {index < steps.length - 1 && <ArrowRight />}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </TourContext>
  );
}
