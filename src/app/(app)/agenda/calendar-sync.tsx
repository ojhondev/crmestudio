"use client";

import { CalendarSync as SyncIcon, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Link privado .ics para assinar no Google Agenda / iPhone / Outlook. */
export function CalendarSync({ token, origin }: { token: string; origin: string }) {
  const url = `${origin}/api/agenda/${token}`;
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Sincronizar agenda">
          <SyncIcon /> <span className="max-md:sr-only">Sincronizar</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-[min(340px,calc(100vw-1.5rem))] gap-3 text-[13px]">
        <p className="font-medium">Ver esta agenda no celular</p>
        <p className="text-muted-foreground">
          Assine o link abaixo no <strong>Google Agenda</strong> (Outras agendas → “Do URL”) ou no <strong>iPhone</strong> (toque em
          “Abrir no Calendário”). Os eventos aparecem lá e se atualizam sozinhos.
        </p>
        <div className="flex gap-1.5">
          <Input value={url} readOnly className="h-8 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button
            size="icon"
            variant="outline"
            aria-label="Copiar link"
            onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))}
          >
            <Copy />
          </Button>
        </div>
        <Button asChild size="sm" variant="secondary">
          <a href={webcal}>Abrir no Calendário (iPhone/Mac)</a>
        </Button>
        <p className="text-xs text-muted-foreground">
          O link é pessoal — não compartilhe. O Google atualiza assinaturas a cada algumas horas.
        </p>
      </PopoverContent>
    </Popover>
  );
}
