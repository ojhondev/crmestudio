import type { DeckContent, Slide } from "./types";
import { PROPOSTA_DOCS, PROPOSTA_FIELD_LABELS } from "@/lib/propostas/doc-templates";

/** Variável como o editor a grava. */
const v = (key: string) => `<span data-var="${key}">{{${key}}}</span>`;
const p = (...parts: string[]) => `<p>${parts.join("")}</p>`;

export const REVIEW_NOTE =
  "Modelos de apoio, escritos em linguagem simples. Antes de usar com clientes, peça a um advogado de confiança para revisar e adaptar à realidade do estúdio.";

/* -------------------------------- cláusulas -------------------------------- */

export type Clause = { slug: string; name: string; description: string; html: string };

export const BUILTIN_CLAUSES: Clause[] = [
  {
    slug: "partes",
    name: "Identificação das partes",
    description: "Contratante e contratada, com documentos e endereços",
    html:
      `<h2>Das partes</h2>` +
      p(`<strong>CONTRATANTE:</strong> ${v("cliente.nome")}, inscrito(a) no CPF/CNPJ sob o nº ${v("cliente.documento")}, com endereço em ${v("cliente.endereco")}, ${v("cliente.cidade")}.`) +
      p(`<strong>CONTRATADA:</strong> ${v("estudio.razao_social")} (${v("estudio.nome")}), inscrita no CNPJ sob o nº ${v("estudio.documento")}, com sede em ${v("estudio.endereco")}, ${v("estudio.cidade")}, neste ato representada por ${v("estudio.responsavel")}, CPF ${v("estudio.responsavel_documento")}.`) +
      p("As partes acima identificadas celebram o presente contrato, que se regerá pelas cláusulas seguintes."),
  },
  {
    slug: "preco-pagamento",
    name: "Preço e forma de pagamento",
    description: "Valor total, entrada e parcelas",
    html:
      `<h2>Do preço e do pagamento</h2>` +
      p(`Pelos serviços descritos neste contrato, a CONTRATANTE pagará à CONTRATADA o valor total de <strong>${v("negocio.valor")}</strong> (${v("negocio.valor_extenso")}).`) +
      p(`O pagamento será realizado da seguinte forma: ${v("campo.forma_pagamento")}.`) +
      p("O atraso no pagamento implicará multa de 2% (dois por cento) sobre o valor em atraso, juros de 1% (um por cento) ao mês e correção monetária pelo IPCA."),
  },
  {
    slug: "prazo",
    name: "Prazo de execução",
    description: "Início, duração e condições de prorrogação",
    html:
      `<h2>Do prazo</h2>` +
      p(`Os serviços terão início em ${v("campo.data_inicio")} e prazo estimado de ${v("campo.prazo")}, contados da assinatura deste contrato e da liberação do local.`) +
      p("O prazo poderá ser prorrogado por motivo de força maior, de condições climáticas que impeçam a execução, de atraso na liberação do local ou de alteração de escopo solicitada pela CONTRATANTE."),
  },
  {
    slug: "obrigacoes-contratante",
    name: "Obrigações da contratante",
    description: "Acesso ao local, informações e pagamentos",
    html:
      `<h2>Das obrigações da CONTRATANTE</h2>` +
      `<ul><li>Garantir o acesso livre e seguro ao local dos serviços nos dias e horários combinados;</li>` +
      `<li>Fornecer as informações, documentos e autorizações necessários (inclusive junto a órgãos de proteção ao patrimônio, quando exigidos);</li>` +
      `<li>Efetuar os pagamentos nas datas acordadas;</li>` +
      `<li>Comunicar à CONTRATADA, por escrito, qualquer ocorrência que interfira na execução dos serviços.</li></ul>`,
  },
  {
    slug: "obrigacoes-contratada",
    name: "Obrigações da contratada",
    description: "Execução técnica, documentação e sigilo",
    html:
      `<h2>Das obrigações da CONTRATADA</h2>` +
      `<ul><li>Executar os serviços com técnica adequada à natureza do bem, seguindo as boas práticas de conservação e restauro;</li>` +
      `<li>Manter registro fotográfico e documental das etapas;</li>` +
      `<li>Utilizar materiais compatíveis e reversíveis sempre que possível;</li>` +
      `<li>Informar a CONTRATANTE sobre qualquer fato relevante identificado durante a execução;</li>` +
      `<li>Zelar pelo sigilo das informações recebidas.</li></ul>`,
  },
  {
    slug: "imagem-propriedade",
    name: "Direito de imagem e propriedade intelectual",
    description: "Uso de fotos da obra em portfólio e relatórios",
    html:
      `<h2>Do registro e do uso de imagens</h2>` +
      p("A CONTRATANTE autoriza a CONTRATADA a registrar o processo de trabalho em fotografias e vídeos e a utilizá-los em seu portfólio, site e redes sociais, sem identificar valores contratados. Caso prefira que determinadas imagens não sejam divulgadas, deverá comunicar por escrito antes do início dos serviços.") +
      p("Relatórios, projetos e documentos técnicos produzidos são de autoria da CONTRATADA e entregues à CONTRATANTE para uso relativo ao bem objeto deste contrato."),
  },
  {
    slug: "garantia",
    name: "Garantia",
    description: "Prazo de garantia dos serviços executados",
    html:
      `<h2>Da garantia</h2>` +
      p(`A CONTRATADA garante os serviços executados pelo prazo de ${v("campo.garantia")} contados da entrega, desde que respeitadas as orientações de conservação entregues. A garantia não cobre danos decorrentes de umidade, infiltrações, intervenções de terceiros, uso inadequado ou eventos externos.`),
  },
  {
    slug: "rescisao",
    name: "Rescisão",
    description: "Hipóteses de término antecipado",
    html:
      `<h2>Da rescisão</h2>` +
      p("O contrato poderá ser rescindido por qualquer das partes, mediante aviso prévio por escrito de 15 (quinze) dias. Nesse caso, a CONTRATANTE pagará os serviços já executados e os materiais já adquiridos, de forma proporcional.") +
      p("O descumprimento de qualquer cláusula, não sanado em 10 (dez) dias após notificação, autoriza a rescisão imediata pela parte prejudicada."),
  },
  {
    slug: "lgpd",
    name: "Proteção de dados (LGPD)",
    description: "Tratamento de dados pessoais",
    html:
      `<h2>Da proteção de dados</h2>` +
      p("As partes se comprometem a tratar os dados pessoais a que tiverem acesso em razão deste contrato exclusivamente para a sua execução, em conformidade com a Lei nº 13.709/2018 (LGPD), adotando medidas de segurança adequadas."),
  },
  {
    slug: "foro",
    name: "Foro",
    description: "Foro e assinatura eletrônica",
    html:
      `<h2>Do foro</h2>` +
      p(`Fica eleito o foro da comarca de ${v("estudio.foro")} para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.`) +
      p(`E, por estarem de acordo, as partes firmam este contrato, inclusive por meio de aceite eletrônico, em ${v("data.hoje")}.`),
  },
];

