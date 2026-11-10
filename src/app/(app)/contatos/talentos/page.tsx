import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Briefcase, FileText, Plane, Search } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { AREAS, DISPONIBILIDADES, FAIXAS, REGIMES, TALENT_STATUS, TALENT_STATUS_TONE, UFS } from "@/lib/talentos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { ContatosTabs } from "../contatos-tabs";

export const metadata: Metadata = { title: "Banco de Talentos" };

const sel = "h-9 w-full rounded-lg border bg-background px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const get = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function TalentosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAccess("contatos");
  const sp = await searchParams;
  const q = get(sp.q);
  const area = get(sp.area);
  const regime = get(sp.regime);
  const viaja = get(sp.viaja); // sim | nao
  const faixa = get(sp.faixa);
  const disp = get(sp.disp);
  const status = get(sp.status);
  const uf = get(sp.uf);
  const hasFilter = !!(q || area || regime || viaja || faixa || disp || status || uf);
  const digits = q.replace(/\D/g, "");

  // quem só vê "os próprios" registros não tem o que ver aqui (talentos não têm responsável)
  const t = schema.talentos;
  const [rows, [{ n: novos }], [{ n: total }]] = await Promise.all([
    user.ownOnly
      ? Promise.resolve([])
      : db
          .select({
            id: t.id,
            nome: t.nome,
            email: t.email,
            telefone: t.telefone,
            cidade: t.cidade,
            uf: t.uf,
            areas: t.areas,
            regimes: t.regimes,
            disponibilidade: t.disponibilidade,
            viaja: t.viaja,
            viajaAte: t.viajaAte,
            faixaSalarial: t.faixaSalarial,
            anosExperiencia: t.anosExperiencia,
            status: t.status,
            createdAt: t.createdAt,
          })
          .from(t)
          .where(
            and(
              q
                ? or(
                    ilike(t.nome, `%${q}%`),
                    ilike(t.email, `%${q}%`),
                    ilike(t.cidade, `%${q}%`),
                    sql`${t.experiencias}::text ilike ${"%" + q + "%"}`,
                    digits.length >= 4 ? ilike(t.telefone, `%${digits}%`) : sql`false`,
                  )
                : undefined,
              area ? sql`${area} = any(${t.areas})` : undefined,
              regime ? sql`${regime} = any(${t.regimes})` : undefined,
              viaja ? eq(t.viaja, viaja === "sim") : undefined,
              faixa ? eq(t.faixaSalarial, faixa) : undefined,
              disp ? eq(t.disponibilidade, disp) : undefined,
              status ? eq(t.status, status) : undefined,
              uf ? eq(t.uf, uf) : undefined,
            ),
          )
          .orderBy(desc(t.createdAt))
          .limit(300),
    db.select({ n: count() }).from(t).where(eq(t.status, "Novo")),
    db.select({ n: count() }).from(t),
  ]);

  return (
    <>
      <PageToolbar
        title="Leads e contatos"
        tabs={<ContatosTabs active="talentos" novos={novos} />}
        filters={
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {rows.length} de {total} {total === 1 ? "cadastro" : "cadastros"}
          </span>
        }
      />
      <ToolArea className="md:h-[calc(100dvh-9.5rem)]">
        <div className="grid gap-4 p-4 sm:p-5">
          <form className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtrar talentos">
            <div className="relative sm:col-span-2 lg:col-span-4">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Buscar por nome, e-mail, cidade, telefone ou empresa onde trabalhou…" aria-label="Buscar talentos" className="h-9 pl-8" />
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Área de atuação
              <select name="area" defaultValue={area} className={sel}>
                <option value="">Todas</option>
                {AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Regime de contratação
              <select name="regime" defaultValue={regime} className={sel}>
                <option value="">Todos</option>
                {REGIMES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Faixa salarial
              <select name="faixa" defaultValue={faixa} className={sel}>
                <option value="">Todas</option>
                {FAIXAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Disponibilidade
              <select name="disp" defaultValue={disp} className={sel}>
                <option value="">Qualquer</option>
                {DISPONIBILIDADES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Viaja?
              <select name="viaja" defaultValue={viaja} className={sel}>
                <option value="">Tanto faz</option>
                <option value="sim">Sim, viaja</option>
                <option value="nao">Não viaja</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Estado
              <select name="uf" defaultValue={uf} className={sel}>
                <option value="">Todos</option>
                {UFS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Etapa
              <select name="status" defaultValue={status} className={sel}>
                <option value="">Todas</option>
                {TALENT_STATUS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" className="h-9">
                Filtrar
              </Button>
              {hasFilter && (
                <Button asChild variant="ghost" className="h-9">
                  <Link href="/contatos/talentos">Limpar</Link>
                </Button>
              )}
            </div>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Briefcase} title={hasFilter ? "Nada encontrado" : "Nenhum cadastro ainda"}>
              {hasFilter ? "Tente afrouxar os filtros." : "Os cadastros feitos em estudiorestaura.com.br/banco-de-talentos aparecem aqui."}
            </EmptyState>
          ) : (
            <ul className="grid gap-2.5">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/contatos/talentos/${r.id}`} className="grid gap-2 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40 lg:grid-cols-[1.2fr_1.6fr_1.2fr_auto] lg:items-center lg:gap-5">
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[15px] font-medium">{r.nome}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDate(r.createdAt, "dd/MM/yy")}</span>
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {r.cidade}/{r.uf} · {r.telefone}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">{r.email}</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {r.areas.slice(0, 3).map((a) => (
                        <span key={a} className="rounded-full border px-2.5 py-0.5 text-[12px]">
                          {a.split(" (")[0]}
                        </span>
                      ))}
                      {r.areas.length > 3 && <span className="px-1 text-[12px] text-muted-foreground">+{r.areas.length - 3}</span>}
                    </span>
                    <span className="grid gap-0.5 text-[13px] text-muted-foreground">
                      <span>
                        {r.regimes.join(", ")} · {r.faixaSalarial}
                      </span>
                      <span>
                        {r.disponibilidade} · {r.anosExperiencia}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Plane className="size-3.5" /> {r.viaja ? `Viaja${r.viajaAte ? ` · ${r.viajaAte}` : ""}` : "Não viaja"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 lg:justify-end">
                      <FileText className="size-4 text-muted-foreground" aria-label="Tem currículo" />
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap", TALENT_STATUS_TONE[r.status] ?? "bg-muted")}>{r.status}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ToolArea>
    </>
  );
}
