/** Explicações em português dos erros de fórmula (tooltip na célula e faixa sob a barra de fórmulas). */

export type ErrInfo = { code: string; label: string; title: string; help: string };

const LIST: ErrInfo[] = [
  { code: "#DIV/0!", label: "#DIV/0!", title: "Divisão por zero", help: "A fórmula divide por 0 ou por uma célula vazia. Confira o divisor ou proteja com SEERRO(A1/B1; 0)." },
  { code: "#REF!", label: "#REF!", title: "Referência inválida", help: "A fórmula aponta para uma célula, linha, coluna ou aba que não existe mais (foi apagada), sai da planilha ao copiar, ou o resultado em matriz esbarrou numa célula ocupada." },
  { code: "#NAME?", label: "#NOME?", title: "Nome não reconhecido", help: "Há uma função ou nome escrito errado (ex.: SOMMA em vez de SOMA) ou um texto sem aspas. Use Inserir > Função para ver os nomes certos." },
  { code: "#VALUE!", label: "#VALOR!", title: "Tipo de valor errado", help: "A fórmula esperava um número (ou data) mas recebeu um texto, ou os argumentos não combinam. Confira se as células citadas têm números." },
  { code: "#N/A", label: "#N/D", title: "Valor não encontrado", help: "A busca (PROCV, CORRESP, PROCX...) não achou o valor procurado. Confira o texto/código e use 0 ou FALSO no último argumento para busca exata. Para esconder: SEERRO(...; \"não achei\")." },
  { code: "#NUM!", label: "#NÚM!", title: "Número inválido", help: "O cálculo não tem resultado (raiz de negativo, log de zero, taxa que não converge) ou o argumento está fora do intervalo permitido." },
  { code: "#CIRC!", label: "#CIRC!", title: "Referência circular", help: "A fórmula depende dela mesma, direta ou por outras células. Remova a volta (ex.: a soma não pode incluir a própria célula)." },
  { code: "#ERRO!", label: "#ERRO!", title: "Fórmula inválida", help: "Não foi possível interpretar a fórmula. Confira parênteses, aspas e separadores (use ; entre argumentos)." },
];

const BY = new Map<string, ErrInfo>();
for (const e of LIST) {
  BY.set(e.code, e);
  BY.set(e.label, e);
}

/** Informações do erro a partir do código interno ou do rótulo exibido. */
export const errInfo = (codeOrLabel: string): ErrInfo | undefined => BY.get(codeOrLabel.toUpperCase());
