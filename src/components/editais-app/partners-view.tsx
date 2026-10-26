"use client";

import Link from "next/link";
import { ChevronRight, Handshake, Mail, MailWarning, Plus } from "lucide-react";
import { fromNow } from "@/lib/format";
import { INVITE_LABEL } from "@/lib/editais-app/invite";
import type { PartnerDTO } from "@/lib/editais-app/partners";
import { Button } from "@/components/ui/button";
import { Empty, Pill, type Tone } from "./primitives";

const TONE: Record<string, Tone> = { pendente: "warn", aceito: "good", revogado: "mute" };

export function PartnersView({ partners, mailReady }: { partners: PartnerDTO[]; mailReady: boolean }) {
  return (
    <div className="grid gap-4">
      {!mailReady && (
        <p className="flex items-start gap-3 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <MailWarning className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <span>O envio automático de e-mail não está ativo. Os convites saem como texto pronto para copiar ou mandar pelo WhatsApp e ficam “pendentes de envio” até você confirmar. Para ativar o e-mail, configure a chave do provedor (veja “Como usar → Parceiros”).</span>
        </p>
      )}
      {partners.length === 0 ? (
        <Empty
          icon={Handshake}
          title="Nenhum parceiro ainda"
          action={
            <Button asChild className="h-12 rounded-full px-6">
              <Link href="/editais/parceiros/novo">
                <Plus /> Convidar o primeiro parceiro
              </Link>
            </Button>
          }
        >
          Parceiros são pessoas de fora que ajudam nos editais. Eles entram só no app Editais e veem apenas o que você compartilhar.
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {partners.map((p) => (
            <li key={p.id}>
              <Link href={`/editais/parceiros/${p.id}`} className="ed-card group grid gap-2 p-4 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-medium">{p.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{[p.company, p.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Pill tone={TONE[p.state]}>{INVITE_LABEL[p.state]}</Pill>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span>{p.shareCount === 0 ? "Nada compartilhado" : `${p.shareCount} ${p.shareCount === 1 ? "compartilhado" : "compartilhados"}`}</span>
                  {p.radarCompleto && <span>Radar completo</span>}
                  <span>{p.lastLoginAt ? `Último acesso ${fromNow(p.lastLoginAt)}` : "Nunca entrou"}</span>
                </p>
                {p.state === "pendente" && (
                  <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Mail className="size-3.5" aria-hidden /> {p.channel === "email" ? "Convite enviado por e-mail" : "Convite pendente de envio — copie ou mande pelo WhatsApp"}
                  </p>
                )}
                <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
