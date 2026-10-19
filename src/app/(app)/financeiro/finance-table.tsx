"use client";

import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, SimpleSelect } from "@/components/form";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { EmptyState } from "@/components/page-header";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/constants";
import { centsToInput, fmtDate, money, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteTransaction, saveTransaction, togglePaid } from "./actions";

type Row = {
  id: string;
  kind: "receita" | "despesa";
  description: string;
  category: string | null;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  dealId: string | null;
  contactId: string | null;
  notes: string | null;
  dealTitle: string | null;
  contactName: string | null;
};
type Opt = { id: string; name: string };
type Preset = { kind: "receita" | "despesa"; dealId?: string; contactId?: string; amountCents?: number; description?: string };

export function FinanceTable({ rows, today, deals, contacts, canEdit = true, canDelete = true }: { rows: Row[]; today: string; deals: Opt[]; contacts: Opt[]; canEdit?: boolean; canDelete?: boolean }) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [optimistic, setPaid] = useOptimistic(rows, (state, { id, paid }: { id: string; paid: boolean }) =>
    state.map((r) => (r.id === id ? { ...r, paidAt: paid ? today : null } : r)),
  );
  const [, start] = useTransition();

  if (!rows.length)
    return (
      <EmptyState icon={Wallet} title="Nenhum lançamento neste mês">
        Registre receitas (sinal, parcelas de obra, laudos) e despesas (materiais, terceiros, comissões).
      </EmptyState>
    );

  return (
    <>
      <div data-tour="fin-table" className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b text-left text-[11.5px] text-muted-foreground">
              <th className="w-10 px-4 py-2.5 font-medium">Pago</th>
              <th className="px-2 py-2.5 font-medium">Vencimento</th>
              <th className="px-4 py-2.5 font-medium">Descrição</th>
              <th className="px-4 py-2.5 font-medium">Categoria</th>
              <th className="px-4 py-2.5 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {optimistic.map((r) => {
              const late = !r.paidAt && r.dueDate < today;
              return (
                <tr key={r.id} className={cn("border-b last:border-0", canEdit && "cursor-pointer hover:bg-muted/50")} onClick={canEdit ? () => setEditing(r) : undefined}>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!!r.paidAt}
                      disabled={!canEdit}
                      aria-label="Marcar como pago"
                      onCheckedChange={(v) =>
                        start(async () => {
                          setPaid({ id: r.id, paid: !!v });
                          await togglePaid(r.id, !!v);
                        })
                      }
                    />
                  </td>
                  <td className={cn("px-2 py-2.5 tabular-nums", late ? "text-destructive" : "text-muted-foreground")}>
                    {fmtDate(r.dueDate, "dd/MM")}
                    {late && <span className="ml-1.5 text-[11px]">atrasado</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.kind === "receita" ? (
                        <ArrowDownLeft className="size-3.5 shrink-0 text-success" />
                      ) : (
                        <ArrowUpRight className="size-3.5 shrink-0 text-destructive" />
                      )}
                      <div className="grid leading-tight">
                        <span className={cn(r.paidAt && "text-muted-foreground")}>{r.description}</span>
                        {(r.dealTitle || r.contactName) && (
                          <span className="text-[11.5px] text-muted-foreground">
                            {r.dealId ? (
                              <Link href={`/negocios/${r.dealId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                                {r.dealTitle}
                              </Link>
                            ) : (
                              r.contactName
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.category ?? "—"}</td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", r.kind === "despesa" && "text-destructive")}>
                    {r.kind === "despesa" ? "−" : ""}
                    {money(r.amountCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TransactionDialog open={!!editing} onClose={() => setEditing(null)} row={editing ?? undefined} deals={deals} contacts={contacts} canDelete={canDelete} />
    </>
  );
}

export function TransactionDialogLauncher({ deals, contacts, openWith }: { deals: Opt[]; contacts: Opt[]; openWith?: Preset }) {
  const [open, setOpen] = useState(!!openWith);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Lançamento
      </Button>
      <TransactionDialog open={open} onClose={() => setOpen(false)} preset={openWith} deals={deals} contacts={contacts} />
    </>
  );
}

function TransactionDialog({
  open,
  onClose,
  row,
  preset,
  deals,
  contacts,
  canDelete = true,
}: {
  open: boolean;
  onClose: () => void;
  row?: Row;
  preset?: Preset;
  deals: Opt[];
  contacts: Opt[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"receita" | "despesa">(row?.kind ?? preset?.kind ?? "receita");
  const [paid, setPaid] = useState(!!row?.paidAt);
  const [state, action, pending] = useActionState(saveTransaction, null);
  const [prevKey, setPrevKey] = useState({ row, open });
  if (prevKey.row !== row || prevKey.open !== open) {
    setPrevKey({ row, open });
    setKind(row?.kind ?? preset?.kind ?? "receita");
    setPaid(!!row?.paidAt);
  }
  useEffect(() => {
    if (state?.ok) {
      toast.success("Lançamento salvo");
      onClose();
      const u = new URL(window.location.href);
      if (u.searchParams.has("novo")) {
        u.searchParams.delete("novo");
        u.searchParams.delete("deal");
        router.replace(u.pathname + u.search, { scroll: false });
      } else router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-normal">{row ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>
        <form key={row?.id ?? "new"} action={action} className="grid gap-4">
          {row && <input type="hidden" name="id" value={row.id} />}
          <input type="hidden" name="kind" value={kind} />
          <Tabs value={kind} onValueChange={(v) => setKind(v as "receita" | "despesa")}>
            <TabsList className="w-full">
              <TabsTrigger value="receita" className="flex-1">
                Receita
              </TabsTrigger>
              <TabsTrigger value="despesa" className="flex-1">
                Despesa
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Field label="Descrição" htmlFor="tx-desc">
            <Input
              id="tx-desc"
              name="description"
              required
              defaultValue={row?.description ?? (preset?.description ? `${preset.description}` : "")}
              placeholder={kind === "receita" ? "Sinal — restauro do retábulo" : "Compra de pigmentos"}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" htmlFor="tx-amount">
              <Input
                id="tx-amount"
                name="amount"
                required
                inputMode="decimal"
                defaultValue={centsToInput(row?.amountCents ?? preset?.amountCents ?? 0)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Vencimento" htmlFor="tx-due">
              <Input id="tx-due" name="dueDate" type="date" required defaultValue={row?.dueDate ?? todayISO()} />
            </Field>
            <Field label="Categoria">
              <SimpleSelect
                key={kind}
                name="category"
                allowNone
                defaultValue={row?.category}
                options={kind === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES}
              />
            </Field>
            {!row && (
              <Field label="Parcelas" htmlFor="tx-inst" hint="Mensais, a partir do vencimento">
                <Input id="tx-inst" name="installments" type="number" min={1} max={48} defaultValue={1} />
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Negócio">
              <SimpleSelect name="dealId" allowNone defaultValue={row?.dealId ?? preset?.dealId} options={deals.map((d) => ({ value: d.id, label: d.name }))} />
            </Field>
            <Field label="Cliente / fornecedor">
              <SimpleSelect
                name="contactId"
                allowNone
                defaultValue={row?.contactId ?? preset?.contactId}
                options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="tx-paid" name="paid" checked={paid} onCheckedChange={setPaid} />
            <Label htmlFor="tx-paid" className="text-[13px] font-normal">
              {kind === "receita" ? "Já recebido" : "Já pago"}
              {!row && " (1ª parcela)"}
            </Label>
            {row && paid && <input type="hidden" name="paidAt" value={row.paidAt ?? ""} />}
          </div>
          <Field label="Observações" htmlFor="tx-notes">
            <Textarea id="tx-notes" name="notes" rows={2} defaultValue={row?.notes ?? ""} />
          </Field>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex items-center gap-2">
            {row && canDelete && (
              <ConfirmButton
                title="Excluir lançamento?"
                action={async () => {
                  await deleteTransaction(row.id);
                  onClose();
                  router.refresh();
                }}
              />
            )}
            <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
