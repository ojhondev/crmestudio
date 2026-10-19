"use client";

import { useEffect } from "react";

/**
 * Celular: ao focar um campo, rola para deixá-lo visível acima do teclado virtual
 * (o iOS não redimensiona a tela quando o teclado abre; no Android o viewport já encolhe).
 */
export function KeyboardAssist() {
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = (e: FocusEvent) => {
      if (!mq.matches) return;
      const t = e.target as HTMLElement | null;
      if (!t || !t.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea, select, [contenteditable=true]")) return;
      clearTimeout(timer);
      // espera o teclado abrir antes de medir
      timer = setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
    };
    document.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);
  return null;
}
