/**
 * Lançamentos de exemplo espalhados por ~11 meses, para o painel financeiro ter o que mostrar.
 * Todos levam "[exemplo]" nas observações → "Ajustes → Remover exemplos" apaga.
 *   npm run db:demo-fin
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const mark = "[exemplo]";

async function main() {
  const done = await sql`select count(*)::int as n from transactions where notes like ${"%" + mark + "%"} and description like 'Parcela%'`;
  if (done[0].n > 0) {
    console.log("· lançamentos de exemplo do painel já existem");
    process.exit(0);
  }

  const deals = await sql`select id, title, contact_id from deals order by created_at`;
  const today = new Date();
  const ym = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const day = (offset: number, d: number) => {
    const m = ym(offset);
    return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), Math.min(d, 28))).toISOString().slice(0, 10);
  };
  const isPast = (offset: number, d: number) => day(offset, d) < today.toISOString().slice(0, 10);

  type Tx = { kind: "receita" | "despesa"; description: string; category: string; cents: number; offset: number; d: number; deal?: number };
  const tx: Tx[] = [];
  // receitas: parcelas de obras (ligadas aos negócios), de 5 meses atrás a 5 à frente
  const plan = [
    { deal: 0, desc: "Parcela restauro do retábulo", cat: "Restauro", base: 3100000, from: -4, n: 6 },
    { deal: 1, desc: "Parcela projeto — Casarão Prado", cat: "Projeto", base: 1600000, from: -2, n: 4 },
    { deal: 3, desc: "Parcela laudo de fachada", cat: "Laudo / diagnóstico", base: 950000, from: -1, n: 3 },
    { deal: 5, desc: "Parcela restauro de tela", cat: "Restauro", base: 825000, from: -5, n: 2 },
  ];
  for (const p of plan) for (let i = 0; i < p.n; i++) tx.push({ kind: "receita", description: `${p.desc} (${i + 1}/${p.n})`, category: p.cat, cents: p.base + (i % 2) * 120000, offset: p.from + i, d: 10 + i, deal: p.deal });
  for (let o = -5; o <= 4; o += 2) tx.push({ kind: "receita", description: "Consultoria — aprovação em órgão de patrimônio", category: "Consultoria", cents: 480000 + (o + 5) * 20000, offset: o, d: 18 });
  // despesas fixas e variáveis
  for (let o = -5; o <= 5; o++) {
    tx.push({ kind: "despesa", description: "Aluguel do ateliê", category: "Aluguel / escritório", cents: 420000, offset: o, d: 5 });
    tx.push({ kind: "despesa", description: "Software e ferramentas", category: "Software / ferramentas", cents: 38000 + (o % 3) * 4000, offset: o, d: 8 });
    tx.push({ kind: "despesa", description: "Pró-labore", category: "Pró-labore", cents: 900000, offset: o, d: 28 });
    tx.push({ kind: "despesa", description: "Materiais de restauro (pigmentos, vernizes)", category: "Materiais", cents: 210000 + ((o + 7) % 4) * 90000, offset: o, d: 14 });
    if (o % 2 === 0) tx.push({ kind: "despesa", description: "Equipe terceirizada — andaime e mão de obra", category: "Mão de obra / terceiros", cents: 640000 + ((o + 6) % 3) * 150000, offset: o, d: 20 });
    if (o % 3 === 0) tx.push({ kind: "despesa", description: "Deslocamento e hospedagem em obra", category: "Deslocamento", cents: 130000, offset: o, d: 22 });
    tx.push({ kind: "despesa", description: "Impostos", category: "Impostos", cents: 175000 + ((o + 5) % 3) * 25000, offset: o, d: 15 });
  }

  let n = 0;
  for (const t of tx) {
    const dealRow = t.deal !== undefined ? deals[t.deal] : undefined;
    const dueDate = day(t.offset, t.d);
    // o que já venceu está pago (com ~1 em cada 9 em atraso, para o painel ter o que mostrar)
    const overdue = (n % 9 === 4 && isPast(t.offset, t.d) && t.offset >= -1) || t.offset > 0 || !isPast(t.offset, t.d);
    const paidAt = overdue ? null : day(t.offset, Math.min(28, t.d + 1));
    await sql`insert into transactions (kind, description, category, amount_cents, due_date, paid_at, deal_id, contact_id, notes)
      values (${t.kind}, ${t.description}, ${t.category}, ${t.cents}, ${dueDate}, ${paidAt}, ${dealRow?.id ?? null}, ${dealRow?.contact_id ?? null}, ${mark})`;
    n++;
  }
  console.log(`✓ ${n} lançamentos de exemplo criados`);

}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
