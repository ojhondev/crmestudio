import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { PROFILES, SELECTABLE_PROFILES, resolvePermissions, type ProfileKey } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { MemberList, NewMemberButton, type Member } from "./members";

export const metadata: Metadata = { title: "Equipe e acessos" };

const FILTERS: Record<string, { label: string; actions: string[] | null }> = {
  todas: { label: "Tudo", actions: null },
  acessos: { label: "Acessos", actions: ["login", "login_falhou", "senha_trocada", "senha_redefinida"] },
  equipe: { label: "Equipe", actions: ["usuario_criado", "usuario_ativado", "usuario_desativado", "permissoes_alteradas"] },
  financeiro: { label: "Financeiro", actions: ["lancamento_criado", "lancamento_alterado", "lancamento_baixado", "lancamento_reaberto", "lancamento_excluido"] },
  exclusoes: { label: "Exclusões", actions: ["negocio_excluido", "contato_excluido", "lancamento_excluido", "exemplos_removidos"] },
};

export default async function TeamPage({ searchParams }: PageProps<"/equipe">) {
  const me = await requireAccess("equipe");
  const sp = await searchParams;
  const canManage = has(me, "equipe", "manage");
  const aba = sp.aba === "atividade" ? "atividade" : "pessoas";
  const f = typeof sp.f === "string" && sp.f in FILTERS ? sp.f : "todas";

  const rows = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const members: Member[] = rows
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      profile: (u.profile in PROFILES ? u.profile : "personalizado") as ProfileKey,
      title: u.title,
      phone: u.phone,
      active: u.active,
      ownOnly: u.role === "admin" ? false : u.ownOnly,
      perms: resolvePermissions(u),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      mustChange: u.mustChangePassword,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.role === "admin") - Number(a.role === "admin") || a.name.localeCompare(b.name));

  const log =
    aba === "atividade"
      ? await db
          .select()
          .from(schema.auditLog)
          .where(FILTERS[f].actions ? inArray(schema.auditLog.action, FILTERS[f].actions!) : undefined)
          .orderBy(desc(schema.auditLog.at))
          .limit(150)
      : [];

  const tab = (key: string, label: string) => (
    <Link
      href={key === "pessoas" ? "/equipe" : "/equipe?aba=atividade"}
      className={cn("rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors max-md:py-2.5", aba === key ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageToolbar
        title="Equipe e acessos"
        filters={
          <div data-tour="team-tabs" className="flex gap-1">
            {tab("pessoas", `Pessoas (${members.filter((m) => m.active).length})`)}
            {tab("atividade", "Atividade")}
          </div>
        }
        actions={canManage ? <NewMemberButton isAdmin={me.role === "admin"} /> : undefined}
      />
      <ToolArea>
      <div className="grid gap-5 p-4 sm:p-5">
        {aba === "pessoas" ? (
          <>
            <details className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13.5px] font-medium">
                Entenda os perfis de acesso
                <span className="ml-auto text-[12px] font-normal text-muted-foreground group-open:hidden">mostrar</span>
              </summary>
              <div className="grid gap-2.5 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
                {SELECTABLE_PROFILES.map((p) => (
                  <div key={p} className="rounded-lg bg-muted/40 p-3">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="size-2 rounded-full" style={{ background: PROFILES[p].color }} />
                      {PROFILES[p].label}
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{PROFILES[p].description}</p>
                  </div>
                ))}
              </div>
              <p className="border-t px-4 py-3 text-[12px] text-muted-foreground">
                Dentro de cada módulo há quatro níveis: <strong>Nenhum</strong> (nem aparece no menu), <strong>Ver</strong> (só consulta), <strong>Editar</strong> (cria e altera) e{" "}
                <strong>Gerenciar</strong> (também exclui e mexe em configurações). Toque em uma pessoa para ajustar.
              </p>
            </details>
            <MemberList members={members} viewer={{ id: me.id, isAdmin: me.role === "admin", perms: me.perms }} canManage={canManage} />
          </>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(FILTERS).map(([k, v]) => (
                <Link
                  key={k}
                  href={`/equipe?aba=atividade${k !== "todas" ? `&f=${k}` : ""}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12.5px] text-muted-foreground transition-colors hover:border-foreground/30",
                    f === k && "border-foreground bg-foreground text-background hover:border-foreground",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </div>
            {log.length ? (
              <ul className="divide-y rounded-xl border bg-card">
                {log.map((e) => (
                  <li key={e.id} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                    <span className="text-[12px] text-muted-foreground tabular-nums">{fmtDateTime(e.at)}</span>
                    <span className="text-[13px] leading-snug">
                      <span className="font-medium">{e.actorName ?? "Sistema"}</span> <span className="text-muted-foreground">·</span> {e.summary}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed p-8 text-center text-[13px] text-muted-foreground">Nenhum registro por aqui ainda.</p>
            )}
            <p className="text-[12px] text-muted-foreground">Mostrando os 150 registros mais recentes. A trilha guarda acessos, alterações de permissão, lançamentos financeiros e exclusões.</p>
          </div>
        )}
      </div>
      </ToolArea>
    </>
  );
}