const clause = (slug: string) => BUILTIN_CLAUSES.find((c) => c.slug === slug)!.html;
const heading = (t: string) => `<h1 style="text-align: center">${t}</h1>`;
const objeto = (text: string) => `<h2>Do objeto</h2>${text}`;
const signatures =
  `<p></p><div data-page-break="true"></div>` +
  `<p style="text-align: center">${v("estudio.cidade")}, ${v("data.hoje")}.</p>` +
  `<p></p><p style="text-align: center">______________________________________<br>${v("cliente.nome")}<br>CONTRATANTE</p>` +
  `<p></p><p style="text-align: center">______________________________________<br>${v("estudio.responsavel")}<br>${v("estudio.nome")} — CONTRATADA</p>`;

/* --------------------------------- modelos --------------------------------- */

export type ContractTemplate = { slug: string; name: string; description: string; html: string };

export const BUILTIN_CONTRACTS: ContractTemplate[] = [
  {
    slug: "restauro",
    name: "Restauro e conservação",
    description: "Obra de restauro de bem histórico, igreja ou obra de arte",
    html:
      heading("CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE RESTAURO E CONSERVAÇÃO") +
      p(`<em>Contrato nº ${v("documento.numero")}</em>`).replace("<p>", '<p style="text-align: center">') +
      clause("partes") +
      objeto(
        p(`O presente contrato tem por objeto a prestação, pela CONTRATADA, dos serviços de ${v("negocio.servico")} no bem ${v("negocio.imovel")}, situado em ${v("negocio.local")}, conforme escopo: ${v("campo.escopo")}.`),
      ) +
      clause("preco-pagamento") +
      clause("prazo") +
      clause("obrigacoes-contratante") +
      clause("obrigacoes-contratada") +
      clause("imagem-propriedade") +
      clause("garantia") +
      clause("rescisao") +
      clause("lgpd") +
      clause("foro") +
      signatures,
  },
  {
    slug: "projeto",
    name: "Projeto de restauro",
    description: "Elaboração de projeto técnico e documentação",
    html:
      heading("CONTRATO DE ELABORAÇÃO DE PROJETO DE RESTAURO") +
      p(`<em>Contrato nº ${v("documento.numero")}</em>`).replace("<p>", '<p style="text-align: center">') +
      clause("partes") +
      objeto(
        p(`Constitui objeto deste contrato a elaboração de projeto de ${v("negocio.servico")} para o bem ${v("negocio.imovel")}, situado em ${v("negocio.local")}, compreendendo: ${v("campo.escopo")}.`) +
          p(`Entregáveis: ${v("campo.entregaveis")}.`),
      ) +
      clause("preco-pagamento") +
      clause("prazo") +
      clause("obrigacoes-contratante") +
      clause("obrigacoes-contratada") +
      clause("imagem-propriedade") +
      clause("rescisao") +
      clause("lgpd") +
      clause("foro") +
      signatures,
  },
  {
    slug: "laudo",
    name: "Laudo e diagnóstico",
    description: "Vistoria técnica, laudo de patologias e mapeamento de danos",
    html:
      heading("CONTRATO DE ELABORAÇÃO DE LAUDO TÉCNICO") +
      p(`<em>Contrato nº ${v("documento.numero")}</em>`).replace("<p>", '<p style="text-align: center">') +
      clause("partes") +
      objeto(
        p(`Este contrato tem por objeto a vistoria técnica e a elaboração de laudo de diagnóstico do bem ${v("negocio.imovel")}, situado em ${v("negocio.local")}, com mapeamento de danos, análise de causas e recomendações de intervenção.`) +
          p("O laudo refletirá as condições observadas na data da vistoria e as informações fornecidas pela CONTRATANTE, não implicando responsabilidade por vícios ocultos ou posteriores."),
      ) +
      clause("preco-pagamento") +
      clause("prazo") +
      clause("obrigacoes-contratante") +
      clause("obrigacoes-contratada") +
      clause("lgpd") +
      clause("foro") +
      signatures,
  },
  {
    slug: "consultoria",
    name: "Consultoria técnica",
    description: "Acompanhamento e orientação técnica por período",
    html:
      heading("CONTRATO DE CONSULTORIA TÉCNICA") +
      p(`<em>Contrato nº ${v("documento.numero")}</em>`).replace("<p>", '<p style="text-align: center">') +
      clause("partes") +
      objeto(p(`A CONTRATADA prestará consultoria técnica em ${v("negocio.servico")} relativa ao bem ${v("negocio.imovel")}, em ${v("negocio.local")}, nos seguintes termos: ${v("campo.escopo")}.`)) +
      clause("preco-pagamento") +
      clause("prazo") +
      clause("obrigacoes-contratante") +
      clause("rescisao") +
      clause("lgpd") +
      clause("foro") +
      signatures,
  },
  {
    slug: "em-branco",
    name: "Em branco",
    description: "Comece do zero e monte com a biblioteca de cláusulas",
    html: heading("CONTRATO") + clause("partes") + signatures,
  },
  ...PROPOSTA_DOCS.map(({ slug, name, description, html }) => ({ slug, name: `Licitação: ${name}`, description, html })),
];

