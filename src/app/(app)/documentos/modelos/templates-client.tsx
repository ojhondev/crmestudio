"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form";
import { escapeHtml } from "@/lib/docs/variables";
import { deleteTemplate, saveTemplate } from "../actions";

type Row = { id: string; kind: string; name: string; description: string | null };
type Info = { name: string; description: string };
const KIND: Record<string, string> = { contrato: "Contrato", apresentacao: "Apresentação", clausula: "Cláusula" };

export function Templates({ custom, builtinContracts, builtinClauses }: { custom: Row[]; builtinContracts: Info[]; builtinClauses: Info[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [text, setText] = useState("");

  const addClause = () =>
    start(async () => {
      // parágrafos separados por linha em branco; {{variáveis}} continuam valendo
      const html = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (i === 0 && p.length < 80 && !p.includes("{{") ? `<h2>${escapeHtml(p)}</h2>` : `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`))
        .join("");
      const r = await saveTemplate({ kind: "clausula", name, description: desc, content: { html } });
      if (r && "error" in r && r.error) return void toast.error(r.error);
      toast.success("Cláusula salva");
      setName("");
      setDesc("");
      setText("");
      router.refresh();
    });

  const del = (id: string) =>
    window.confirm("Excluir este modelo?") &&
    start(async () => {
      await deleteTemplate(id);
      router.refresh();
    });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="grid content-start gap-3">
        <h2 className="label">Seus modelos e cláusulas</h2>
        {custom.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nada por aqui ainda. Abra um contrato ou apresentação e use “Salvar como modelo”, ou crie uma cláusula ao lado.
          </p>
        ) : (
          <ul className="grid gap-2">
            {custom.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{t.name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {KIND[t.kind] ?? t.kind}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${t.name}`} onClick={() => del(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="label mt-4">Que acompanham o sistema</h2>
        <ul className="grid gap-1.5 text-[13px]">
          {builtinContracts.map((t) => (
            <li key={t.name} className="rounded-lg bg-muted/50 px-3 py-2">
              <span className="font-medium">{t.name}</span> <span className="text-muted-foreground">· {t.description}</span>
            </li>
          ))}
          {builtinClauses.map((t) => (
            <li key={t.name} className="rounded-lg bg-muted/50 px-3 py-2">
              <span className="font-medium">{t.name}</span> <span className="text-muted-foreground">· cláusula · {t.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid content-start gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-[15px] font-medium">Nova cláusula</h2>
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reajuste de preços" />
        </Field>
        <Field label="Descrição (opcional)">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <Field label="Texto" hint="Separe os parágrafos com uma linha em branco. Uma primeira linha curta vira o título. Pode usar variáveis como {{negocio.valor}}.">
          <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button type="button" className="justify-self-start" disabled={pending || !name.trim() || !text.trim()} onClick={addClause}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Salvar cláusula
        </Button>
      </section>
    </div>
  );
}
