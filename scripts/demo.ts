/**
 * Dados de demonstração (origem "exemplo") — removíveis em Ajustes → Dados de exemplo.
 *   npm run db:demo
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const DAY = 864e5;
const at = (days: number, hour = 10, min = 0) => {
  const d = new Date(Date.now() + days * DAY);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return new Date(`${iso}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-03:00`);
};
const date = (days: number) => at(days).toISOString().slice(0, 10);

async function main() {
  const [exists] = await db.select().from(schema.contacts).where(eq(schema.contacts.source, "exemplo")).limit(1);
  if (exists) return console.log("· dados de exemplo já existem");
  const stages = await db.select().from(schema.stages).orderBy(asc(schema.stages.position));
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, "admin")).limit(1);
  const S = (name: string) => stages.find((s) => s.name === name)?.id ?? stages[0].id;

  const people = [
    { name: "Pe. Antônio Ribeiro", role: "Pároco", company: "Paróquia N. Sra. da Candelária", city: "Itu", state: "SP", phone: "5511990000001", email: "pe.antonio@exemplo.com" },
    { name: "Marina Costa", role: "Arquiteta", company: "Construtora Horizonte", city: "Belo Horizonte", state: "MG", phone: "5531990000002", email: "marina@exemplo.com" },
    { name: "Irmã Lúcia", role: "Ecônoma", company: "Mosteiro de São Bento", city: "Sorocaba", state: "SP", phone: "5515990000003", email: "irma.lucia@exemplo.com" },
    { name: "Dr. Henrique Prado", role: "Proprietário", company: "Casarão Prado (tombado)", city: "Goiás", state: "GO", phone: "5562990000004", email: "henrique@exemplo.com" },
    { name: "Carla Mendes", role: "Secretária de Cultura", company: "Prefeitura de Tiradentes", city: "Tiradentes", state: "MG", phone: "5532990000005", email: "cultura@exemplo.com" },
    { name: "Roberto Lima", role: "Colecionador", company: null, city: "São Paulo", state: "SP", phone: "5511990000006", email: "roberto@exemplo.com" },
  ];
  const contacts = await db
    .insert(schema.contacts)
    .values(people.map((p) => ({ ...p, source: "exemplo", ownerId: admin?.id, tags: ["exemplo"] })))
    .returning();
  const C = (i: number) => contacts[i].id;

  const deals = await db
    .insert(schema.deals)
    .values([
      { title: "Restauro do forro pintado — Matriz de Itu", contactId: C(0), stageId: S("Proposta enviada"), valueCents: 18500000, service: "Restauro", property: "Pintura mural / forro", location: "Itu/SP", ownerId: admin?.id, position: 1, expectedClose: date(20) },
      { title: "Laudo de fachada — Edifício Horizonte", contactId: C(1), stageId: S("Qualificação"), valueCents: 2800000, service: "Diagnóstico / laudo técnico", property: "Edifício institucional", location: "Belo Horizonte/MG", ownerId: admin?.id, position: 1 },
      { title: "Conservação do retábulo-mor", contactId: C(2), stageId: S("Visita técnica"), valueCents: 9200000, service: "Conservação preventiva", property: "Retábulo / talha", location: "Sorocaba/SP", ownerId: admin?.id, position: 1, expectedClose: date(35) },
      { title: "Projeto de restauro — Casarão Prado", contactId: C(3), stageId: S("Negociação"), valueCents: 6400000, service: "Projeto de arquitetura", property: "Casarão", location: "Goiás/GO", ownerId: admin?.id, position: 1, expectedClose: date(7) },
      { title: "Aprovação IPHAN — Igreja do Rosário", contactId: C(4), stageId: S("Novo lead"), valueCents: 0, service: "Consultoria / aprovação em órgão de patrimônio", property: "Igreja / capela", location: "Tiradentes/MG", ownerId: admin?.id, position: 1 },
      { title: "Restauro de tela séc. XIX", contactId: C(5), stageId: S("Fechado"), valueCents: 1650000, service: "Restauro de obra de arte", property: "Pintura / tela", location: "São Paulo/SP", ownerId: admin?.id, position: 1, closedAt: at(-3) },
    ])
    .returning();

  await db.insert(schema.activities).values([
    { dealId: deals[0].id, contactId: C(0), userId: admin?.id, type: "visita", body: "Visita técnica feita. Forro com perda de camada pictórica em ~30% da área, infiltração na lateral norte.", createdAt: at(-12) },
    { dealId: deals[0].id, contactId: C(0), userId: admin?.id, type: "email", body: "Proposta enviada por e-mail (R$ 185 mil, 8 meses).", createdAt: at(-5) },
    { dealId: deals[3].id, contactId: C(3), userId: admin?.id, type: "ligacao", body: "Cliente pediu parcelamento em 4x. Ver com o financeiro.", createdAt: at(-1) },
  ]);

  await db.insert(schema.tasks).values([
    { title: "Cobrar retorno da proposta do forro", dealId: deals[0].id, contactId: C(0), assigneeId: admin?.id, dueAt: at(1, 10) },
    { title: "Enviar cronograma de visita ao mosteiro", dealId: deals[2].id, contactId: C(2), assigneeId: admin?.id, dueAt: at(0, 17) },
  ]);

  await db.insert(schema.events).values([
    { title: "Visita técnica — Mosteiro de São Bento", type: "visita", startsAt: at(2, 9), endsAt: at(2, 12), location: "Sorocaba/SP", dealId: deals[2].id, contactId: C(2), userId: admin?.id, description: "[exemplo]" },
    { title: "Reunião — Casarão Prado", type: "reuniao", startsAt: at(4, 15), endsAt: at(4, 16), location: "Google Meet", dealId: deals[3].id, contactId: C(3), userId: admin?.id, description: "[exemplo]" },
    { title: "Entrega da tela restaurada", type: "prazo", startsAt: at(6, 10), endsAt: at(6, 11), dealId: deals[5].id, contactId: C(5), userId: admin?.id, description: "[exemplo]" },
  ]);

  await db.insert(schema.transactions).values([
    { kind: "receita", description: "Restauro de tela — sinal (1/2)", category: "Sinal / entrada", amountCents: 825000, dueDate: date(-3), paidAt: date(-3), dealId: deals[5].id, contactId: C(5), notes: "[exemplo]" },
    { kind: "receita", description: "Restauro de tela — saldo (2/2)", category: "Restauro", amountCents: 825000, dueDate: date(6), dealId: deals[5].id, contactId: C(5), notes: "[exemplo]" },
    { kind: "despesa", description: "Pigmentos e vernizes", category: "Materiais", amountCents: 132000, dueDate: date(-6), paidAt: date(-6), notes: "[exemplo]" },
    { kind: "despesa", description: "Andaime — locação mensal", category: "Mão de obra / terceiros", amountCents: 240000, dueDate: date(4), notes: "[exemplo]" },
  ]);

  const convs = [
    {
      i: 0,
      msgs: [
        ["in", "Boa tarde! Recebi a proposta do forro, obrigado.", -2 * 24 - 3],
        ["out", "Boa tarde, Padre! Que bom. Ficou alguma dúvida sobre o cronograma ou os valores?", -2 * 24 - 2],
        ["in", "O conselho econômico achou o valor alto. Seria possível fazer em etapas, começando pela parte mais danificada?", -3],
        ["in", "E vocês conseguem ajudar com a captação pela Lei Rouanet?", -2.8],
      ],
    },
    {
      i: 2,
      msgs: [
        ["in", "Olá, aqui é a Irmã Lúcia do mosteiro. Podemos confirmar a visita para quinta às 9h?", -1],
      ],
    },
  ] as const;
  for (const c of convs) {
    const last = c.msgs[c.msgs.length - 1];
    const lastIn = [...c.msgs].reverse().find((m) => m[0] === "in")!;
    const [conv] = await db
      .insert(schema.conversations)
      .values({
        phone: contacts[c.i].phone!,
        profileName: contacts[c.i].name,
        contactId: contacts[c.i].id,
        unread: c.msgs.filter((m) => m[0] === "in").length > 1 ? 2 : 1,
        lastMessageAt: new Date(Date.now() + last[2] * 36e5),
        lastInboundAt: new Date(Date.now() + lastIn[2] * 36e5),
        preview: last[1],
      })
      .returning();
    await db.insert(schema.messages).values(
      c.msgs.map(([direction, body, h]) => ({
        conversationId: conv.id,
        direction,
        body,
        status: direction === "out" ? "read" : "received",
        authorId: direction === "out" ? admin?.id : null,
        createdAt: new Date(Date.now() + h * 36e5),
      })),
    );
  }
  console.log(`✓ ${contacts.length} contatos, ${deals.length} negócios, 2 conversas, 3 eventos, 4 lançamentos de exemplo`);
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
