"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cofreFlow, obraFlow, type CofreInput, type ObraInput } from "@/lib/editais-app/actions/flows";
import { cofreRules, obraRules, validUrlOrEmpty } from "@/lib/editais-app/flow-rules";
import { COFRE_LABEL, COFRE_TYPES, PORTFOLIO_KINDS, SUGGESTED_TAGS, TOMBAMENTO } from "@/lib/propostas/types";
import { Button } from "@/components/ui/button";
import { BigInput, BigTextarea, ChoiceList } from "./../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "./../wizard/wizard";

/* ----------------------------- documento do cofre ----------------------------- */

type CV = Omit<CofreInput, "id">;

export function CofreFlow({ initial, id }: { initial: CV; id?: string }) {
  const steps: WizStep<CV>[] = useMemo(
    () => [
      {
        id: "tipo",
        title: "Que documento é este?",
        validate: (v) => cofreRules.tipo(v.type),
        render: ({ v, set, next }) => (
          <ChoiceList
            label="Tipo de documento"
            value={v.type}
            onChange={(x) => {
              const t = x as string;
              set({ type: t, title: !v.title.trim() || v.title === COFRE_LABEL[v.type] ? (COFRE_LABEL[t] ?? "") : v.title });
            }}
            onPick={next}
            options={COFRE_TYPES.map((t) => ({ value: t.key, label: t.label, badge: t.group }))}
          />
        ),
      },
      {
        id: "titulo",
        title: "Como quer chamar este documento?",
        validate: (v) => cofreRules.titulo(v.title),
        render: ({ v, set }) => <BigInput label="Nome" value={v.title} onChange={(x) => set({ title: x })} maxLength={160} />,
      },
      {
        id: "validade",
        title: "Até quando vale?",
        help: "Com a data, o app avisa 30, 15 e 7 dias antes de vencer. Sem validade? Pule.",
        optional: true,
        validate: (v) => cofreRules.datas(v.issuedAt, v.validUntil),
        render: ({ v, set }) => <BigInput label="Válido até" type="date" value={v.validUntil} onChange={(x) => set({ validUntil: x })} />,
      },
      {
        id: "emissao",
        title: "Quando foi emitido?",
        optional: true,
        validate: (v) => cofreRules.datas(v.issuedAt, v.validUntil),
        render: ({ v, set }) => <BigInput label="Emitido em" type="date" value={v.issuedAt} onChange={(x) => set({ issuedAt: x })} />,
      },
      {
        id: "numero",
        title: "Qual o número ou código?",
        optional: true,
        render: ({ v, set }) => <BigInput label="Número / código de controle" value={v.number} onChange={(x) => set({ number: x })} maxLength={80} />,
      },
      {
        id: "emissor",
        title: "Quem emitiu?",
        optional: true,
        render: ({ v, set }) => <BigInput label="Órgão emissor" value={v.issuer} onChange={(x) => set({ issuer: x })} placeholder="Ex.: Receita Federal" maxLength={120} />,
      },
      {
        id: "link",
        title: "Onde está o arquivo?",
        help: "Cole o link do Drive ou do site que emitiu. O app não guarda arquivos, só o link.",
        optional: true,
        validate: (v) => validUrlOrEmpty(v.url),
        render: ({ v, set }) => <BigInput label="Link do arquivo" type="url" inputMode="url" value={v.url} onChange={(x) => set({ url: x })} placeholder="https://" />,
      },
    ],
    [],
  );
  return (
    <Wizard<CV>
      id={`cofre:${id ?? "novo"}`}
      name={id ? "Atualizar documento do cofre" : "Novo documento no cofre"}
      closeHref="/editais/acervo"
      initial={initial}
      steps={steps}
      reviewTitle="Guardar no cofre"
      submitLabel="Guardar"
      review={(v, go) => (
        <div className="ed-card px-5">
          <ReviewRow label="Tipo" value={COFRE_LABEL[v.type]} onEdit={() => go("tipo")} />
          <ReviewRow label="Nome" value={v.title} onEdit={() => go("titulo")} />
          <ReviewRow label="Validade" value={v.validUntil ? v.validUntil.split("-").reverse().join("/") : "Sem validade"} onEdit={() => go("validade")} />
          <ReviewRow label="Emissão" value={v.issuedAt ? v.issuedAt.split("-").reverse().join("/") : ""} onEdit={() => go("emissao")} />
          <ReviewRow label="Número" value={v.number} onEdit={() => go("numero")} />
          <ReviewRow label="Emissor" value={v.issuer} onEdit={() => go("emissor")} />
          <ReviewRow label="Link" value={v.url ? <span className="break-all">{v.url}</span> : ""} onEdit={() => go("link")} />
        </div>
      )}
      onSubmit={(v) => cofreFlow({ ...v, id })}
    />
  );
}

/* ----------------------------- obra do portfólio ----------------------------- */

type OV = Omit<ObraInput, "id">;

