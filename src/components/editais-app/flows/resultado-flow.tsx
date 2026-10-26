"use client";

import { useMemo } from "react";
import { resultadoFlow } from "@/lib/editais-app/actions/flows";
import { RESULT_OPTIONS, resultadoRules } from "@/lib/editais-app/flow-rules";
import { BigInput, BigTextarea, ChoiceList } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

type V = { status: string; value: string; reason: string; notes: string };

export function ResultadoFlow({ editalId, organ, lossReasons, initial }: { editalId: string; organ: string; lossReasons: string[]; initial: V }) {
  const steps: WizStep<V>[] = useMemo(
    () => [
      {
        id: "status",
        title: "Qual foi o resultado?",
        validate: (v) => resultadoRules.status(v.status),
        render: ({ v, set, next }) => <ChoiceList label="Resultado" value={v.status} onChange={(x) => set({ status: x as string })} onPick={next} options={[...RESULT_OPTIONS]} />,
      },
      {
        id: "valor",
        title: "Qual o valor?",
        help: "Opcional. Em caso de vitória, o valor do contrato; se perdeu, o do vencedor.",
        optional: true,
        skip: (v) => v.status === "desistiu" || v.status === "desclassificada",
        validate: (v) => resultadoRules.valor(v.value),
        render: ({ v, set }) => <BigInput label="Valor (R$)" value={v.value} onChange={(x) => set({ value: x })} inputMode="decimal" placeholder="0,00" />,
      },
      {
        id: "motivo",
        title: "Qual foi o motivo?",
        help: "Ele vira aprendizado: o app mostra os motivos que mais se repetem.",
        skip: (v) => v.status === "ganhou",
        validate: (v) => resultadoRules.motivo(v.status, v.reason),
        render: ({ v, set, next }) => <ChoiceList label="Motivo" value={v.reason} onChange={(x) => set({ reason: x as string })} onPick={next} options={lossReasons.map((r) => ({ value: r, label: r }))} />,
      },
      {
        id: "aprendizado",
        title: "O que aprendemos com esta proposta?",
        help: "Opcional. Uma frase já ajuda a próxima equipe.",
        optional: true,
        render: ({ v, set }) => <BigTextarea label="Aprendizado" value={v.notes} onChange={(x) => set({ notes: x })} rows={4} maxLength={600} />,
      },
    ],
    [lossReasons],
  );
  return (
    <Wizard<V>
      id={`resultado:${editalId}`}
      name={`Resultado · ${organ}`}
      closeHref={`/editais/propostas/${editalId}`}
      initial={initial}
      steps={steps}
      reviewTitle="Registrar o resultado"
      submitLabel="Registrar"
      review={(v, go) => (
        <div className="ed-card px-5">
          <ReviewRow label="Resultado" value={RESULT_OPTIONS.find((o) => o.value === v.status)?.label} onEdit={() => go("status")} />
          {v.status !== "desistiu" && v.status !== "desclassificada" && <ReviewRow label="Valor" value={v.value ? `R$ ${v.value}` : ""} onEdit={() => go("valor")} />}
          {v.status !== "ganhou" && <ReviewRow label="Motivo" value={v.reason} onEdit={() => go("motivo")} />}
          <ReviewRow label="Aprendizado" value={v.notes} onEdit={() => go("aprendizado")} />
        </div>
      )}
      onSubmit={(v) => resultadoFlow(editalId, v)}
    />
  );
}
