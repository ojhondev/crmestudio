/**
 * Testes das bibliotecas de documentos (extenso, variáveis, sanitização). Sem banco, sem rede.
 *   npm run test:docs
 */
import { reaisPorExtenso } from "../src/lib/docs/extenso";
import { dataPorExtenso, findFieldNames, findVars, missingVars, resolveText, valueMap } from "../src/lib/docs/variables";
import { cleanHtml } from "../src/lib/docs/sanitize";
import { BUILTIN_CLAUSES, BUILTIN_CONTRACTS, defaultDeck } from "../src/lib/docs/templates";
import { EMPTY_STUDIO } from "../src/lib/docs/types";

let fail = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};

for (const [c, e] of [
  [0, "zero reais"],
  [100, "um real"],
  [150000, "mil e quinhentos reais"],
  [1250, "doze reais e cinquenta centavos"],
  [1, "um centavo"],
  [10000, "cem reais"],
  [10100, "cento e um reais"],
  [200000, "dois mil reais"],
  [100000, "mil reais"],
  [123456, "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"],
  [2500000, "vinte e cinco mil reais"],
  [100000000, "um milhão de reais"],
  [250000000, "dois milhões e quinhentos mil reais"],
  [1100000, "onze mil reais"],
  [1000100, "dez mil e um reais"],
] as [number, string][]) eq(reaisPorExtenso(c), e, `extenso ${c}`);

// variáveis
eq(dataPorExtenso("2026-10-05"), "5 de outubro de 2026", "data por extenso");
eq(findVars("a {{cliente.nome}} e {{ negocio.valor }} {{cliente.nome}} {{x}}"), ["cliente.nome", "negocio.valor"], "findVars");
eq(findFieldNames("{{campo.prazo}} {{cliente.nome}}"), ["prazo"], "campos");
const map = valueMap({
  studio: { ...EMPTY_STUDIO, name: "Estúdio X" },
  contact: { name: "Ana <b>", document: "123" },
  deal: { title: "Obra", valueCents: 150000 },
  doc: { number: "CT-1", title: "T" },
  fields: { prazo: "90 dias" },
  today: "2026-10-05",
});
eq(map["negocio.valor_extenso"], "mil e quinhentos reais", "valor por extenso no mapa");
eq(map["campo.prazo"], "90 dias", "campo no mapa");
eq(missingVars("{{cliente.nome}} {{cliente.endereco}} {{campo.prazo}}", map), ["cliente.endereco"], "faltantes");
eq(resolveText("Oi {{cliente.nome}}", map, { html: true }), "Oi Ana &lt;b&gt;", "valor escapado em HTML");
eq(resolveText("{{cliente.endereco}}", map, { html: true }), '<mark class="doc-missing">[cliente.endereco]</mark>', "lacuna destacada");
eq(resolveText("{{cliente.endereco}}", map), "[cliente.endereco]", "lacuna em texto");

// sanitização
const dirty = '<p style="color:red;text-align:center" onclick="x()">oi<script>alert(1)</script><a href="javascript:alert(1)">l</a><span data-var="cliente.nome" onmouseover="y()">{{cliente.nome}}</span><img src=x onerror=z()></p>';
const clean = cleanHtml(dirty);
eq(/script|onclick|onmouseover|onerror|javascript:|<img|color:red/.test(clean), false, "sanitização remove o perigoso: " + clean);
eq(clean.includes('data-var="cliente.nome"') && clean.includes("text-align:center"), true, "sanitização mantém variável e alinhamento");

// modelos do sistema: toda variável usada existe no catálogo ou é campo.*
import { VARIABLES } from "../src/lib/docs/variables";
const known = new Set<string>(VARIABLES.map((v) => v.key));
for (const t of [...BUILTIN_CONTRACTS.map((c) => c.html), ...BUILTIN_CLAUSES.map((c) => c.html), JSON.stringify(defaultDeck())]) {
  for (const k of findVars(t)) if (!k.startsWith("campo.") && !known.has(k)) eq(k, "variável conhecida", "variável desconhecida em modelo");
}
eq(defaultDeck().slides.length, 7, "proposta padrão tem 7 slides");

console.log(fail ? `${fail} falha(s)` : "docs: todos os testes passaram");
process.exit(fail ? 1 : 0);
