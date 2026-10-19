import type { Metadata } from "next";
import { asc, count, eq } from "drizzle-orm";
import { CalendarDays, Sparkles } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireUser } from "@/lib/auth";
import { anaEnabled } from "@/lib/ana";
import { ANA_UI_ENABLED } from "@/lib/ana-flag";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { Section } from "@/components/crm/section";
import { cn } from "@/lib/utils";
import { getStudio } from "@/lib/docs/server";
import { DemoDataButton, PasswordForm, ProfileForm, StagesEditor, StudioForm } from "./forms";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const user = await requireUser();
  const canView = has(user, "configuracoes", "view");
  const canManage = has(user, "configuracoes", "manage");
  const [[me], stages, [demo], studio] = await Promise.all([
    db.select({ name: schema.users.name, phone: schema.users.phone }).from(schema.users).where(eq(schema.users.id, user.id)),
    db.select().from(schema.stages).orderBy(asc(schema.stages.position)),
    db.select({ n: count() }).from(schema.contacts).where(eq(schema.contacts.source, "exemplo")),
    canManage ? getStudio() : null,
  ]);

  return (
    <>
      <PageToolbar title="Ajustes" />
      <ToolArea>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
        <Section title="Meu perfil">
          <ProfileForm name={me.name} phone={me.phone} email={user.email} />
        </Section>
        <Section title="Senha">
          <PasswordForm />
        </Section>

        {canManage && studio && (
          <Section title="Dados do estúdio" className="lg:col-span-2">
            <p className="mb-3 text-[13px] text-muted-foreground">Entram automaticamente nos contratos e apresentações (CNPJ, endereço, responsável e foro).</p>
            <StudioForm studio={studio} />
          </Section>
        )}

        {canView && (
          <Section title="Integrações" className="lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              {ANA_UI_ENABLED && <Integration icon={Sparkles} title="Ana (Claude)" on={anaEnabled()} onText="Ativa" offText="Sem chave">
                <p>
                  Usa o modelo Claude Opus 5.5 da Anthropic. Variável: <code>ANTHROPIC_API_KEY</code>.
                </p>
              </Integration>}
              <Integration icon={CalendarDays} title="Agenda" on onText="Feed .ics ativo" offText="">
                <p>Cada pessoa tem um link privado em Agenda → Sincronizar, que funciona no Google Agenda, iPhone e Outlook.</p>
              </Integration>
            </div>
          </Section>
        )}

        {canManage && (
          <Section title="Etapas do funil" className="lg:col-span-2">
            <StagesEditor stages={stages} />
          </Section>
        )}

        {canManage && demo.n > 0 && (
          <Section title="Dados de exemplo" className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <p className="flex-1">
                Há {demo.n} contatos de exemplo (com negócios, e eventos) para conhecer o app. Remova quando começar a usar de verdade.
              </p>
              <DemoDataButton />
            </div>
          </Section>
        )}
      </div>
      </ToolArea>
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
            "ml-auto rounded-full px-2 py-0.5 text-xs",
            on ? "bg-success/10 text-success" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200",
          )}
        >
          {on ? onText : offText}
        </span>
      </div>
      <div className="text-[12px] text-muted-foreground">{children}</div>
    </div>
  );
}
