"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnaSheet } from "./ana-sheet";

/** Algo que a tela atual está mostrando e que a Ana deve considerar. */
export type AnaFocus = { kind: "deal" | "contact" | "conversation"; id: string; label: string };

type Ctx = {
  open: (prompt?: string) => void;
  close: () => void;
  focus: AnaFocus | null;
  setFocus: (f: AnaFocus | null) => void;
};

const AnaContext = createContext<Ctx | null>(null);

export function AnaProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [isOpen, setOpen] = useState(false);
  const [focus, setFocus] = useState<AnaFocus | null>(null);
  const sendRef = useRef<((q: string) => void) | null>(null);

  const open = useCallback((prompt?: string) => {
    setOpen(true);
    if (prompt) sendRef.current?.(prompt);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, close, focus, setFocus }), [open, close, focus]);

  return (
    <AnaContext value={value}>
      {children}
      <AnaSheet open={isOpen} onOpenChange={setOpen} sendRef={sendRef} focus={focus} enabled={enabled} />
    </AnaContext>
  );
}

export function useAna() {
  const ctx = use(AnaContext);
  if (!ctx) throw new Error("useAna fora do AnaProvider");
  return ctx;
}

/** Coloque numa página para a Ana "ver" o registro aberto. */
export function AnaFocusSetter(props: AnaFocus) {
  const { setFocus } = useAna();
  const { kind, id, label } = props;
  useEffect(() => {
    setFocus({ kind, id, label });
    return () => setFocus(null);
  }, [kind, id, label, setFocus]);
  return null;
}
