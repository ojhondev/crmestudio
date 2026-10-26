"use client";

import { useMemo } from "react";
import { envioFlow } from "@/lib/editais-app/actions/flows";
import { CONFERENCIA_PADRAO, envioRules } from "@/lib/editais-app/flow-rules";
import { BigInput, BigTextarea, ChoiceList } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

type V = { checked: string[]; protocoloUrl: string; protocoloNome: string; quando: string; obs: string };

export function EnvioFlow({ editalId, organ, items, nowLocal }: { editalId: string; organ: string; items: { id: string; title: string; done: boolean }[]; nowLocal: string }) {
  const all = useMemo(() => [...items.map((i) => ({ value: i.id, label: i.title })), ...CONFERENCIA_PADRAO.map((t, n) => ({ value: `std:${n}`, label: t }))], [items]);
  const initial: V = { checked: items.filter((i) => i.done).map((i) => i.id), protocoloUrl: "", protocoloNome: "", quando: nowLocal, obs: "" };

  const steps: WizStep<V>[] = useMemo(
    () => [
      {
        id: "conferencia",
        title: "Conferência final: está tudo certo?",
        help: "Marque cada item depois de conferir. Só segue quando todos estiverem marcados.",
        validate: (v) => envioRules.conferencia(v.checked.filter((c) => all.some((a) => a.value === c)).length, all.length),
        render: ({ v, set }) => <ChoiceList label="Conferência final" multi value={v.checked} onChange={(x) => set({ checked: x as string[] })} options={all} />,
      },
      {
        id: "protocolo",
        title: "Tem o comprovante ou o protocolo do envio?",
        help: "Opcional. Cole o link (Drive, portal). O app guarda só o link — e só a equipe enxerga.",
        optional: true,
        validate: (v) => envioRules.link(v.protocoloUrl),
        render: ({ v, set }) => (
          <div className="grid gap-6">
            <BigInput label="Link do comprovante" type="url" inputMode="url" value={v.protocoloUrl} onChange={(x) => set({ protocoloUrl: x })} placeholder="https://" />
            <BigInput label="Nome (opcional)" value={v.protocoloNome} onChange={(x) => set({ protocoloNome: x })} placeholder="Protocolo do portal" autoFocus={false} maxLength={80} />
          </div>
        ),
      },
      {
        id: "quando",
        title: "Quando foi enviado?",
        validate: (v) => envioRules.quando(v.quando),
        render: ({ v, set }) => <BigInput label="Data e hora do envio" type="datetime-local" value={v.quando} onChange={(x) => set({ quando: x })} />,
      },
      {
        id: "obs",
        title: "Alguma observação?",
        help: "Opcional. Fica no histórico da proposta.",
        optional: true,
        render: ({ v, set }) => <BigTextarea label="Observações" value={v.obs} onChange={(x) => set({ obs: x })} rows={3} maxLength={500} />,
      },
    ],
    [all],
  );

  return (
    <Wizard<V>
      id={`envio:${editalId}`}
      name={`Revisão e envio · ${organ}`}
      closeHref={`/editais/propostas/${editalId}`}
      initial={initial}
      steps={steps}
      reviewTitle="Registrar o envio"
      submitLabel="Registrar o envio"
      review={(v, go) => (
        <div className="ed-card px-5">
          <ReviewRow label="Conferência" value={`${all.length} itens conferidos`} onEdit={() => go("conferencia")} />
          <ReviewRow label="Comprovante" value={v.protocoloUrl ? <span className="break-all">{v.protocoloNome || v.protocoloUrl}</span> : "Sem link"} onEdit={() => go("protocolo")} />
          <ReviewRow label="Enviado em" value={v.quando ? new Date(v.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""} onEdit={() => go("quando")} />
          <ReviewRow label="Observações" value={v.obs} onEdit={() => go("obs")} />
        </div>
      )}
      onSubmit={(v) => envioFlow(editalId, { itemIds: v.checked.filter((c) => !c.startsWith("std:")), protocoloUrl: v.protocoloUrl, protocoloNome: v.protocoloNome, quando: v.quando, obs: v.obs })}
    />
  );
}