/** Valor inicial dos campos personalizados que os modelos pedem. */
export const FIELD_LABELS: Record<string, string> = {
  ...PROPOSTA_FIELD_LABELS,
  forma_pagamento: "Forma de pagamento (ex.: 40% de entrada e 3 parcelas mensais)",
  data_inicio: "Data de início",
  prazo: "Prazo estimado (ex.: 90 dias)",
  escopo: "Escopo dos serviços",
  entregaveis: "Entregáveis",
  garantia: "Prazo de garantia (ex.: 12 meses)",
};

/* ------------------------------- apresentações ------------------------------ */

let counter = 0;
export const slideId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newSlide(layout: Slide["layout"]): Slide {
  switch (layout) {
    case "capa":
      return { id: slideId(), layout, title: "{{negocio.titulo}}", subtitle: "Proposta para {{cliente.nome}}", images: [] };
    case "texto":
      return { id: slideId(), layout, title: "Sobre o projeto", body: "Descreva aqui o contexto, o desafio e a abordagem do estúdio." };
    case "lista":
      return { id: slideId(), layout, title: "Nossa abordagem", items: [{ title: "Diagnóstico", text: "Mapeamento do estado de conservação" }, { title: "Intervenção", text: "Técnicas compatíveis e reversíveis" }] };
    case "imagem":
      return { id: slideId(), layout, title: "O bem", body: "Legenda da imagem", images: [] };
    case "galeria":
      return { id: slideId(), layout, title: "Trabalhos anteriores", images: [] };
    case "cronograma":
      return { id: slideId(), layout, title: "Cronograma", items: [{ title: "Vistoria", value: "Semana 1" }, { title: "Execução", value: "Semanas 2–10" }, { title: "Entrega", value: "Semana 11" }] };
    case "investimento":
      return { id: slideId(), layout, title: "Investimento", items: [{ title: "Serviços de restauro", value: "{{negocio.valor}}" }], total: "{{negocio.valor}}" };
    case "condicoes":
      return { id: slideId(), layout, title: "Condições", items: [{ title: "Pagamento", text: "A combinar" }, { title: "Validade da proposta", text: "30 dias" }] };
    case "encerramento":
      return { id: slideId(), layout, title: "Vamos conversar?", body: "{{estudio.nome}}\n{{estudio.email}} · {{estudio.telefone}}" };
  }
}

export function defaultDeck(): DeckContent {
  return {
    kind: "apresentacao",
    slides: (["capa", "texto", "lista", "cronograma", "investimento", "condicoes", "encerramento"] as const).map(newSlide),
  };
}
