"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TALENT_STATUS } from "@/lib/talentos";
import { updateTalent } from "./actions";

export function TalentStatusForm({ id, status, notas, canEdit }: { id: string; status: string; notas: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateTalent.bind(null, id), null as { error?: string; ok?: boolean } | null);
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Etapa do cadastro
        <select
          name="status"
          defaultValue={status}
          disabled={!canEdit}
          className="h-9 w-full rounded-lg border bg-background px-2.5 text-[14px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {TALENT_STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Anotações internas (a pessoa não vê)
        <Textarea name="notas" defaultValue={notas} rows={5} maxLength={4000} disabled={!canEdit} placeholder="Impressões da entrevista, retorno combinado, projeto indicado…" />
      </label>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Salvar
          </Button>
          {state?.ok && !pending && <span className="text-[13px] text-emerald-700">Salvo.</span>}
          {state?.error && <span className="text-[13px] text-destructive">{state.error}</span>}
        </div>
      )}
    </form>
  );
}
