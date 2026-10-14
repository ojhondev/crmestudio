import type { Metadata } from "next";
import { headers } from "next/headers";
import { asc, count, eq } from "drizzle-orm";
import { CalendarDays, MessageCircle, Sparkles } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { anaEnabled } from "@/lib/ana";
import { whatsappConnected } from "@/lib/whatsapp";
import { PageBody, PageHeader } from "@/components/page-header";
import { Section } from "@/components/crm/section";
import { cn } from "@/lib/utils";
import { DemoDataButton, PasswordForm, ProfileForm, StagesEditor } from "./forms";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const [[me], stages, [demo]] = await Promise.all([
    db.select({ name: schema.users.name, phone: schema.users.phone }).from(schema.users).where(eq(schema.users.id, user.id)),
    db.select().from(schema.stages).orderBy(asc(schema.stages.position)),
    db.select({ n: count() }).from(schema.contacts).where(eq(schema.contacts.source, "exemplo")),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <PageHeader eyebrow="Ajustes" title="Ajustes" />
      <PageBody className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <Section title="Meu perfil">
          <ProfileForm name={me.name} phone={me.phone} email={user.email} />
        </Section>
        <Section title="Senha">
          <PasswordForm />
        </Section>

        {admin && (
          <Section title="Integrações" className="lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-3">
              <Integration
                icon={MessageCircle}
                title="WhatsApp Business"
                on={whatsappConnected()}
                onText="Cloud API conectada"
                offText="Modo simulado"
              >
                <p>
                  Webhook para o painel da Meta:
                  <code className="mt-1 block rounded bg-muted px-1.5 py-1 text-[11px] break-all">{origin}/api/whatsapp/webhook</code>
                </p>
                <p className="mt-1.5">
                  Variáveis: <code>WHATSAPP_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>, <code>WHATSAPP_VERIFY_TOKEN</code>,{" "}
                  <code>WHATSAPP_APP_SECRET</code>.
                </p>
              </Integration>
              <Integration icon={Sparkles} title="Ana (Claude)" on={anaEnabled()} onText="Ativa" offText="Sem chave">
                <p>
                  Usa o modelo Claude Opus 5.5 da Anthropic. Variável: <code>ANTHROPIC_API_KEY</code>.
                </p>
              </Integration>
              <Integration icon={CalendarDays} title="Agenda" on onText="Feed .ics ativo" offText="">
                <p>Cada pessoa tem um link privado em Agenda → Sincronizar, que funciona no Google Agenda, iPhone e Outlook.</p>
              </Integration>
            </div>
          </Section>
        )}

        {admin && (
          <Section title="Etapas do funil" className="lg:col-span-2">
            <StagesEditor stages={stages} />
          </Section>
        )}

        {admin && demo.n > 0 && (
          <Section title="Dados de exemplo" className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <p className="flex-1">
                Há {demo.n} contatos de exemplo (com negócios, conversas e eventos) para conhecer o app. Remova quando começar a usar de verdade.
              </p>
              <DemoDataButton />
            </div>
          </Section>
        )}
      </PageBody>
    </>
  );
}

function Integration({
  icon: Icon,
  title,
  on,
  onText,
  offText,
  children,
}: {
  icon: React.ElementType;
  title: string;
  on: boolean;
  onText: string;
  offText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2 rounded-lg border p-3.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-medium">{title}</span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[11px]",
            on ? "bg-success/10 text-success" : "bg-amber-50 text-amber-800",
          )}
        >
          {on ? onText : offText}
        </span>
      </div>
      <div className="text-[12px] text-muted-foreground">{children}</div>
    </div>
  );
}
