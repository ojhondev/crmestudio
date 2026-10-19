"use server";

import { desc, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { siteDb, siteSchema } from "@/lib/site-db";
import { SETTING_KEYS, revalidateSite, uniqueSlug } from "@/lib/site";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const str = (v: unknown, max = 20000) => (typeof v === "string" ? v.slice(0, max) : "");
const urlOrEmpty = (v: unknown) => {
  const s = str(v, 2000).trim();
  return s && (/^https?:\/\//i.test(s) || s.startsWith("/")) ? s : "";
};
const list = (v: unknown, max = 60) => (Array.isArray(v) ? v.map((x) => str(x, 600).trim()).filter(Boolean).slice(0, max) : []);

/** Normaliza o texto do editor: parágrafos separados por linha em branco. */
const body = (v: unknown) =>
  str(v, 120000)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/* ---------------------------------- projetos --------------------------------- */

export type ProjectInput = {
  id?: number;
  title: string;
  slug: string;
  category: string;
  location: string;
  year: string;
  area: string;
  summary: string;
  body: string;
  coverUrl: string;
  gallery: string[];
  published: boolean;
  featured: boolean;
  sort: number;
};

export async function saveProject(input: ProjectInput): Promise<Result<{ id: number }>> {
  const user = await requireAccess("site", "edit");
  const title = str(input.title, 200).trim();
  if (!title) return { ok: false, error: "Informe o título do projeto." };
  const id = Number(input.id) || 0;
  const data = {
    title,
    slug: await uniqueSlug("projects", str(input.slug, 120).trim() || title, id || undefined),
    category: str(input.category, 80).trim() || "Restauro",
    location: str(input.location, 160).trim(),
    year: str(input.year, 20).trim(),
    area: str(input.area, 40).trim(),
    summary: str(input.summary, 1200).trim(),
    body: body(input.body),
    coverUrl: urlOrEmpty(input.coverUrl) || null,
    gallery: list(input.gallery).filter((u) => urlOrEmpty(u)),
    published: !!input.published,
    featured: !!input.featured,
    sort: Math.trunc(Number(input.sort)) || 0,
    updatedAt: new Date(),
  };
  let rid = id;
  if (id) {
    await siteDb.update(siteSchema.projects).set(data).where(eq(siteSchema.projects.id, id));
  } else {
    const [r] = await siteDb.insert(siteSchema.projects).values(data).returning({ id: siteSchema.projects.id });
    rid = r.id;
  }
  await audit(user, id ? "site_projeto_editado" : "site_projeto_criado", `${id ? "Editou" : "Criou"} o projeto “${title}” do site${data.published ? "" : " (rascunho)"}`, { entity: "site_projeto", entityId: String(rid) });
  await revalidateSite();
  return { ok: true, id: rid };
}

export async function deleteProject(id: number): Promise<Result> {
  const user = await requireAccess("site", "manage");
  const [row] = await siteDb.select({ title: siteSchema.projects.title }).from(siteSchema.projects).where(eq(siteSchema.projects.id, id)).limit(1);
  if (!row) return { ok: false, error: "Projeto não encontrado." };
  await siteDb.delete(siteSchema.projects).where(eq(siteSchema.projects.id, id));
  await audit(user, "site_projeto_excluido", `Excluiu o projeto “${row.title}” do site`, { entity: "site_projeto", entityId: String(id) });
  await revalidateSite();
  return { ok: true };
}

/** Publica/despublica ou destaca direto da lista. */
export async function toggleProject(id: number, field: "published" | "featured", value: boolean): Promise<Result> {
  const user = await requireAccess("site", "edit");
  if (field !== "published" && field !== "featured") return { ok: false, error: "Campo inválido." };
  const [row] = await siteDb.update(siteSchema.projects).set({ [field]: value, updatedAt: new Date() }).where(eq(siteSchema.projects.id, id)).returning({ title: siteSchema.projects.title });
  if (!row) return { ok: false, error: "Projeto não encontrado." };
  await audit(user, "site_projeto_editado", `${field === "published" ? (value ? "Publicou" : "Despublicou") : value ? "Destacou" : "Tirou o destaque de"} o projeto “${row.title}”`, { entity: "site_projeto", entityId: String(id) });
  await revalidateSite();
  return { ok: true };
}

/** Reordena os projetos (a ordem do site é o campo `sort`). */
export async function reorderProjects(ids: number[]): Promise<Result> {
  const user = await requireAccess("site", "edit");
  const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  for (let i = 0; i < clean.length; i++) {
    await siteDb.update(siteSchema.projects).set({ sort: i, updatedAt: new Date() }).where(eq(siteSchema.projects.id, clean[i]));
  }
  await audit(user, "site_projeto_editado", "Reordenou os projetos do site", { entity: "site_projeto" });
  await revalidateSite();
  return { ok: true };
}

/* ------------------------------------ blog ----------------------------------- */

export type PostInput = {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverUrl: string;
  tag: string;
  published: boolean;
  /** AAAA-MM-DD */
  publishedAt: string;
};

export async function savePost(input: PostInput): Promise<Result<{ id: number }>> {
  const user = await requireAccess("site", "edit");
  const title = str(input.title, 200).trim();
  if (!title) return { ok: false, error: "Informe o título do artigo." };
  const id = Number(input.id) || 0;
  const when = /^\d{4}-\d{2}-\d{2}$/.test(str(input.publishedAt, 12)) ? new Date(`${input.publishedAt}T12:00:00`) : new Date();
  const data = {
    title,
    slug: await uniqueSlug("posts", str(input.slug, 120).trim() || title, id || undefined),
    excerpt: str(input.excerpt, 1200).trim(),
    body: body(input.body),
    coverUrl: urlOrEmpty(input.coverUrl) || null,
    tag: str(input.tag, 60).trim() || "Editorial",
    published: !!input.published,
    publishedAt: when,
    updatedAt: new Date(),
  };
  let rid = id;
  if (id) {
    await siteDb.update(siteSchema.posts).set(data).where(eq(siteSchema.posts.id, id));
  } else {
    const [r] = await siteDb.insert(siteSchema.posts).values(data).returning({ id: siteSchema.posts.id });
    rid = r.id;
  }
  await audit(user, id ? "site_post_editado" : "site_post_criado", `${id ? "Editou" : "Criou"} o artigo “${title}” do blog${data.published ? "" : " (rascunho)"}`, { entity: "site_post", entityId: String(rid) });
  await revalidateSite();
  return { ok: true, id: rid };
}

export async function deletePost(id: number): Promise<Result> {
  const user = await requireAccess("site", "manage");
  const [row] = await siteDb.select({ title: siteSchema.posts.title }).from(siteSchema.posts).where(eq(siteSchema.posts.id, id)).limit(1);
  if (!row) return { ok: false, error: "Artigo não encontrado." };
  await siteDb.delete(siteSchema.posts).where(eq(siteSchema.posts.id, id));
  await audit(user, "site_post_excluido", `Excluiu o artigo “${row.title}” do blog`, { entity: "site_post", entityId: String(id) });
  await revalidateSite();
  return { ok: true };
}

export async function togglePost(id: number, value: boolean): Promise<Result> {
  const user = await requireAccess("site", "edit");
  const [row] = await siteDb.update(siteSchema.posts).set({ published: value, updatedAt: new Date() }).where(eq(siteSchema.posts.id, id)).returning({ title: siteSchema.posts.title });
  if (!row) return { ok: false, error: "Artigo não encontrado." };
  await audit(user, "site_post_editado", `${value ? "Publicou" : "Voltou para rascunho o"} artigo “${row.title}”`, { entity: "site_post", entityId: String(id) });
  await revalidateSite();
  return { ok: true };
}

/* ----------------------------------- vagas ----------------------------------- */

export type JobInput = {
  id?: number;
  title: string;
  slug: string;
  area: string;
  type: string;
  location: string;
  body: string;
  requirements: string[];
  published: boolean;
  sort: number;
};

export async function saveJob(input: JobInput): Promise<Result<{ id: number }>> {
  const user = await requireAccess("site", "edit");
  const title = str(input.title, 200).trim();
  if (!title) return { ok: false, error: "Informe o título da vaga." };
  const id = Number(input.id) || 0;
  const data = {
    title,
    slug: await uniqueSlug("jobs", str(input.slug, 120).trim() || title, id || undefined),
    area: str(input.area, 80).trim(),
    type: str(input.type, 60).trim() || "Efetivo",
    location: str(input.location, 120).trim() || "São Paulo · SP",
    body: body(input.body),
    requirements: list(input.requirements, 40),
    published: !!input.published,
    sort: Math.trunc(Number(input.sort)) || 0,
    updatedAt: new Date(),
  };
  let rid = id;
  if (id) {
    await siteDb.update(siteSchema.jobs).set(data).where(eq(siteSchema.jobs.id, id));
  } else {
    const [r] = await siteDb.insert(siteSchema.jobs).values(data).returning({ id: siteSchema.jobs.id });
    rid = r.id;
  }
  await audit(user, id ? "site_vaga_editada" : "site_vaga_criada", `${id ? "Editou" : "Criou"} a vaga “${title}”${data.published ? "" : " (rascunho)"}`, { entity: "site_vaga", entityId: String(rid) });
  await revalidateSite();
  return { ok: true, id: rid };
}

export async function deleteJob(id: number): Promise<Result> {
  const user = await requireAccess("site", "manage");
  const [row] = await siteDb.select({ title: siteSchema.jobs.title }).from(siteSchema.jobs).where(eq(siteSchema.jobs.id, id)).limit(1);
  if (!row) return { ok: false, error: "Vaga não encontrada." };
  await siteDb.delete(siteSchema.jobs).where(eq(siteSchema.jobs.id, id));
  await audit(user, "site_vaga_excluida", `Excluiu a vaga “${row.title}”`, { entity: "site_vaga", entityId: String(id) });
  await revalidateSite();
  return { ok: true };
}

export async function toggleJob(id: number, value: boolean): Promise<Result> {
  const user = await requireAccess("site", "edit");
  const [row] = await siteDb.update(siteSchema.jobs).set({ published: value, updatedAt: new Date() }).where(eq(siteSchema.jobs.id, id)).returning({ title: siteSchema.jobs.title });
  if (!row) return { ok: false, error: "Vaga não encontrada." };
  await audit(user, "site_vaga_editada", `${value ? "Publicou" : "Despublicou"} a vaga “${row.title}”`, { entity: "site_vaga", entityId: String(id) });
  await revalidateSite();
  return { ok: true };
}

/* ------------------------------ textos e imagens ------------------------------ */

/** Grava um grupo de configurações (`home.hero`, `sections`…). Chaves/valores são texto simples. */
export async function saveSetting(key: string, values: Record<string, string>): Promise<Result> {
  const user = await requireAccess("site", "edit");
  if (!SETTING_KEYS.has(key)) return { ok: false, error: "Configuração desconhecida." };
  const value: Record<string, string> = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (/^[\w.-]{1,60}$/.test(k)) value[k] = key === "sections" || k.toLowerCase().includes("url") ? urlOrEmpty(v) : str(v, 4000);
  }
  await siteDb
    .insert(siteSchema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSchema.settings.key, set: { value, updatedAt: new Date() } });
  await audit(user, "site_texto_editado", key === "sections" ? "Atualizou as imagens das seções do site" : `Atualizou os textos do site (${key})`, { entity: "site_config", entityId: key });
  await revalidateSite();
  return { ok: true };
}

/* ------------------------------------ mídia ----------------------------------- */

export async function deleteMedia(id: number): Promise<Result> {
  const user = await requireAccess("site", "manage");
  const [row] = await siteDb.select().from(siteSchema.media).where(eq(siteSchema.media.id, id)).limit(1);
  if (!row) return { ok: false, error: "Imagem não encontrada." };
  await siteDb.delete(siteSchema.media).where(eq(siteSchema.media.id, id));
  try {
    await del(row.url, { token: process.env.SITE_BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    console.error("[site] falha ao apagar do Blob", e);
  }
  await audit(user, "site_midia_excluida", `Excluiu a imagem “${row.label || row.pathname}” da biblioteca do site`, { entity: "site_midia", entityId: String(id) });
  return { ok: true };
}

export async function renameMedia(id: number, label: string): Promise<Result> {
  await requireAccess("site", "edit");
  await siteDb.update(siteSchema.media).set({ label: str(label, 120).trim() }).where(eq(siteSchema.media.id, id));
  return { ok: true };
}

/** Lista a biblioteca para o seletor de imagens. */
export async function listLibrary() {
  await requireAccess("site");
  return siteDb.select().from(siteSchema.media).orderBy(desc(siteSchema.media.createdAt)).limit(300);
}
