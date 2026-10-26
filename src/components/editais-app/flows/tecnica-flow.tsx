"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { moneyShort } from "@/lib/format";
import { tecnicaFlow, type TecnicaInput } from "@/lib/editais-app/actions/flows";
import { METODOLOGIA_ROTEIRO, tecnicaRules } from "@/lib/editais-app/flow-rules";
import type { SuggestionDTO } from "@/lib/propostas/suggest";
import { Button } from "@/components/ui/button";
import { BigTextarea, ChoiceList, YesNo } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

type V = Omit<TecnicaInput, "conclude"> & { conclude: boolean | null };

export type TecnicaProps = {
  editalId: string;
  organ: string;
  object: string;
  suggestions: SuggestionDTO[];
  technical: { id: string; name: string; profession: string; registry: string }[];
  existing: { compreensao: string; metodologia: string; cronograma: string };
};

export function TecnicaFlow(p: TecnicaProps) {
  const initial: V = {
    atestadoIds: p.suggestions.filter((s) => s.score >= 40).slice(0, 3).map((s) => s.id),
    techId: p.technical[0]?.id ?? "",
    compreensao: p.existing.compreensao || `Compreendemos que o objeto consiste em: ${p.object.slice(0, 400)}`,
    metodologia: p.existing.metodologia,
    cronograma: p.existing.cronograma,
    conclude: null,
  };

  const steps: WizStep<V>[] = useMemo(
    () => [
      {
        id: "atestados",
        title: "Quais obras mostram que sabemos fazer isto?",
        help: "O app sugeriu as do acervo que mais combinam com o objeto. Escolha as que entram na proposta.",
        optional: true,
        skip: () => p.suggestions.length === 0,
        render: ({ v, set }) => (
          <ChoiceList
            label="Atestados"
            multi
            value={v.atestadoIds}
            onChange={(x) => set({ atestadoIds: x as string[] })}
            options={p.suggestions.map((s) => ({ value: s.id, label: s.title, hint: [s.client, s.year, s.valueCents ? moneyShort(s.valueCents) : null, s.why.slice(0, 2).join(", ")].filter(Boolean).join(" · ") }))}
          />
        ),
      },
      {
        id: "tecnico",
        title: "Quem é o responsável técnico?",
        help: "Aparece no texto da proposta com profissão e registro.",
        skip: () => p.technical.length === 0,
        validate: (v) => (v.techId ? null : "Escolha o responsável técnico."),
        render: ({ v, set, next }) => <ChoiceList label="Responsável técnico" value={v.techId} onChange={(x) => set({ techId: x as string })} onPick={next} options={p.technical.map((t) => ({ value: t.id, label: t.name, hint: [t.profession, t.registry].filter(Boolean).join(" · ") }))} />,
      },
      {
        id: "compreensao",
        title: "Como entendemos o objeto?",
        help: "Duas ou três frases, com as suas palavras.",
        validate: (v) => tecnicaRules.compreensao(v.compreensao),
        render: ({ v, set }) => <BigTextarea label="Compreensão do objeto" value={v.compreensao} onChange={(x) => set({ compreensao: x })} rows={5} />,
      },
      {
        id: "metodologia",
        title: "Como vamos executar?",
        help: "Etapas de trabalho, técnicas e cuidados. Dá para começar pelo roteiro e ajustar.",
        validate: (v) => tecnicaRules.metodologia(v.metodologia),
        render: ({ v, set }) => (
          <div className="grid gap-3">
            <BigTextarea label="Metodologia de trabalho" value={v.metodologia} onChange={(x) => set({ metodologia: x })} rows={9} />
            {!v.metodologia.trim() && (
              <Button type="button" variant="outline" className="min-h-11 w-fit rounded-full" onClick={() => set({ metodologia: METODOLOGIA_ROTEIRO.join("\n") })}>
                <Sparkles /> Começar pelo roteiro sugerido
              </Button>
            )}
          </div>
        ),
      },
      {
        id: "cronograma",
        title: "Qual o cronograma, em linhas gerais?",
        help: "Opcional. Meses ou semanas por etapa; o cronograma detalhado vai na planilha.",
        optional: true,
        render: ({ v, set }) => <BigTextarea label="Cronograma" value={v.cronograma} onChange={(x) => set({ cronograma: x })} rows={4} placeholder="Ex.: Mês 1 — levantamentos; meses 2 a 4 — consolidação e restauro…" />,
      },
      {
        id: "concluir",
        title: "Marcar a proposta técnica como concluída?",
        validate: (v) => (v.conclude === null ? "Escolha Sim ou Não." : null),
        render: ({ v, set, next }) => <YesNo label="Concluir a etapa" value={v.conclude} onChange={(x) => set({ conclude: x })} onPick={next} yes="Sim, está pronta" no="Ainda vou revisar" />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Wizard<V>
      id={`tecnica:${p.editalId}`}
      name={`Proposta técnica · ${p.organ}`}
      closeHref={`/editais/propostas/${p.editalId}`}
      initial={initial}
      steps={steps}
      reviewTitle="Revise a proposta técnica"
      submitLabel="Gerar a proposta técnica"
      review={(v, go) => (
        <div className="ed-card px-5">
          <ReviewRow label="Atestados" value={v.atestadoIds.length ? p.suggestions.filter((s) => v.atestadoIds.includes(s.id)).map((s) => s.title).join("; ") : "Nenhum"} onEdit={() => go("atestados")} />
          <ReviewRow label="Responsável técnico" value={p.technical.find((t) => t.id === v.techId)?.name ?? "Configure em Ajustes"} onEdit={() => go("tecnico")} />
          <ReviewRow label="Compreensão do objeto" value={<span className="line-clamp-3 text-[15px] font-normal">{v.compreensao}</span>} onEdit={() => go("compreensao")} />
          <ReviewRow label="Metodologia" value={<span className="line-clamp-4 text-[15px] font-normal whitespace-pre-line">{v.metodologia}</span>} onEdit={() => go("metodologia")} />
          <ReviewRow label="Cronograma" value={<span className="line-clamp-3 text-[15px] font-normal">{v.cronograma}</span>} onEdit={() => go("cronograma")} />
        </div>
      )}
      onSubmit={(v) => tecnicaFlow(p.editalId, { ...v, conclude: !!v.conclude })}
    />
  );
}
