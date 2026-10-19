/** Cópia do schema do banco do SITE público (projeto estudiorestaura). Não misturar com o schema do CRM; nunca rodar db:push nele. */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull().default("Restauro"),
  location: text("location").notNull().default(""),
  year: text("year").notNull().default(""),
  area: text("area").notNull().default(""),
  summary: text("summary").notNull().default(""),
  /** paragraphs, one per line */
  body: text("body").notNull().default(""),
  coverUrl: text("cover_url"),
  /** JSON array of image URLs */
  gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
  published: boolean("published").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  /** markdown-ish body, paragraphs per blank line */
  body: text("body").notNull().default(""),
  coverUrl: text("cover_url"),
  tag: text("tag").notNull().default("Editorial"),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  area: text("area").notNull().default(""),
  type: text("type").notNull().default("Efetivo"),
  location: text("location").notNull().default("São Paulo · SP"),
  /** description, paragraphs per blank line */
  body: text("body").notNull().default(""),
  /** JSON array of requirement bullets */
  requirements: jsonb("requirements").$type<string[]>().notNull().default([]),
  published: boolean("published").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Editable site content — one row per key, value is free-form JSON. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Uploaded media (Vercel Blob). */
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  pathname: text("pathname").notNull(),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
