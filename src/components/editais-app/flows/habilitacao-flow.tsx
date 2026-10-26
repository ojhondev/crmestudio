"use client";

import { useMemo } from "react";
import { MATRIX_LABEL, type CofreLite, type MatrixRow } from "@/lib/propostas/cofre";
import { habilitacaoFlow } from "@/lib/editais-app/actions/flows";
import { habilitacaoChoices, habilitacaoDefault, habilitacaoSummary } from "@/lib/editais-app/flow-rules";
import { BigInput, ChoiceList, YesNo } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

type V = { decisions: Record<string, string>; extra: string; conclude: boolean | null };

export function HabilitacaoFlow({ editalId, organ, sessionDay, today, rows, docs }: { editalId: string; organ: string; sessionDay: string | null; today: string; rows: MatrixRow[]; docs: CofreLite[] }) {
  const initial: V = { decisions: Object.fromEntries(rows.map((r) => [r.req.id, habilitacaoDefault(r)])), extra: "", conclude: null };

  const steps: WizStep<V>[] = useMemo(() => {
    const perReq: WizStep<V>[] = rows.map((r) => {
      const choices = habilitacaoChoices(r, docs, sessionDay, today);
      return {
        id: r.req.id,
        title: `Temos: ${r.req.title}?`,
        help: r.situation === "ok" || r.situation === "ok_manual" || r.situation === "na" ? undefined : `${MATRIX_LABEL[r.situation]}. ${r.note}`.trim(),
        validate: (v: V) => (v.decisions[r.req.id] ? null : "Escolha uma opção para continuar."),
        render: ({ v, set, next }) => <ChoiceList label={r.req.title} value={v.decisions[r.req.id] ?? ""} onChange={(x) => set({ decisions: { ...v.decisions, [r.req.id]: x as string } })} onPick={next} options={choices} />,
      };
    });
    return [
      ...perReq,
      {
        id: "extra",
        title: "O edital pede mais algum documento?",
        help: "Opcional. Escreva a exigência que não está na lista e ela entra na matriz.",
        optional: true,
        render: ({ v, set }) => <BigInput label="Documento ou exigência" value={v.extra} onChange={(x) => set({ extra: x })} placeholder="Ex.: Declaração de visita técnica" autoFocus />,
      },
      {
        id: "concluir",
        title: "Marcar a habilitação como concluída?",
        help: "Tudo resolvido. Se marcar, a etapa fica concluída; você pode reabrir depois.",
        skip: (v) => habilitacaoSummary(v.decisions).falta > 0,
        validate: (v) => (v.conclude === null ? "Escolha Sim ou Não." : null),
        render: ({ v, set, next }) => <YesNo label="Concluir a habilitação" value={v.conclude} onChange={(x) => set({ conclude: x })} onPick={next} yes="Sim, está tudo pronto" no="Ainda não" />,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Wizard<V>
      id={`habilitacao:${editalId}`}
      name={`Habilitação · ${organ}`}
      closeHref={`/editais/propostas/${editalId}`}
      initial={initial}
      steps={steps}
      reviewTitle="Confira e salve"
      submitLabel="Salvar a habilitação"
      review={(v, go) => {
        const s = habilitacaoSummary(v.decisions);
        return (
          <div className="grid gap-4">
            <p className="text-[17px]">
              {s.ok} em ordem{s.na ? ` · ${s.na} não se aplica` : ""}
              {s.falta ? ` · ${s.falta} a providenciar (viram tarefas)` : ""}.
            </p>
            <div className="ed-card px-5">
              {rows.map((r) => {
                const choice = v.decisions[r.req.id];
                const label = choice.startsWith("doc:") ? docs.find((d) => d.id === choice.slice(4))?.title : choice === "ok_manual" ? "Atendida por outro meio" : choice === "na" ? "Não se aplica" : choice === "falta" ? "Falta — criar tarefa" : "—";
                return <ReviewRow key={r.req.id} label={r.req.title} value={label} onEdit={() => go(r.req.id)} />;
              })}
              {v.extra.trim() && <ReviewRow label="Nova exigência" value={v.extra} onEdit={() => go("extra")} />}
            </div>
          </div>
        );
      }}
      onSubmit={(v) => habilitacaoFlow(editalId, { decisions: v.decisions, extra: v.extra, conclude: !!v.conclude })}
    />
  );
}
