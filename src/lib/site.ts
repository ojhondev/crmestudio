import "server-only";
import crypto from "node:crypto";
import { asc, desc, eq, ne, and } from "drizzle-orm";
import { siteDb, siteSchema } from "@/lib/site-db";

/** Endereço público do site (prévia, "ver no site" e revalidação). */
export const SITE_URL = (process.env.SITE_URL || "https://estudiorestaura.com.br").replace(/\/$/, "");

/** Imagens padrão do site vêm como "/fotos/05.jpg" (relativas ao site): resolve para prévia no CRM. */
export const absUrl = (u: string | null | undefined) => (!u ? "" : u.startsWith("/") ? `${SITE_URL}${u}` : u);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Pede ao site para renovar o cache das páginas estáticas (home etc.). Nunca derruba a operação. */
export async function revalidateSite() {
  const secret = process.env.SITE_REVALIDATE_SECRET;
  if (!secret) return false;
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const newId = () => crypto.randomUUID();

/* ---------------------------- configurações do site ---------------------------- */

export const settingDefaults: Record<string, Record<string, string>> = {
  "home.hero": {
    intro:
      "Escritório especializado em arquitetura, conservação e restauro de patrimônio histórico e cultural. Intervenção mínima, reversibilidade e documentação rigorosa de cada etapa.",
    imageUrl: "",
  },
  "home.statement": {
    text: "Somos um time de arquitetos, conservadores e restauradores com um interesse em comum: devolver vida a edifícios e acervos sem apagar as camadas do tempo. Cada projeto começa por uma leitura atenta do que já existe.",
  },
  "home.mediaBand": {
    videoUrl: "/midia-720.mp4",
    posterUrl: "/midia-poster.jpg",
    title: "O Estúdio Restaura na mídia",
    caption: "Participação na RedeVida com o Padre Juarez para abordar o projeto de restauro do painel de Luiz Sacilotto.",
  },
  "careers.intro": {
    text: "O Estúdio Restaura cresce devagar e por afinidade. Se o patrimônio te move e você trabalha com rigor e cuidado, queremos te conhecer — mesmo que não haja uma vaga aberta agora.",
  },
  sections: {},
};

export type FieldDef = { name: string; label: string; type?: "text" | "area" | "image"; hint?: string };
export const SETTING_GROUPS: { key: string; title: string; desc: string; fields: FieldDef[] }[] = [
  {
    key: "home.hero",
    title: "Início — abertura",
    desc: "Texto e imagem da primeira dobra da home.",
    fields: [
      { name: "intro", label: "Texto de introdução", type: "area" },
      { name: "imageUrl", label: "Imagem de fundo", type: "image" },
    ],
  },
  {
    key: "home.statement",
    title: "Início — manifesto",
    desc: "Parágrafo grande logo abaixo da abertura.",
    fields: [{ name: "text", label: "Texto", type: "area" }],
  },
  {
    key: "home.mediaBand",
    title: "Início — faixa de vídeo",
    desc: "Vídeo em reprodução automática e a chamada exibida ao passar o mouse.",
    fields: [
      { name: "videoUrl", label: "Vídeo (URL .mp4)", hint: "Cole a URL de um .mp4 (do Vercel Blob, YouTube não serve). Vídeos não passam por upload aqui." },
      { name: "posterUrl", label: "Imagem de pôster", type: "image" },
      { name: "title", label: "Título do hover" },
      { name: "caption", label: "Chamada do hover", type: "area" },
    ],
  },
  {
    key: "careers.intro",
    title: "Trabalhe conosco — introdução",
    desc: "Texto de abertura da página de vagas.",
    fields: [{ name: "text", label: "Texto", type: "area" }],
  },
];

/** Slots de imagem por seção (mesmos do /admin/secoes do site). */
export const SECTION_SLOTS: { key: string; group: string; label: string }[] = [
  { key: "home.conhecaProjetos", group: "Início", label: "Card “Conheça os projetos”" },
  { key: "home.quemPorTras", group: "Início", label: "Card “Quem está por trás”" },
  { key: "whatwedo.01", group: "O que fazemos", label: "Investigar" },
  { key: "whatwedo.02", group: "O que fazemos", label: "Intervir" },
  { key: "whatwedo.03", group: "O que fazemos", label: "Preservar" },
  { key: "criteria.0", group: "O que buscamos", label: "Valor histórico e artístico" },
  { key: "criteria.1", group: "O que buscamos", label: "Camadas do tempo legíveis" },
  { key: "criteria.2", group: "O que buscamos", label: "Uso que dá futuro" },
  { key: "criteria.3", group: "O que buscamos", label: "Parceria de longo prazo" },
  { key: "brazil.SP", group: "Mapa do Brasil", label: "São Paulo" },
  { key: "brazil.MG", group: "Mapa do Brasil", label: "Minas Gerais" },
  { key: "brazil.GO", group: "Mapa do Brasil", label: "Goiás" },
  { key: "pagehero.projetos", group: "Topo das páginas", label: "Projetos" },
  { key: "pagehero.blog", group: "Topo das páginas", label: "Blog" },
  { key: "pagehero.sobre", group: "Topo das páginas", label: "Sobre o Estúdio" },
  { key: "pagehero.servicos", group: "Topo das páginas", label: "Serviços" },
  { key: "pagehero.contato", group: "Topo das páginas", label: "Contato" },
  { key: "pagehero.trabalhe", group: "Topo das páginas", label: "Trabalhe conosco" },
];

export const SETTING_KEYS = new Set([...SETTING_GROUPS.map((g) => g.key), "sections"]);

export async function getSetting(key: string): Promise<Record<string, string>> {
  const fallback = settingDefaults[key] ?? {};
  const [row] = await siteDb.select().from(siteSchema.settings).where(eq(siteSchema.settings.key, key)).limit(1);
  return row ? { ...fallback, ...(row.value as Record<string, string>) } : fallback;
}

/* ---------------------------------- consultas --------------------------------- */

export const listProjects = () => siteDb.select().from(siteSchema.projects).orderBy(asc(siteSchema.projects.sort), desc(siteSchema.projects.createdAt));
export const listPosts = () => siteDb.select().from(siteSchema.posts).orderBy(desc(siteSchema.posts.publishedAt));
export const listJobs = () => siteDb.select().from(siteSchema.jobs).orderBy(asc(siteSchema.jobs.sort), desc(siteSchema.jobs.createdAt));
export const listMedia = () => siteDb.select().from(siteSchema.media).orderBy(desc(siteSchema.media.createdAt)).limit(300);

export async function getProjectRow(id: number) {
  const [r] = await siteDb.select().from(siteSchema.projects).where(eq(siteSchema.projects.id, id)).limit(1);
  return r ?? null;
}
export async function getPostRow(id: number) {
  const [r] = await siteDb.select().from(siteSchema.posts).where(eq(siteSchema.posts.id, id)).limit(1);
  return r ?? null;
}
export async function getJobRow(id: number) {
  const [r] = await siteDb.select().from(siteSchema.jobs).where(eq(siteSchema.jobs.id, id)).limit(1);
  return r ?? null;
}

/** Gera um slug que não colide com outro registro da mesma tabela. */
export async function uniqueSlug(table: "projects" | "posts" | "jobs", wanted: string, selfId?: number) {
  const t = siteSchema[table];
  const base = slugify(wanted) || "item";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await siteDb
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.slug, candidate), selfId ? ne(t.id, selfId) : undefined))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${Date.now()}`;
}
