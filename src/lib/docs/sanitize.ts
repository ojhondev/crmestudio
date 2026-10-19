import sanitizeHtml from "sanitize-html";

/** HTML do editor → HTML seguro (servidor). Só o que o editor produz; sem scripts, estilos soltos ou atributos de evento. */
export function cleanHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "hr", "a", "span", "div", "table", "thead", "tbody", "tr", "th", "td", "mark"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["data-var", "class"],
      div: ["data-page-break", "class"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      td: ["colspan", "rowspan", "style"],
      th: ["colspan", "rowspan", "style"],
      mark: ["class"],
    },
    allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] } },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
  });
}
