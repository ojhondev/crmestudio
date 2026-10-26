"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveNotes } from "@/app/(app)/editais-avancado/actions";

/** Anotações internas da equipe sobre o edital (o parceiro nunca vê). */
export function NotesBox({ editalId, initial, canEdit }: { editalId: string; initial: string; canEdit: boolean }) {
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = text !== initial;
  return (
    <div className="grid gap-2">
      <label htmlFor="anotacoes" className="sr-only">
        Anotações da equipe
      </label>
      <textarea
        id="anotacoes"
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        rows={4}
        maxLength={4000}
        placeholder="Anote o que descobriu: ligou para o órgão, exige visita técnica, valor suspeito…"
        className="w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:text-sm"
      />
      {canEdit && (
        <div>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-9"
            disabled={!dirty || pending}
            onClick={() =>
              start(async () => {
                const r = await saveNotes(editalId, text);
                if ("error" in r && r.error) return void toast.error(r.error);
                toast.success("Anotações salvas");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar anotações
          </Button>
        </div>
      )}
    </div>
  );
}
