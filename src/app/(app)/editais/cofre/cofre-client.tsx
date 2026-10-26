"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetCloseBtn } from "@/components/touch-close";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { EmptyState } from "@/components/page-header";
import { Field, SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { VALIDITY_LABEL, validityText, type Validity } from "@/lib/propostas/cofre";
import { COFRE_LABEL, COFRE_SHORT, COFRE_TYPES } from "@/lib/propostas/types";
import { deleteCofreDocAction, saveCofreDocAction } from "../cofre-actions";

type Item = {
  id: string;
  type: string;
  title: string;
  number: string | null;
  issuer: string | null;
  issuedAt: string | null;
  validUntil: string | null;
  url: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  validity: { status: Validity; daysLeft: number | null };
};
type Person = { id: string; name: string };

const EMPTY = { id: "", type: "certidao_federal", title: "", number: "", issuer: "", issuedAt: "", validUntil: "", url: "", notes: "", ownerId: "" };
const STARTERS = ["certidao_federal", "certidao_fgts", "certidao_trabalhista", "contrato_social", "cnpj", "registro_conselho"];

const TONE: Record<Validity, string> = {
  valido: "border-border bg-muted text-foreground",
  sem_validade: "border-dashed text-muted-foreground",
  vence_30: "border-brand bg-brand-soft text-brand",
  vencido: "border-brand bg-brand text-on-brand",
};

export function CofreClient({ items, team, canEdit, canManage }: { items: Item[]; team: Person[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");

  const kpi = useMemo(() => ({ total: items.length, vencidos: items.filter((i) => i.validity.status === "vencido").length, breve: items.filter((i) => i.validity.status === "vence_30").length }), [items]);
  const groupOf = (t: string) => COFRE_TYPES.find((x) => x.key === t)?.group ?? "Outros";
  const groups = [...new Set(COFRE_TYPES.map((t) => t.group))];
  const shown = items.filter((i) => (!group || groupOf(i.type) === group) && (!status || (status === "atencao" ? i.validity.status === "vencido" || i.validity.status === "vence_30" : i.validity.status === status)));

  const startNew = (type = "certidao_federal") => setForm({ ...EMPTY, type, title: COFRE_SHORT[type] ?? "" });
  const save = () =>
    start(async () => {
      if (!form) return;
      const r = await saveCofreDocAction({ ...form, id: form.id || undefined, ownerId: form.ownerId || null });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Salvo no cofre");
        setForm(null);
        router.refresh();
      }
    });
  const chip = (active: boolean) => cn("inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[13px] whitespace-nowrap max-md:min-h-11", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30");

  return (
    <div className="grid gap-4 p-3 sm:p-5">
      <div className="grid grid-cols-3 gap-2.5" data-tour="cofre-kpis">
        <Kpi label="No cofre" value={kpi.total} />
        <Kpi label="Vencidos" value={kpi.vencidos} accent />
        <Kpi label="Vencem em 30 dias" value={kpi.breve} accent />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[13px] text-muted-foreground">
          Certidões, contrato social, registros e atestados que se repetem em toda licitação. O CRM guarda <strong className="font-medium text-foreground">o link</strong> do arquivo (Drive, site do órgão), não o arquivo, e avisa 30, 15 e 7 dias antes de vencer.
        </p>
        {canEdit && (
          <Button type="button" size="sm" data-tour="cofre-novo" className="max-md:h-11" onClick={() => startNew()}>
            <Plus /> Novo documento
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
          <button type="button" className={chip(!group && !status)} onClick={() => (setGroup(""), setStatus(""))}>
            Todos
          </button>
          <button type="button" className={chip(status === "atencao")} onClick={() => (setGroup(""), setStatus(status === "atencao" ? "" : "atencao"))}>
            Pedem atenção
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className={chip(group === g)} onClick={() => setGroup(group === g ? "" : g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="O cofre está vazio">
          Comece por <strong>certidões</strong> e <strong>contrato social</strong>: são o que mais trava uma proposta.
          {canEdit && (
            <span className="mt-3 flex flex-wrap justify-center gap-1.5">
              {STARTERS.map((t) => (
                <Button key={t} type="button" size="sm" variant="outline" className="max-md:h-11" onClick={() => startNew(t)}>
                  <Plus /> {COFRE_SHORT[t]}
                </Button>
              ))}
            </span>
          )}
        </EmptyState>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-[13px] text-muted-foreground">Nada com esse filtro.</p>
      ) : (
        <ul data-tour="cofre-list" className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <li key={i.id} className="grid content-start gap-2 rounded-xl border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="label">{COFRE_SHORT[i.type] ?? i.type}</p>
                  <p className="text-[14px] leading-snug font-medium break-words">{i.title}</p>
                </div>
                <span title={VALIDITY_LABEL[i.validity.status]} className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[i.validity.status])}>
                  {validityText(i.validity)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {[i.number ? `nº ${i.number}` : null, i.issuer, i.validUntil ? `validade ${fmtDate(i.validUntil)}` : null, i.ownerName ? `resp. ${i.ownerName.split(" ")[0]}` : null].filter(Boolean).join(" · ") || "Sem detalhes"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {i.url ? (
                  <Button asChild size="sm" variant="outline" className="max-md:h-11">
                    <a href={i.url} target="_blank" rel="noreferrer">
                      <ExternalLink /> Abrir arquivo
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-brand">Sem link do arquivo</span>
                )}
                {canEdit && (
                  <Button type="button" size="sm" variant="ghost" className="max-md:h-11" onClick={() => setForm({ id: i.id, type: i.type, title: i.title, number: i.number ?? "", issuer: i.issuer ?? "", issuedAt: i.issuedAt ?? "", validUntil: i.validUntil ?? "", url: i.url ?? "", notes: i.notes ?? "", ownerId: i.ownerId ?? "" })}>
                    <Pencil /> Editar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent className="flex flex-col gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-md" showCloseButton={false}>
          <SheetCloseBtn />
          <SheetHeader>
            <SheetTitle>{form?.id ? "Editar documento" : "Novo documento do cofre"}</SheetTitle>
            <SheetDescription>Guarde o link do arquivo e a validade. É a validade que gera os avisos.</SheetDescription>
          </SheetHeader>
          {form && (
            <div className="grid flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-4 pb-6">
              <Field label="Tipo">
                <SimpleSelect
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v, title: !form.title || form.title === COFRE_SHORT[form.type] ? (COFRE_SHORT[v] ?? "") : form.title })}
                  options={COFRE_TYPES.map((t) => ({ value: t.key, label: t.label }))}
                />
              </Field>
              <Field label="Nome" hint={`Como você reconhece: “${COFRE_LABEL[form.type] ?? ""}” ou “Atestado – Matriz de Itu”.`}>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={160} className="max-md:h-11" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Número">
                  <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} maxLength={80} className="max-md:h-11" />
                </Field>
                <Field label="Emissor">
                  <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Receita, Caixa…" maxLength={120} className="max-md:h-11" />
                </Field>
                <Field label="Emissão">
                  <Input type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} className="h-9 text-base max-md:h-11 md:text-sm" />
                </Field>
                <Field label="Validade">
                  <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="h-9 text-base max-md:h-11 md:text-sm" />
                </Field>
              </div>
              <Field label="Link do arquivo" hint="Cole o link do Drive ou do site que emitiu. Não envie o arquivo para cá.">
                <Input inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" maxLength={600} className="max-md:h-11" />
              </Field>
              <Field label="Responsável por renovar" hint="Recebe os avisos de vencimento (junto com os administradores).">
                <SimpleSelect value={form.ownerId || "__none"} onValueChange={(v) => setForm({ ...form, ownerId: v === "__none" ? "" : v })} options={[{ value: "__none", label: "Eu mesmo(a)" }, ...team.map((u) => ({ value: u.id, label: u.name }))]} />
              </Field>
              <Field label="Observações">
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={500} className="text-base md:text-sm" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={pending} className="max-md:h-11" onClick={save}>
                  {pending && <Loader2 className="animate-spin" />} Salvar
                </Button>
                {form.id && canManage && (
                  <ConfirmButton
                    title="Remover do cofre?"
                    description="O documento deixa de ser sugerido nas matrizes de habilitação. O arquivo no Drive não é apagado."
                    label="Remover"
                    action={async () => {
                      const r = await deleteCofreDocAction(form.id);
                      if ("error" in r) toast.error(r.error);
                      else {
                        toast.success("Removido do cofre");
                        setForm(null);
                        router.refresh();
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="grid gap-0.5 rounded-xl border bg-card px-4 py-3 max-md:min-h-16">
      <span className="label">{label}</span>
      <span className={cn("num-xl text-[24px] sm:text-[28px]", accent && value > 0 && "text-brand")}>{value}</span>
    </div>
  );
}
