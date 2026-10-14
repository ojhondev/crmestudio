"use client";

import { useCallback, useRef, useState } from "react";

export type AnaRequest =
  | { mode: "chat"; messages: { role: "user" | "assistant"; content: string }[]; focus?: { kind: string; id: string } | null }
  | { mode: "summary" | "reply"; conversationId: string; hint?: string }
  | { mode: "email"; conversationId?: string; dealId?: string; hint?: string };

/** Faz POST em /api/ana e entrega o texto conforme chega (streaming). */
export function useAnaStream() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (req: AnaRequest, onChunk?: (full: string) => void) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setText("");
    let full = "";
    try {
      const res = await fetch("/api/ana", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error("sem resposta");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setText(full);
        onChunk?.(full);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        full = full || "Não consegui responder agora. Tente de novo em instantes.";
        setText(full);
        onChunk?.(full);
      }
    } finally {
      setLoading(false);
    }
    return full;
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { text, loading, run, stop, setText };
}
