"use client";

import { useMemo } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { KIND_LABEL, type EditalKind } from "@/lib/editais/types";
import { moneyShort } from "@/lib/format";
import { planChecklist } from "@/lib/propostas/checklist";
import { STEP_BY_KEY, type TemplateItem } from "@/lib/propostas/types";
import { participarFlow } from "@/lib/editais-app/actions/flows";
import { participarRules, type ParticiparValues } from "@/lib/editais-app/flow-rules";
import { ROLE_HELP, ROLE_LABEL } from "@/lib/editais-app/access";
import { ChoiceList } from "../wizard/fields";
import { BigInput } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

export type ParticiparProps = {
  edital: { id: string; title: string; object: string; organ: string; place: string; kind: string; valueCents: number | null; closeLabel: string; daysLeft: number | null };
  /** data limite do portal já no formato do campo (yyyy-MM-ddTHH:mm) */
  portalLocal: string;
  /** dia (yyyy-MM-dd) usado só no preview dos prazos */
  portalDay: string | null;
  today: string;
  templates: { key: string; name: string; description: string | null; items: TemplateItem[] }[];
  tipoToTemplate: Record<"obra" | "projeto" | "dispensa", string>;
  initialTipo: "obra" | "projeto" | "dispensa";
  team: { id: string; name: string }[];
  meId: string;
  partners: { id: string; name: string; company: string | null }[];
  /** já existe proposta deste edital? (o assistente só atualiza, sem duplicar) */
  exists: boolean;
};

const TIPOS = [
  { value: "obra", label: "Obra de restauro (execução)", hint: "Concorrência, tomada de preços, pregão de obra." },
  { value: "projeto", label: "Projeto, laudo ou consultoria", hint: "Proposta técnica e de preço de serviços de engenharia/arquitetura." },
  { value: "dispensa", label: "Dispensa ou contratação direta", hint: "Menor valor, menos documentos: cotação, convite, dispensa." },
];

const dmy = (d: string) => d.split("-").reverse().join("/");

