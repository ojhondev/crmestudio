/**
 * Testes da lógica de Tarefas (src/lib/tasks.ts). Sem banco, sem rede.
 *   npm run test:tasks
 */
import {
  addDays, addMonths, nextDue, monthGrid, weekGrid, positionBetween, dueBucket, filterTasks, sortTasks, groupTasks, timelineBar,
  cleanCustomValue, NO_FILTERS, diffDays, startOfWeek, type TaskDTO,
} from "../src/lib/tasks";
import { BOARD_TEMPLATES } from "../src/lib/task-templates";

let fail = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};

const toDay = (d: Date) => d.toISOString().slice(0, 10);
const mk = (o: Partial<TaskDTO>): TaskDTO => ({
  id: "x", title: "t", status: "a_fazer", priority: "media", assigneeId: null, dueAt: null, description: null, boardId: "b", groupId: "g1", dealId: null, dealTitle: null,
  position: 1, createdAt: "2026-10-01T00:00:00.000Z", custom: {}, subtasks: [], labels: [], links: [], recur: null, ...o,
});

// datas
eq(addDays("2026-10-30", 3), "2026-11-02", "addDays virada de mês");
eq(addMonths("2026-01-31", 1), "2026-02-28", "addMonths fim de mês");
eq(addMonths("2026-12-15", 1), "2027-01-15", "addMonths ano");
eq(nextDue("2026-10-19", "diaria"), "2026-10-20", "recorrência diária");
eq(nextDue("2026-10-19", "semanal"), "2026-10-26", "recorrência semanal");
eq(nextDue("2026-10-31", "mensal"), "2026-11-30", "recorrência mensal");
eq(diffDays("2026-10-01", "2026-10-19"), 18, "diffDays");
eq(startOfWeek("2026-10-19"), "2026-10-18", "semana começa no domingo");
eq(monthGrid("2026-10").length, 42, "grade 42 dias");
eq(monthGrid("2026-10")[0], "2026-09-27", "grade começa no domingo anterior");
eq(weekGrid("2026-10-21"), ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"], "semana");

// posição
eq(positionBetween(undefined, undefined), 1, "pos vazia");
eq(positionBetween(undefined, 5), 4, "pos início");
eq(positionBetween(5, undefined), 6, "pos fim");
eq(positionBetween(2, 4), 3, "pos meio");

// prazo
eq(dueBucket("2026-10-18", "a_fazer", "2026-10-19"), "late", "atrasada");
eq(dueBucket("2026-10-19", "a_fazer", "2026-10-19"), "today", "hoje");
eq(dueBucket("2026-10-26", "a_fazer", "2026-10-19"), "week", "semana");
eq(dueBucket("2026-10-27", "a_fazer", "2026-10-19"), "later", "depois");
eq(dueBucket(null, "a_fazer", "2026-10-19"), "none", "sem prazo");
eq(dueBucket("2026-10-01", "concluida", "2026-10-19"), "done", "concluída nunca atrasa");

// filtros
const list = [
  mk({ id: "a", title: "Laudo da igreja", priority: "alta", assigneeId: "u1", dueAt: "2026-10-18T15:00:00.000Z", labels: ["laudo"] }),
  mk({ id: "b", title: "Comprar tinta", priority: "baixa", dueAt: "2026-10-19T15:00:00.000Z" }),
  mk({ id: "c", title: "Fechar mês", priority: "alta", status: "concluida", assigneeId: "u2" }),
];
const ids = (t: TaskDTO[]) => t.map((x) => x.id);
eq(ids(filterTasks(list, { ...NO_FILTERS, q: "laudo" }, "2026-10-19", toDay)), ["a"], "busca no título");
eq(ids(filterTasks(list, { ...NO_FILTERS, label: "laudo" }, "2026-10-19", toDay)), ["a"], "etiqueta");
eq(ids(filterTasks(list, { ...NO_FILTERS, who: "none" }, "2026-10-19", toDay)), ["b"], "sem responsável");
eq(ids(filterTasks(list, { ...NO_FILTERS, who: "u2" }, "2026-10-19", toDay)), ["c"], "responsável");
eq(ids(filterTasks(list, { ...NO_FILTERS, priority: "alta" }, "2026-10-19", toDay)), ["a", "c"], "prioridade");
eq(ids(filterTasks(list, { ...NO_FILTERS, hideDone: true }, "2026-10-19", toDay)), ["a", "b"], "ocultar concluídas");
eq(ids(filterTasks(list, { ...NO_FILTERS, due: "atrasadas" }, "2026-10-19", toDay)), ["a"], "atrasadas");
eq(ids(filterTasks(list, { ...NO_FILTERS, due: "hoje" }, "2026-10-19", toDay)), ["b"], "hoje");
eq(ids(filterTasks(list, { ...NO_FILTERS, due: "sem-prazo" }, "2026-10-19", toDay)), ["c"], "sem prazo");

// ordenação
eq(ids(sortTasks(list, "prioridade")), ["a", "c", "b"], "ordenar por prioridade");
eq(ids(sortTasks(list, "prazo")), ["a", "b", "c"], "ordenar por prazo (sem prazo por último)");
eq(ids(sortTasks(list, "titulo")), ["b", "c", "a"].sort((x, y) => list.find((t) => t.id === x)!.title.localeCompare(list.find((t) => t.id === y)!.title, "pt-BR")), "ordenar por título");

// agrupamento
const ctx = { users: [{ id: "u1", name: "Ana" }, { id: "u2", name: "Bia" }], groups: [{ id: "g1", name: "G1", color: "#000" }, { id: "g2", name: "G2", color: "#111" }], today: "2026-10-19", toDay };
eq(groupTasks(list, "grupo", ctx).map((s) => [s.key, s.tasks.length]), [["g1", 3], ["g2", 0]], "agrupar por grupo mantém vazios");
eq(groupTasks(list, "responsavel", ctx).map((s) => [s.key, s.tasks.length]), [["u1", 1], ["u2", 1], ["none", 1]], "agrupar por responsável");
eq(groupTasks(list, "prioridade", ctx).map((s) => [s.key, s.tasks.length]), [["urgente", 0], ["alta", 2], ["media", 0], ["baixa", 1]], "agrupar por prioridade");
eq(groupTasks(list, "situacao", ctx).map((s) => s.tasks.length), [2, 0, 0, 1], "agrupar por situação");
eq(groupTasks(list, "prazo", ctx).map((s) => [s.key, s.tasks.length]), [["late", 1], ["today", 1], ["week", 0], ["later", 0], ["none", 0], ["done", 1]], "agrupar por prazo");

// linha do tempo
eq(timelineBar("2026-10-05", "2026-10-10", "2026-10-01", 42), { from: 4, span: 6, clippedStart: false, clippedEnd: false }, "barra normal");
eq(timelineBar("2026-09-20", "2026-10-03", "2026-10-01", 42), { from: 0, span: 3, clippedStart: true, clippedEnd: false }, "barra cortada no início");
eq(timelineBar("2026-09-01", "2026-09-10", "2026-10-01", 42), null, "barra fora da janela");
eq(timelineBar("2026-10-30", "2026-12-30", "2026-10-01", 42)?.clippedEnd, true, "barra cortada no fim");

// colunas personalizadas
const col = (type: string, options?: string[]) => ({ id: "c", name: "c", type, options }) as never;
eq(cleanCustomValue(col("numero"), "1.234,5"), 1234.5, "número pt-BR");
eq(cleanCustomValue(col("numero"), "12.5"), 12.5, "número ponto decimal");
eq(cleanCustomValue(col("numero"), "abc"), null, "número inválido");
eq(cleanCustomValue(col("data"), "2026-10-19"), "2026-10-19", "data ok");
eq(cleanCustomValue(col("data"), "19/10/2026"), null, "data inválida");
eq(cleanCustomValue(col("selecao", ["A", "B"]), "B"), "B", "seleção válida");
eq(cleanCustomValue(col("selecao", ["A", "B"]), "Z"), null, "seleção fora das opções");
eq(cleanCustomValue(col("caixa"), true), true, "caixa marcada");
eq(cleanCustomValue(col("caixa"), false), null, "caixa desmarcada");
eq(cleanCustomValue(col("link"), "exemplo.com.br"), "https://exemplo.com.br", "link sem protocolo");
eq(cleanCustomValue(col("link"), "javascript:alert(1)"), null, "link perigoso");
eq(cleanCustomValue(col("texto"), ""), null, "texto vazio");

// modelos
eq(BOARD_TEMPLATES.map((t) => t.key), ["rotina", "obra"], "modelos de quadro");
eq(BOARD_TEMPLATES.every((t) => t.groups.length > 0 && t.groups.every((g) => g.tasks.length > 0)), true, "modelos com grupos e tarefas");

if (fail) {
  console.log(`\n${fail} teste(s) falharam`);
  process.exit(1);
}
console.log("Tarefas: todos os testes passaram");
