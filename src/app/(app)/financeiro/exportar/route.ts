import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rowsToCsv, type CsvFormat, type SheetRow } from "@/lib/csv";
import { addMonths, getSheetRows } from "@/lib/finance";
import { todayISO } from "@/lib/format";

/**
 * GET /financeiro/exportar?formato=br|us&m=AAAA-MM | v=abertos | v=todos | modelo=1
 * br = Excel (Brasil): ";" e vírgula decimal, datas dd/mm/aaaa · us = Google Sheets/internacional: "," e ponto, datas aaaa-mm-dd.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || user.mustChangePassword || !has(user, "financeiro", "view")) return new Response("Sem acesso", { status: 403 });

  const url = new URL(req.url);
  const format: CsvFormat = url.searchParams.get("formato") === "us" ? "us" : "br";
  const month = url.searchParams.get("m") ?? "";
  const v = url.searchParams.get("v");
  const template = url.searchParams.get("modelo") === "1";

  let rows: SheetRow[];
  let name: string;
  if (template) {
    const d = todayISO();
    rows = [
      { due: d, kind: "receita", description: "Sinal — restauro do forro", category: "Sinal / entrada", amountCents: 1500000, paidAt: d, contact: "Pe. Antônio Ribeiro", deal: "Restauro do forro pintado — Matriz de Itu", notes: "Exemplo: apague estas linhas" },
      { due: d, kind: "despesa", description: "Pigmentos e vernizes", category: "Materiais", amountCents: 132050, paidAt: "", contact: "", deal: "", notes: "" },
    ];
    name = "modelo-lancamentos";
  } else if (/^\d{4}-\d{2}$/.test(month)) {
    rows = await getSheetRows({ from: `${month}-01`, to: `${addMonths(month, 1)}-01` });
    name = `lancamentos-${month}`;
  } else if (v === "abertos") {
    rows = await getSheetRows({ onlyOpen: true });
    name = "lancamentos-em-aberto";
  } else {
    rows = await getSheetRows({});
    name = "lancamentos-todos";
  }

  if (!template) await audit(user, "financeiro_exportado", `Exportou ${rows.length} lançamento(s) em CSV (${name}, ${format === "br" ? "Excel Brasil" : "internacional"})`, { entity: "lancamento", meta: { count: rows.length } });

  return new Response(rowsToCsv(rows, format), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${format}.csv"`,
      "cache-control": "no-store",
    },
  });
}
