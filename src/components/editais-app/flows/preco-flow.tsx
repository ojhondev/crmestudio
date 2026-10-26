"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/format";
import { precoFlow, type PrecoInput } from "@/lib/editais-app/actions/flows";
import { emptyPriceItem, num, precoRules, priceFromItems, type PriceItem } from "@/lib/editais-app/flow-rules";
import { Button } from "@/components/ui/button";
import { BigInput, YesNo } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

type V = Omit<PrecoInput, "conclude"> & { conclude: boolean | null };

export type PrecoProps = {
  editalId: string;
  organ: string;
  bdiPercent: number;
  encargosPercent: number;
  validityDays: number;
  estimatedCents: number | null;
  sheetExists: boolean;
  existing: { valor: string; prazo: string; pagamento: string };
};

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ItemsEditor({ items, onChange }: { items: PriceItem[]; onChange: (i: PriceItem[]) => void }) {
  const patch = (idx: number, p: Partial<PriceItem>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const f = "h-12 w-full rounded-xl border bg-card px-3 text-base outline-none focus:border-brand";
  return (
    <div className="grid gap-4">
      {items.map((it, idx) => (
        <fieldset key={idx} className="ed-card grid gap-3 p-4">
          <legend className="sr-only">Item {idx + 1}</legend>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Item {idx + 1}</span>
            {items.length > 1 && (
              <button type="button" aria-label={`Remover o item ${idx + 1}`} onClick={() => onChange(items.filter((_, i) => i !== idx))} className="grid size-11 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          <input aria-label="Descrição do serviço" data-autofocus={idx === 0 ? "" : undefined} className={f} value={it.desc} onChange={(e) => patch(idx, { desc: e.target.value })} placeholder="Ex.: Consolidação do forro de madeira" maxLength={200} />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Unidade
              <input className={f} value={it.unit} onChange={(e) => patch(idx, { unit: e.target.value })} maxLength={10} />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Quantidade
              <input className={f} inputMode="decimal" value={it.qty} onChange={(e) => patch(idx, { qty: e.target.value })} placeholder="0" />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Material (R$/un.)
              <input className={f} inputMode="decimal" value={it.material} onChange={(e) => patch(idx, { material: e.target.value })} placeholder="0,00" />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Mão de obra (R$/un.)
              <input className={f} inputMode="decimal" value={it.labor} onChange={(e) => patch(idx, { labor: e.target.value })} placeholder="0,00" />
            </label>
          </div>
        </fieldset>
      ))}
      {items.length < 12 && (
        <Button type="button" variant="outline" className="min-h-12 w-fit rounded-full" onClick={() => onChange([...items, emptyPriceItem()])}>
          <Plus /> Adicionar item
        </Button>
      )}
    </div>
  );
}

export function PrecoFlow(p: PrecoProps) {
  const initial: V = {
    bdi: String(p.bdiPercent).replace(".", ","),
    items: [emptyPriceItem()],
    prazo: p.existing.prazo,
    validade: String(p.validityDays || 60),
    pagamento: p.existing.pagamento || "Conforme previsto no edital",
    valor: p.existing.valor,
    conclude: null,
  };

  const steps: WizStep<V>[] = useMemo(
    () => [
      {
        id: "bdi",
        title: "Qual o BDI desta proposta?",
        help: "Benefícios e despesas indiretas, em %. Vem da configuração do estúdio; ajuste se este edital pedir outro.",
        validate: (v) => precoRules.bdi(v.bdi),
        render: ({ v, set }) => <BigInput label="BDI" value={v.bdi} onChange={(x) => set({ bdi: x })} inputMode="decimal" suffix="%" maxLength={6} />,
      },
      {
        id: "itens",
        title: "Quais são os itens principais?",
        help: p.sheetExists ? "A planilha desta proposta já existe e será mantida; os itens abaixo não a substituem." : "Os itens entram na planilha de preços já calculados com BDI. Dá para pular e preencher a planilha depois.",
        optional: true,
        skip: () => p.sheetExists,
        render: ({ v, set }) => {
          const t = priceFromItems(v.items, num(v.bdi), p.encargosPercent);
          return (
            <div className="grid gap-4">
              <ItemsEditor items={v.items} onChange={(items) => set({ items })} />
              {t.count > 0 && (
                <p className="rounded-xl bg-brand-soft px-4 py-3 text-[15px]">
                  Custo direto <strong>{brl(t.direct)}</strong> + BDI <strong>{brl(t.bdi)}</strong> = <strong>{brl(t.total)}</strong>
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "prazo",
        title: "Qual o prazo de execução?",
        validate: (v) => precoRules.prazo(v.prazo),
        render: ({ v, set }) => <BigInput label="Prazo" value={v.prazo} onChange={(x) => set({ prazo: x })} placeholder="Ex.: 180 dias corridos" />,
      },
      {
        id: "validade",
        title: "Por quantos dias a proposta vale?",
        validate: (v) => precoRules.validade(v.validade),
        render: ({ v, set }) => <BigInput label="Validade" value={v.validade} onChange={(x) => set({ validade: x })} inputMode="numeric" suffix="dias" maxLength={3} />,
      },
      {
        id: "pagamento",
        title: "Quais as condições de pagamento?",
        optional: true,
        render: ({ v, set }) => <BigInput label="Condições de pagamento" value={v.pagamento} onChange={(x) => set({ pagamento: x })} placeholder="Conforme previsto no edital" />,
      },
      {
        id: "valor",
        title: "Qual o valor global da proposta?",
        help: p.estimatedCents ? `O órgão estimou ${money(p.estimatedCents)}.` : "Vai na carta-proposta. Pode deixar em branco e preencher depois.",
        optional: true,
        render: ({ v, set }) => {
          const t = priceFromItems(v.items, num(v.bdi), p.encargosPercent);
          return (
            <div className="grid gap-4">
              <BigInput label="Valor global" value={v.valor} onChange={(x) => set({ valor: x })} placeholder="R$ 0,00" />
              {t.count > 0 && v.valor !== brl(t.total) && (
                <Button type="button" variant="outline" className="min-h-12 w-fit rounded-full" onClick={() => set({ valor: brl(t.total) })}>
                  Usar o valor dos itens: {brl(t.total)}
                </Button>
              )}
            </div>
          );
        },
      },
      {
        id: "concluir",
        title: "Marcar a proposta de preço como concluída?",
        validate: (v) => (v.conclude === null ? "Escolha Sim ou Não." : null),
        render: ({ v, set, next }) => <YesNo label="Concluir a etapa" value={v.conclude} onChange={(x) => set({ conclude: x })} onPick={next} yes="Sim, está pronta" no="Ainda vou ajustar" />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Wizard<V>
      id={`preco:${p.editalId}`}
      name={`Proposta de preço · ${p.organ}`}
      closeHref={`/editais/propostas/${p.editalId}`}
      initial={initial}
      steps={steps}
      reviewTitle="Revise o preço"
      submitLabel="Gerar planilha e carta"
      review={(v, go) => {
        const t = priceFromItems(v.items, num(v.bdi), p.encargosPercent);
        return (
          <div className="ed-card px-5">
            <ReviewRow label="BDI" value={`${v.bdi}%`} onEdit={() => go("bdi")} />
            {!p.sheetExists && <ReviewRow label="Itens na planilha" value={t.count ? `${t.count} · ${brl(t.total)}` : "Nenhum (planilha de exemplo para preencher)"} onEdit={() => go("itens")} />}
            <ReviewRow label="Prazo de execução" value={v.prazo} onEdit={() => go("prazo")} />
            <ReviewRow label="Validade" value={`${v.validade} dias`} onEdit={() => go("validade")} />
            <ReviewRow label="Pagamento" value={v.pagamento} onEdit={() => go("pagamento")} />
            <ReviewRow label="Valor global" value={v.valor} onEdit={() => go("valor")} />
          </div>
        );
      }}
      onSubmit={(v) => precoFlow(p.editalId, { ...v, conclude: !!v.conclude })}
    />
  );
}
