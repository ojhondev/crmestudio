"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/form";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { addActivity } from "@/app/(app)/negocios/actions";

export function ActivityComposer({ dealId, contactId }: { dealId?: string; contactId?: string | null }) {
  const [state, action, pending] = useActionState(addActivity, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const types = Object.entries(ACTIVITY_TYPES)
    .filter(([k]) => k !== "etapa")
    .map(([value, label]) => ({ value, label }));
  return (
    <form ref={ref} action={action} className="grid gap-2 rounded-xl border bg-white p-3">
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      <Textarea name="body" rows={2} placeholder="Registrar nota, ligação, visita…" className="resize-none border-0 p-1 shadow-none focus-visible:ring-0" />
      <div className="flex items-center gap-2">
        <SimpleSelect name="type" options={types} defaultValue="nota" className="h-7 w-40 text-xs" />
        {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
        <Button size="sm" className="ml-auto" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Registrar
        </Button>
      </div>
    </form>
  );
}
