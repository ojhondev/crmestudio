import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as siteSchema from "./site-schema";

const url = process.env.SITE_DATABASE_URL;
if (!url) throw new Error("SITE_DATABASE_URL não configurada (connection string do Neon do site público).");

/** Cliente SEPARADO do banco do site público (mesmas tabelas do /admin do site). */
export const siteDb = drizzle(neon(url), { schema: siteSchema });
export { siteSchema };