export function ObraFlow({ initial, id }: { initial: OV; id?: string }) {
  const steps: WizStep<OV>[] = useMemo(
    () => [
      { id: "titulo", title: "Qual o nome da obra ou do projeto?", validate: (v) => obraRules.titulo(v.title), render: ({ v, set }) => <BigInput label="Título" value={v.title} onChange={(x) => set({ title: x })} placeholder="Ex.: Restauração do forro da Matriz de Sorocaba" maxLength={200} /> },
      { id: "cliente", title: "Para quem foi feito?", optional: true, render: ({ v, set }) => <BigInput label="Contratante" value={v.client} onChange={(x) => set({ client: x })} maxLength={160} /> },
      { id: "ano", title: "Em que ano foi concluído?", optional: true, validate: (v) => obraRules.ano(v.year), render: ({ v, set }) => <BigInput label="Ano" value={v.year} onChange={(x) => set({ year: x })} inputMode="numeric" maxLength={4} placeholder="2024" /> },
      { id: "valor", title: "Qual o valor do contrato?", optional: true, render: ({ v, set }) => <BigInput label="Valor (R$)" value={v.value} onChange={(x) => set({ value: x })} inputMode="decimal" placeholder="0,00" /> },
      {
        id: "tipo",
        title: "Que tipo de trabalho foi?",
        render: ({ v, set, next }) => <ChoiceList label="Tipo" value={v.kind} onChange={(x) => set({ kind: x as string })} onPick={next} options={PORTFOLIO_KINDS.map((k) => ({ value: k.key, label: k.label }))} />,
      },
      {
        id: "tombamento",
        title: "O bem é tombado?",
        render: ({ v, set, next }) => <ChoiceList label="Tombamento" value={v.tombamento} onChange={(x) => set({ tombamento: x as string })} onPick={next} options={TOMBAMENTO.map((k) => ({ value: k.key, label: k.label }))} />,
      },
      {
        id: "tags",
        title: "Que técnicas e bens apareceram?",
        help: "As etiquetas ajudam a sugerir esta obra em editais parecidos.",
        optional: true,
        render: ({ v, set }) => (
          <div className="grid gap-4">
            <ChoiceList label="Etiquetas" multi value={v.tags} onChange={(x) => set({ tags: x as string[] })} options={[...new Set([...SUGGESTED_TAGS, ...v.tags])].map((t) => ({ value: t, label: t }))} />
          </div>
        ),
      },
      { id: "resp", title: "Quem foi o responsável técnico?", optional: true, render: ({ v, set }) => <BigInput label="Responsável técnico" value={v.responsible} onChange={(x) => set({ responsible: x })} maxLength={160} /> },
      {
        id: "descricao",
        title: "Descreva a obra em poucas linhas.",
        help: "Este texto vai pronto para a proposta técnica.",
        optional: true,
        render: ({ v, set }) => <BigTextarea label="Descrição" value={v.description} onChange={(x) => set({ description: x })} rows={5} maxLength={3000} />,
      },
      {
        id: "links",
        title: "Tem fotos ou o atestado em algum link?",
        help: "Opcional. Cole links do Drive (o app não guarda arquivos).",
        optional: true,
        validate: (v) => v.links.map((l) => validUrlOrEmpty(l.url)).find(Boolean) ?? null,
        render: ({ v, set }) => (
          <div className="grid gap-4">
            {v.links.map((l, i) => (
              <div key={i} className="ed-card grid gap-2 p-3">
                <input aria-label="Nome do link" value={l.name} onChange={(e) => set({ links: v.links.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Nome (ex.: Atestado CAT)" className="h-12 rounded-xl border bg-card px-3 text-base" maxLength={80} />
                <div className="flex gap-2">
                  <input aria-label="Endereço do link" data-autofocus={i === 0 ? "" : undefined} value={l.url} onChange={(e) => set({ links: v.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://" inputMode="url" className="h-12 min-w-0 flex-1 rounded-xl border bg-card px-3 text-base" />
                  <button type="button" aria-label="Remover link" className="grid size-12 place-items-center rounded-xl border text-muted-foreground hover:bg-muted" onClick={() => set({ links: v.links.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
            {v.links.length < 6 && (
              <Button type="button" variant="outline" className="min-h-12 w-fit rounded-full" onClick={() => set({ links: [...v.links, { name: "", url: "" }] })}>
                <Plus /> Adicionar link
              </Button>
            )}
          </div>
        ),
      },
    ],
    [],
  );
  return (
    <Wizard<OV>
      id={`obra:${id ?? "nova"}`}
      name={id ? "Atualizar obra do acervo" : "Nova obra no acervo"}
      closeHref="/editais/acervo?aba=obras"
      initial={initial}
      steps={steps}
      reviewTitle="Guardar no acervo"
      submitLabel="Guardar"
      review={(v, go) => (
        <div className="ed-card px-5">
          <ReviewRow label="Obra" value={v.title} onEdit={() => go("titulo")} />
          <ReviewRow label="Contratante" value={v.client} onEdit={() => go("cliente")} />
          <ReviewRow label="Ano e valor" value={[v.year, v.value ? `R$ ${v.value}` : ""].filter(Boolean).join(" · ")} onEdit={() => go("ano")} />
          <ReviewRow label="Tipo" value={PORTFOLIO_KINDS.find((k) => k.key === v.kind)?.label} onEdit={() => go("tipo")} />
          <ReviewRow label="Tombamento" value={TOMBAMENTO.find((k) => k.key === v.tombamento)?.label} onEdit={() => go("tombamento")} />
          <ReviewRow label="Etiquetas" value={v.tags.join(", ")} onEdit={() => go("tags")} />
          <ReviewRow label="Links" value={`${v.links.filter((l) => l.url.trim()).length}`} onEdit={() => go("links")} />
        </div>
      )}
      onSubmit={(v) => obraFlow({ ...v, id })}
    />
  );
}
