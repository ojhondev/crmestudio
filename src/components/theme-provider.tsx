"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/** Claro / escuro / automático (segue o aparelho). Guarda a escolha no navegador. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
