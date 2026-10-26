import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowUpRight, Bell, SlidersHorizontal } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has } from "@/lib/auth";
import { atLeast } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NOTIF_TYPES } from "@/lib/notifications-types";
import { getStudio } from "@/lib/docs/server";
import { activeUsers, ensureTemplates, getConfig } from "@/lib/propostas/server";
import { requireEditais } from "@/lib/editais-app/session";
import { ConfigClient } from "@/app/(app)/editais-avancado/configuracao/config-client";
import { PasswordForm, ProfileForm } from "@/app/(app)/ajustes/forms";
import { PageTitle, PageWrap } from "@/components/editais-app/primitives";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage({ searchParams }: PageProps<"/editais/ajustes">) {
  const { actor, user } = await requireEditais();
  const staff = actor.kind === "staff";
  const manage = staff && atLeast(actor.level, "manage");
  const tabs = [
    ...(manage ? [{ key: "estudio", label: "Estúdio e proposta" }] : []),
    { key: "conta", label: "Minha conta" },
    ...(staff ? [{ key: "regras", label: "Regras e avisos" }] : []),
  ];
  const sp = await searchParams;
  const aba = tabs.some((t) => t.key === sp.aba) ? (sp.aba as string) : tabs[0].key;

  let body: React.ReactNode = null;
  if (aba === "estudio" && manage) {
    await ensureTemplates();
    const [studio, cfg, team, templates, stages] = await Promise.all([
      getStudio(),
      getConfig(),
      activeUsers(),
      db.select().from(schema.propostaTemplates).orderBy(asc(schema.propostaTemplates.name)),
      db.select({ name: schema.stages.name, kind: schema.stages.kind }).from(schema.stages).orderBy(asc(schema.stages.position)),
    ]);
    body = (
      <ConfigClient
        part="dados"
        studio={{ name: studio.name, legalName: studio.legalName, document: studio.document, address: studio.address, city: studio.city, email: studio.email, phone: studio.phone, forum: studio.forum }}
        cfg={cfg}
        team={team}
        stages={stages.filter((s) => s.kind === "aberto").map((s) => s.name)}
        templates={templates.map((t) => ({ key: t.key, type: t.type as "checklist" | "matriz", name: t.name, description: t.description ?? "", items: t.items as unknown as Record<string, unknown>[], builtin: t.builtin, active: t.active }))}
      />
    );
  } else if (aba === "conta") {
    const [me] = await db.select({ name: schema.users.name, phone: schema.users.phone }).from(schema.users).where(eq(schema.users.id, user.id));
    body = (
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ed-card grid gap-3 p-5">
          <h2 className="ed-title text-xl">Meu perfil</h2>
          <ProfileForm name={me?.name ?? user.name} phone={me?.phone ?? null} email={user.email} />
        </section>
        <section className="ed-card grid gap-3 p-5">
          <h2 className="ed-title text-xl">Senha</h2>
          {actor.kind === "partner" && <p className="text-sm text-muted-foreground">Se você entra pelo Google, não precisa de senha.</p>}
          <PasswordForm />
        </section>
      </div>
    );
  } else {
    const types = (Object.entries(NOTIF_TYPES) as [string, { label: string; group: string; help: string }][]).filter(([, t]) => t.group === "editais");
    body = (
      <div className="grid gap-5">
        <section className="ed-card grid gap-3 p-5">
          <h2 className="ed-title flex items-center gap-2 text-xl">
            <Bell className="size-5 text-brand" aria-hidden /> Avisos automáticos de editais
          </h2>
          <p className="text-sm text-muted-foreground">O app avisa sozinho no sino. Cada pessoa liga ou desliga as categorias nas preferências de avisos.</p>
          <ul className="divide-y">
            {types.map(([k, t]) => (
              <li key={k} className="py-3">
                <p className="text-[15px] font-medium">{t.label}</p>
                <p className="text-[13px] text-muted-foreground">{t.help}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/notificacoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">
              Minhas preferências de avisos <ArrowUpRight className="size-3.5" />
            </Link>
            {has(user, "configuracoes", "view") && (
              <Link href="/automacoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">
                Regras de automação (prazos, cofre, propostas) <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <PageWrap className="max-w-5xl">
      <PageTitle title="Ajustes" sub={staff ? "Dados do estúdio, padrões da proposta e a sua conta." : "Sua conta."} />
      <div role="tablist" aria-label="Ajustes" className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link key={t.key} role="tab" aria-selected={aba === t.key} href={`/editais/ajustes?aba=${t.key}`} className={cn("flex min-h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10", aba === t.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </div>
      {body}
      {staff && (
        <p className="mt-10 border-t pt-4 text-[13px] text-muted-foreground">
          <SlidersHorizontal className="mr-1.5 inline size-3.5" aria-hidden />
          Precisa de alguma tela do formato antigo?{" "}
          <Link href="/editais-avancado" className="font-medium underline underline-offset-2">
            Modo avançado
          </Link>{" "}
          (temporário, enquanto o app novo se estabiliza).
        </p>
      )}
    </PageWrap>
  );
}
