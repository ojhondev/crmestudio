import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageBody, PageHeader } from "@/components/page-header";
import { MemberList, NewMemberButton } from "./members";

export const metadata: Metadata = { title: "Equipe e parceiros" };

export default async function TeamPage() {
  const me = await requireUser(["admin"]);
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      title: schema.users.title,
      phone: schema.users.phone,
      active: schema.users.active,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.role), asc(schema.users.name));

  return (
    <>
      <PageHeader
        eyebrow="Acessos"
        title="Equipe e parceiros"
        description="Quem entra no app e o que cada um vê."
        actions={<NewMemberButton />}
      />
      <PageBody className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Administrador", "Acesso total, inclusive contas, ajustes e integrações."],
            ["Equipe", "CRM, atendimento, agenda e financeiro. Não gerencia contas."],
            ["Parceiro comercial", "Só os negócios em que está indicado e a própria agenda."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border bg-muted/30 p-4">
              <p className="text-[13px] font-medium">{t}</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
        <MemberList users={users} meId={me.id} />
      </PageBody>
    </>
  );
}
