"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemes } from "next-themes";

/** Telas de entrada sempre em tema claro, independente da escolha da pessoa. */
const ALWAYS_LIGHT = ["/login", "/primeiro-acesso", "/p/"];

/**
 * O padrão é o tema CLARO. O escuro é opcional (botão de tema no topo) e a escolha
 * fica gravada no navegador. Não seguimos o tema do aparelho automaticamente.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forced = ALWAYS_LIGHT.some((p) => pathname.startsWith(p)) ? "light" : undefined;
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem={false} storageKey="restaura-theme" forcedTheme={forced} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
