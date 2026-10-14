/**
 * Seed idempotente: etapas do funil + usuário admin inicial.
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
 * Sem ADMIN_PASSWORD, gera uma senha aleatória e imprime UMA vez.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { hashPassword, randomToken } from "../src/lib/password";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

const STAGES: { name: string; color: string; kind: schema.StageKind }[] = [
  { name: "Novo lead", color: "#9a948f", kind: "aberto" },
  { name: "Qualificação", color: "#537179", kind: "aberto" },
  { name: "Visita técnica", color: "#776157", kind: "aberto" },
  { name: "Proposta enviada", color: "#b75928", kind: "aberto" },
  { name: "Negociação", color: "#002934", kind: "aberto" },
  { name: "Fechado", color: "#2f6b4f", kind: "ganho" },
  { name: "Perdido", color: "#c0392b", kind: "perdido" },
];

async function main() {
  const existing = await db.select().from(schema.stages);
  if (existing.length === 0) {
    await db.insert(schema.stages).values(STAGES.map((s, i) => ({ ...s, position: i })));
    console.log(`✓ ${STAGES.length} etapas criadas`);
  } else console.log(`· etapas já existem (${existing.length})`);

  const email = (process.env.ADMIN_EMAIL || "ojhonatanribeiroalves@gmail.com").toLowerCase();
  const [found] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (found) {
    console.log(`· admin ${email} já existe`);
    return;
  }
  const password = process.env.ADMIN_PASSWORD || randomToken(9);
  await db.insert(schema.users).values({
    name: process.env.ADMIN_NAME || "Jhonatan",
    email,
    passwordHash: hashPassword(password),
    role: "admin",
    title: "Tecnologia",
    calendarToken: randomToken(),
  });
  console.log(`✓ admin criado: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    // Não vai pro terminal/log: fica num arquivo local fora do git.
    mkdirSync(".cache", { recursive: true });
    writeFileSync(".cache/acesso-inicial.txt", `${email}\n${password}\n(troque a senha em Ajustes e apague este arquivo)\n`);
    console.log("  senha provisória salva em .cache/acesso-inicial.txt");
  }
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