export function ParticiparFlow(p: ParticiparProps) {
  const initial: ParticiparValues = {
    confirmed: false,
    tipo: p.initialTipo,
    templateKey: p.tipoToTemplate[p.initialTipo],
    sessionAt: p.portalLocal,
    ownerId: p.meId,
    partnerIds: [],
    partnerRole: "contribuir",
  };
  const hasDeadline = !!p.portalLocal;

  /** prazos de cada etapa para o modelo escolhido, de trás para frente a partir da data limite */
  const preview = (templateKey: string, sessionAt: string) => {
    const t = p.templates.find((x) => x.key === templateKey);
    const day = sessionAt ? sessionAt.slice(0, 10) : p.portalDay;
    if (!t) return [];
    const plan = planChecklist(t.items, day, p.today);
    const byStep = new Map<string, { count: number; first: string | null }>();
    for (const it of plan) {
      const cur = byStep.get(it.stepKey) ?? { count: 0, first: null };
      cur.count++;
      if (it.dueDay && (!cur.first || it.dueDay < cur.first)) cur.first = it.dueDay;
      byStep.set(it.stepKey, cur);
    }
    return [...byStep.entries()].map(([step, x]) => ({ step, label: STEP_BY_KEY[step as keyof typeof STEP_BY_KEY]?.short ?? step, count: x.count, due: x.first }));
  };

  const steps: WizStep<ParticiparValues>[] = useMemo(
    () => [
      {
        id: "confirmar",
        title: "É este o edital em que vamos participar?",
        validate: participarRules.confirmar,
        render: ({ v, set, next }) => (
          <div className="grid gap-5">
            <div className="ed-card grid gap-2 p-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" aria-hidden /> {p.edital.place ? `${p.edital.place} · ` : ""}
                {p.edital.organ}
              </p>
              <p className="text-lg leading-snug font-medium">{p.edital.object}</p>
              <p className="text-sm text-muted-foreground">
                {KIND_LABEL[p.edital.kind as EditalKind] ?? "Outro"}
                {p.edital.valueCents ? ` · ${moneyShort(p.edital.valueCents)}` : ""} · <CalendarClock className="inline size-3.5" aria-hidden /> {p.edital.closeLabel}
              </p>
            </div>
            {p.exists && <p className="rounded-xl bg-brand-soft px-4 py-3 text-[15px]">Este edital já tem uma proposta em andamento. Se continuar, só atualizamos a data, o responsável e o checklist — nada é duplicado.</p>}
            <ChoiceList
              label="Confirmar edital"
              value={v.confirmed ? "sim" : ""}
              onChange={(x) => set({ confirmed: x === "sim" })}
              onPick={next}
              options={[{ value: "sim", label: "Sim, vamos participar", hint: "Cria a proposta, o checklist com prazos e as tarefas." }]}
            />
          </div>
        ),
      },
      {
        id: "tipo",
        title: "Que tipo de licitação é?",
        help: "Isso escolhe o checklist certo. Você pode trocar no último passo.",
        validate: participarRules.tipo,
        render: ({ v, set, next }) => (
          <ChoiceList label="Tipo de licitação" value={v.tipo} onChange={(x) => set({ tipo: x as string, templateKey: p.tipoToTemplate[x as "obra"] ?? v.templateKey })} onPick={next} options={TIPOS} />
        ),
      },
      {
        id: "data",
        title: "Qual é a data limite da sessão?",
        help: hasDeadline ? "Veio do portal. Só mude se o edital (ou um aditivo) disser outra data." : "O portal não informou. Sem a data, os prazos do checklist não são calculados.",
        validate: (v) => participarRules.data(v, hasDeadline),
        render: ({ v, set }) => <BigInput label="Data e hora" type="datetime-local" value={v.sessionAt} onChange={(x) => set({ sessionAt: x })} hint={hasDeadline ? `Portal: ${p.edital.closeLabel}` : undefined} />,
      },
      {
        id: "responsavel",
        title: "Quem responde por esta proposta?",
        help: "Recebe os avisos de prazo e assume as etapas sem dono.",
        validate: participarRules.responsavel,
        render: ({ v, set, next }) => <ChoiceList label="Responsável" value={v.ownerId} onChange={(x) => set({ ownerId: x as string })} onPick={next} options={p.team.map((t) => ({ value: t.id, label: t.name, badge: t.id === p.meId ? "Você" : undefined }))} />,
      },
      {
        id: "parceiros",
        title: "Quer envolver algum parceiro?",
        help: "Opcional. Ele passa a ver esta proposta (etapas e checklist) e recebe um aviso.",
        optional: true,
        skip: () => p.partners.length === 0,
        render: ({ v, set }) => (
          <div className="grid gap-6">
            <ChoiceList label="Parceiros" multi value={v.partnerIds} onChange={(x) => set({ partnerIds: x as string[] })} options={p.partners.map((x) => ({ value: x.id, label: x.name, hint: x.company }))} />
            {v.partnerIds.length > 0 && (
              <ChoiceList
                label="O que podem fazer"
                value={v.partnerRole}
                onChange={(x) => set({ partnerRole: x as "ver" | "contribuir" })}
                options={(["contribuir", "ver"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r], hint: ROLE_HELP[r] }))}
              />
            )}
          </div>
        ),
      },
      {
        id: "modelo",
        title: "Este checklist serve?",
        help: "Os prazos contam de trás para a frente, em dias úteis, a partir da data limite.",
        validate: participarRules.modelo,
        render: ({ v, set }) => {
          const rows = preview(v.templateKey, v.sessionAt);
          return (
            <div className="grid gap-6">
              <ChoiceList
                label="Modelo de checklist"
                value={v.templateKey}
                onChange={(x) => set({ templateKey: x as string })}
                options={p.templates.map((t) => ({ value: t.key, label: t.name, hint: t.description, badge: t.key === p.tipoToTemplate[v.tipo as "obra"] ? "Sugerido" : undefined }))}
              />
              {rows.length > 0 && (
                <div className="ed-card overflow-hidden">
                  <p className="border-b bg-muted/50 px-4 py-2.5 text-sm font-medium">Como ficam os prazos</p>
                  <ul>
                    {rows.map((r) => (
                      <li key={r.step} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[15px] last:border-0">
                        <span>
                          {r.label} <span className="text-sm text-muted-foreground">· {r.count} {r.count === 1 ? "item" : "itens"}</span>
                        </span>
                        <span className="text-sm font-medium tabular-nums">{r.due ? `até ${dmy(r.due)}` : "sem data"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Wizard<ParticiparValues>
      id={`participar:${p.edital.id}`}
      name="Vou participar"
      closeHref={`/editais/radar/${p.edital.id}`}
      initial={initial}
      steps={steps}
      reviewTitle="Tudo certo? Vamos criar a proposta."
      submitLabel="Criar a proposta"
      review={(v, go) => {
        const t = p.templates.find((x) => x.key === v.templateKey);
        const owner = p.team.find((x) => x.id === v.ownerId);
        const partners = p.partners.filter((x) => v.partnerIds.includes(x.id));
        return (
          <div className="ed-card px-5">
            <ReviewRow label="Edital" value={p.edital.organ} />
            <ReviewRow label="Tipo de licitação" value={TIPOS.find((x) => x.value === v.tipo)?.label} onEdit={() => go("tipo")} />
            <ReviewRow label="Data limite" value={v.sessionAt ? new Date(v.sessionAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : p.edital.closeLabel} onEdit={() => go("data")} />
            <ReviewRow label="Responsável" value={owner?.name} onEdit={() => go("responsavel")} />
            {p.partners.length > 0 && <ReviewRow label="Parceiros" value={partners.length ? `${partners.map((x) => x.name).join(", ")} (${ROLE_LABEL[v.partnerRole].toLowerCase()})` : "Nenhum por enquanto"} onEdit={() => go("parceiros")} />}
            <ReviewRow label="Checklist" value={t?.name} onEdit={() => go("modelo")} />
          </div>
        );
      }}
      onSubmit={(v) => participarFlow(p.edital.id, v)}
    />
  );
}
