"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { invitePartnerFlow } from "@/lib/editais-app/actions/partners";
import { parceiroRules } from "@/lib/editais-app/flow-rules";
import type { InvitePack } from "@/lib/editais-app/partners";
import { Button } from "@/components/ui/button";
import { InvitePanel } from "../invite-panel";
import { BigInput, YesNo } from "../wizard/fields";
import { ReviewRow, Wizard, type WizStep } from "../wizard/wizard";

type V = { name: string; email: string; company: string; phone: string; areas: string; radarCompleto: boolean | null };

export function ParceiroFlow({ mailReady }: { mailReady: boolean }) {
  const steps: WizStep<V>[] = useMemo(
    () => [
      { id: "nome", title: "Como se chama o parceiro?", validate: (v) => parceiroRules.nome(v.name), render: ({ v, set }) => <BigInput label="Nome" value={v.name} onChange={(x) => set({ name: x })} placeholder="Nome e sobrenome" maxLength={120} /> },
      {
        id: "email",
        title: "Qual o e-mail dele?",
        help: "É com este e-mail que ele entra — de preferência pelo botão “Entrar com Google”.",
        validate: (v) => parceiroRules.email(v.email),
        render: ({ v, set }) => <BigInput label="E-mail" type="email" inputMode="email" value={v.email} onChange={(x) => set({ email: x })} placeholder="nome@empresa.com" />,
      },
      { id: "empresa", title: "De que empresa ou escritório?", optional: true, render: ({ v, set }) => <BigInput label="Empresa" value={v.company} onChange={(x) => set({ company: x })} maxLength={120} /> },
      { id: "telefone", title: "Qual o WhatsApp dele?", help: "Opcional. Com ele, o botão do WhatsApp já abre a conversa certa.", optional: true, render: ({ v, set }) => <BigInput label="Telefone" type="tel" inputMode="tel" value={v.phone} onChange={(x) => set({ phone: x })} placeholder="(11) 90000-0000" maxLength={40} /> },
      { id: "area", title: "Em que área ele atua?", optional: true, render: ({ v, set }) => <BigInput label="Área de atuação" value={v.areas} onChange={(x) => set({ areas: x })} placeholder="Ex.: Engenharia, jurídico de licitações" maxLength={200} /> },
      {
        id: "radar",
        title: "Liberar o Radar completo para ele?",
        help: "Por padrão o parceiro vê só o que você compartilhar. Com o Radar completo, ele vê todos os editais coletados (sem as notas da equipe).",
        validate: (v) => (v.radarCompleto === null ? "Escolha Sim ou Não." : null),
        render: ({ v, set, next }) => <YesNo label="Radar completo" value={v.radarCompleto} onChange={(x) => set({ radarCompleto: x })} onPick={next} yes="Sim, liberar o Radar completo" no="Não, só o que eu compartilhar" />,
      },
    ],
    [],
  );

  return (
    <Wizard<V>
      id="parceiro:novo"
      name="Convidar parceiro"
      closeHref="/editais/parceiros"
      initial={{ name: "", email: "", company: "", phone: "", areas: "", radarCompleto: null }}
      steps={steps}
      reviewTitle="Pronto para convidar?"
      submitLabel={mailReady ? "Enviar o convite" : "Criar o convite"}
      review={(v, go) => (
        <div className="grid gap-4">
          <div className="ed-card px-5">
            <ReviewRow label="Nome" value={v.name} onEdit={() => go("nome")} />
            <ReviewRow label="E-mail" value={v.email} onEdit={() => go("email")} />
            <ReviewRow label="Empresa" value={v.company} onEdit={() => go("empresa")} />
            <ReviewRow label="WhatsApp" value={v.phone} onEdit={() => go("telefone")} />
            <ReviewRow label="Área" value={v.areas} onEdit={() => go("area")} />
            <ReviewRow label="Radar completo" value={v.radarCompleto ? "Liberado" : "Não — só o que for compartilhado"} onEdit={() => go("radar")} />
          </div>
          <p className="text-sm text-muted-foreground">{mailReady ? "O convite sai por e-mail agora." : "O envio automático de e-mail não está ativo: você receberá o texto pronto para copiar ou mandar pelo WhatsApp."}</p>
        </div>
      )}
      onSubmit={(v) => invitePartnerFlow({ name: v.name, email: v.email, company: v.company, phone: v.phone, areas: v.areas, radarCompleto: !!v.radarCompleto })}
      renderDone={(r) => {
        const d = r.data as { partnerId: string; name: string; pack: InvitePack };
        return (
          <div className="mx-auto grid min-h-svh max-w-2xl content-start gap-6 px-5 py-10">
            <div className="ed-step-in grid gap-3">
              <span className="grid size-14 place-items-center rounded-full bg-brand text-on-brand">
                <Check className="size-7" strokeWidth={2.4} />
              </span>
              <h1 className="ed-title text-3xl">{d.pack.emailed ? "Convite enviado" : "Convite criado"}</h1>
              <p className="text-[17px] text-muted-foreground">A conta do parceiro já está ativa e restrita ao app Editais. Ele só verá o que você compartilhar.</p>
            </div>
            <InvitePanel pack={d.pack} name={d.name} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild size="lg" className="h-14 rounded-2xl text-base">
                <Link href={`/editais/parceiros/${d.partnerId}`}>
                  Ver o parceiro <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-2xl text-base">
                <Link href="/editais/radar">Compartilhar editais</Link>
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
}
