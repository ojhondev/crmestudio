import "server-only";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolvePermissions, isEditaisPartner, type Level, type Permissions } from "@/lib/permissions";
import { canSeeEditalPure, visibility, type EditaisActor, type ShareLite, type Visibility, NO_ACCESS } from "./access";

/**
 * Autorização do app Editais NO SERVIDOR. Toda página, action e rota do app passa por aqui.
 * (Sem next/headers: testável. A leitura da sessão fica em session.ts.)
 */

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Monta o ator a partir de uma conta (equipe ou parceiro). null = conta sem acesso ao app. */
export async function actorFromUser(u: { id: string; name: string; role: string; profile?: string | null; permissions?: unknown; perms?: Permissions; active?: boolean }): Promise<EditaisActor | null> {
  if (u.active === false) return null;
  if (isEditaisPartner(u)) {
    const [p] = await db.select({ radarCompleto: schema.editalPartners.radarCompleto, revokedAt: schema.editalPartners.revokedAt }).from(schema.editalPartners).where(eq(schema.editalPartners.userId, u.id)).limit(1);
    if (!p || p.revokedAt) return null;
    return { kind: "partner", id: u.id, name: u.name, radarCompleto: p.radarCompleto };
  }
  if (u.role === "parceiro") return null; // parceiro comercial antigo: não entra no app Editais
  const perms = u.perms ?? resolvePermissions({ role: u.role as "admin" | "equipe", profile: u.profile, permissions: u.permissions });
  const level: Level = perms.editais;
  if (level === "none") return null;
  return { kind: "staff", id: u.id, name: u.name, level };
}

/** Compartilhamento do parceiro neste edital (ou null). Para a equipe sempre null (não se aplica). */
export async function shareFor(actor: EditaisActor, editalId: string): Promise<(ShareLite & { id: string }) | null> {
  if (actor.kind !== "partner" || !isId(editalId)) return null;
  const [s] = await db
    .select()
    .from(schema.editalShares)
    .where(and(eq(schema.editalShares.editalId, editalId), eq(schema.editalShares.partnerId, actor.id)))
    .limit(1);
  if (!s) return null;
  return { id: s.id, role: s.role === "contribuir" ? "contribuir" : "ver", scope: s.scope === "proposta" ? "proposta" : "edital", showDocs: s.showDocs, showSheet: s.showSheet, docIds: s.docIds ?? [] };
}

/** Tudo que o ator pode neste edital (uma consulta). */
export async function accessTo(actor: EditaisActor, editalId: string): Promise<Visibility> {
  if (!isId(editalId)) return NO_ACCESS;
  if (actor.kind === "staff") return visibility(actor, null);
  // o edital precisa existir
  const share = await shareFor(actor, editalId);
  const v = visibility(actor, share);
  if (!v.edital) return NO_ACCESS;
  const [e] = await db.select({ id: schema.editais.id }).from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  return e ? v : NO_ACCESS;
}

/** ★ O helper central: este ator pode ver este edital? */
export async function canSeeEdital(actor: EditaisActor, editalId: string): Promise<boolean> {
  return (await accessTo(actor, editalId)).edital;
}

export async function canSeeProposta(actor: EditaisActor, editalId: string): Promise<boolean> {
  return (await accessTo(actor, editalId)).proposta;
}

export async function canContribute(actor: EditaisActor, editalId: string): Promise<boolean> {
  const v = await accessTo(actor, editalId);
  return v.edital && v.contribute;
}

/** Filtra uma lista de ids deixando só os que o ator pode ver (uma consulta, sem N+1). */
export async function filterVisibleEditais(actor: EditaisActor, ids: string[]): Promise<string[]> {
  const list = [...new Set(ids.filter(isId))];
  if (!list.length) return [];
  if (actor.kind === "staff") return canSeeEditalPure(actor, null) ? list : [];
  if (actor.radarCompleto) {
    const rows = await db.select({ id: schema.editais.id }).from(schema.editais).where(inArray(schema.editais.id, list));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ id: schema.editalShares.editalId })
    .from(schema.editalShares)
    .where(and(eq(schema.editalShares.partnerId, actor.id), inArray(schema.editalShares.editalId, list)));
  return rows.map((r) => r.id);
}

/**
 * Condição SQL que restringe uma consulta de editais ao que o ator enxerga.
 * Equipe: sem restrição. Parceiro com Radar completo: sem restrição. Parceiro comum: só os compartilhados.
 * `onlyProposta`: só os que têm a proposta compartilhada (para a tela Propostas).
 */
export function scopeCondition(actor: EditaisActor, editalIdCol: SQL | typeof schema.editais.id, opts: { onlyProposta?: boolean } = {}): SQL | undefined {
  if (actor.kind === "staff") return undefined;
  if (actor.radarCompleto && !opts.onlyProposta) return undefined;
  return sql`${editalIdCol} in (select ${schema.editalShares.editalId} from ${schema.editalShares} where ${schema.editalShares.partnerId} = ${actor.id}${opts.onlyProposta ? sql` and ${schema.editalShares.scope} = 'proposta'` : sql``})`;
}

/** Lança erro padronizado quando o ator não pode (para actions e rotas). */
export class Forbidden extends Error {
  constructor(msg = "Você não tem acesso a este edital.") {
    super(msg);
  }
}

export async function assertEdital(actor: EditaisActor, editalId: string, need: "edital" | "proposta" | "contribute" | "staff" = "edital"): Promise<Visibility> {
  const v = await accessTo(actor, editalId);
  const ok = need === "edital" ? v.edital : need === "proposta" ? v.proposta : need === "contribute" ? v.edital && v.contribute : v.staff;
  if (!ok) throw new Forbidden(need === "staff" ? "Só a equipe pode fazer isso." : undefined);
  return v;
}

/** Versão sem exceção para actions que devolvem `{ error }`. */
export async function checkEdital(actor: EditaisActor, editalId: string, need: "edital" | "proposta" | "contribute" | "staff" = "edital"): Promise<{ error: string } | { ok: true; v: Visibility }> {
  try {
    return { ok: true, v: await assertEdital(actor, editalId, need) };
  } catch (e) {
    return { error: e instanceof Forbidden ? e.message : "Sem acesso." };
  }
}
