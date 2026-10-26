/** Relógio injetável: páginas do servidor usam isto em vez de Date.now() solto (regra de pureza do React). */
export const nowMs = () => Date.now();
