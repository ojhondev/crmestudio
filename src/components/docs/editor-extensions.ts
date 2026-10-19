import { Node, mergeAttributes } from "@tiptap/core";

/** Variável inline: aparece como uma "pílula" no editor e vira {{chave}} no texto salvo. */
export const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-var") ?? "",
        renderHTML: (attrs) => ({ "data-var": attrs.key }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-var]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), `{{${node.attrs.key}}}`];
  },
  renderText({ node }) {
    return `{{${node.attrs.key}}}`;
  },
});

/** Quebra de página: no editor é uma linha tracejada; no PDF começa uma nova folha. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML() {
    return ["div", { "data-page-break": "true" }];
  },
});
