import type { Metadata } from "next";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { requireEditais } from "@/lib/editais-app/session";
import { parseRadar } from "@/lib/editais-app/radar-filters";
import { radarList, radarUfCounts } from "@/lib/editais-app/radar";
import { activePartners } from "@/lib/editais-app/partners";
import { sweepStaleRuns } from "@/lib/editais/ingest";
import { RadarView } from "@/components/editais-app/radar-view";
import { PageTitle, PageWrap } from "@/components/editais-app/primitives";

export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage({ searchParams }: PageProps<"/editais/radar">) {
  const { actor } = await requireEditais();
  const staff = actor.kind === "staff";
  const f = parseRadar(await searchParams, { partner: !staff });
  if (staff) await sweepStaleRuns().catch(() => undefined);
  const [res, ufCounts, owners, partners, busy] = await Promise.all([
    radarList(actor, f),
    radarUfCounts(actor, f),
    staff ? db.select({ id: schema.users.id, name: schema.users.name, profile: schema.users.profile }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)) : Promise.resolve([]),
    staff ? activePartners() : Promise.resolve([]),
    staff ? db.select({ id: schema.editalRuns.id }).from(schema.editalRuns).where(inArray(schema.editalRuns.status, ["solicitada", "executando"])).limit(1) : Promise.resolve([]),
  ]);
  const canEdit = staff && atLeast(actor.level, "edit");
  return (
    <PageWrap>
      <PageTitle title="Radar" sub={staff ? "Editais de restauro encontrados para o estúdio." : "Editais compartilhados com você."} />
      <RadarView
        key={JSON.stringify([f.q, f.tab, f.ufs, f.tipos, f.prazo, f.rel, f.sort, f.esfera, f.city, f.vmin, f.vmax, f.owner, f.mod, f.situacao])}
        initial={{ rows: res.rows, total: res.total, counts: res.counts, hasMore: res.hasMore }}
        filters={f}
        ufCounts={ufCounts}
        mode={staff ? "staff" : "partner"}
        canEdit={canEdit}
        canScan={canEdit}
        canExport={staff}
        lastFinishedAt={res.lastRun?.finishedAt ?? null}
        scanBusy={busy.length > 0}
        owners={owners.filter((o) => o.profile !== "parceiro_editais").map((o) => ({ id: o.id, name: o.name }))}
        partners={partners.map((p) => ({ id: p.id, name: p.name, company: p.company }))}
      />
    </PageWrap>
  );
}
