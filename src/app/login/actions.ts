"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { audit, tooManyLoginFailures } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isEditaisPartner } from "@/lib/permissions";

// hash falso: gasta o mesmo tempo quando o e-mail não existe (evita descobrir quais e-mails têm conta)
const DUMMY = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function login(_: unknown, form: FormData) {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);

  if (await tooManyLoginFailures(email)) {
    return { error: "Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo." };
  }

  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = verifyPassword(password, u?.passwordHash ?? DUMMY) && !!u && u.active;
  if (!ok) {
    await audit(null, "login_falhou", `Tentativa de login sem sucesso (${email || "sem e-mail"})`, { entity: "usuario", entityId: email });
    return { error: "E-mail ou senha incorretos." };
  }

  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  await audit({ id: u.id, name: u.name }, "login", "Entrou no sistema", { entity: "usuario", entityId: u.id });
  await createSession(u.id, u.sessionVersion);
  redirect(u.mustChangePassword ? "/primeiro-acesso" : isEditaisPartner(u) ? "/editais" : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Troca da senha provisória no primeiro acesso. */
export async function setFirstPassword(_: unknown, form: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const next = String(form.get("next") || "");
  const confirm = String(form.get("confirm") || "");
  if (next.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (next !== confirm) return { error: "As duas senhas não são iguais." };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (verifyPassword(next, u.passwordHash)) return { error: "Escolha uma senha diferente da provisória." };
  const version = u.sessionVersion + 1;
  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(next), mustChangePassword: false, sessionVersion: version })
    .where(eq(schema.users.id, user.id));
  await audit({ id: user.id, name: user.name }, "senha_trocada", "Trocou a senha provisória no primeiro acesso", { entity: "usuario", entityId: user.id });
  await createSession(user.id, version);
  redirect(isEditaisPartner(user) ? "/editais" : "/");
}
