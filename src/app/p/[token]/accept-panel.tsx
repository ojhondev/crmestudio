"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form";
import { acceptDocument, requestChanges } from "./actions";

export function AcceptPanel({ token, kind }: { token: string; kind: "contrato" | "apresentacao" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"accept" | "changes">("accept");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const isContract = kind === "contrato";

  const accept = () =>
    start(async () => {
      setError(null);
      const r = await acceptDocument(token, { name, document: doc, agree });
      if ("error" in r && r.error) return setError(r.error);
      router.refresh();
    });
  const changes = () =>
    start(async () => {
      setError(null);
      const r = await requestChanges(token, msg);
      if ("error" in r && r.error) return setError(r.error);
      setSent(true);
    });

  return (
    <section aria-labelledby="accept-title" className="mx-auto mt-8 w-full max-w-[794px] rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex gap-2" role="tablist" aria-label="Resposta ao documento">
        {(
          [
            ["accept", isContract ? "Aceitar contrato" : "Aceitar proposta"],
            ["changes", "Pedir ajustes"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => {
              setMode(k);
              setError(null);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${mode === k ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {mode === "accept" ? (
        <div className="mt-5 grid gap-4">
          <h2 id="accept-title" className="text-[17px] font-semibold">
            {isContract ? "Aceite eletrônico" : "Confirmar interesse na proposta"}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {isContract
              ? "Ao aceitar, você concorda com todos os termos acima. Registramos a data, o horário, o endereço IP e o navegador como comprovação."
              : "Ao aceitar, o estúdio é avisado e entra em contato para os próximos passos."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" htmlFor="acc-name">
              <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label={isContract ? "CPF ou CNPJ" : "CPF ou CNPJ (opcional)"} htmlFor="acc-doc">
              <Input id="acc-doc" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <label className="flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[#b75928]" />
            <span>{isContract ? "Li e concordo com todos os termos deste contrato." : "Li a proposta e quero seguir com o estúdio."}</span>
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="button" onClick={accept} disabled={pending} className="justify-self-start">
            {pending ? <Loader2 className="animate-spin" /> : <Check />} {isContract ? "Aceitar e assinar" : "Aceitar proposta"}
          </Button>
        </div>
      ) : sent ? (
        <p className="mt-5 flex items-center gap-2 text-[14px]">
          <Check className="size-4 text-success" /> Recebemos seu pedido. O estúdio vai entrar em contato com a nova versão.
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          <h2 id="accept-title" className="text-[17px] font-semibold">
            O que você gostaria de ajustar?
          </h2>
          <Field label="Sua mensagem" htmlFor="chg">
            <Textarea id="chg" rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: Gostaria de dividir em mais parcelas e incluir a nave lateral." />
          </Field>
          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="button" variant="outline" onClick={changes} disabled={pending} className="justify-self-start">
            {pending ? <Loader2 className="animate-spin" /> : <MessageSquare />} Enviar pedido
          </Button>
        </div>
      )}
    </section>
  );
}
