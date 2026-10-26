/**
 * Modelos de documento da proposta (editáveis no editor de Documentos). São MODELOS DE PARTIDA:
 * não afirmam conformidade legal e levam um aviso discreto para revisar com o jurídico e com o edital.
 */

const v = (key: string) => `<span data-var="${key}">{{${key}}}</span>`;
const p = (...parts: string[]) => `<p>${parts.join("")}</p>`;
const center = (html: string) => `<p style="text-align: center">${html}</p>`;
const heading = (t: string) => `<h1 style="text-align: center">${t}</h1>`;

export const PROPOSTA_REVIEW_NOTE = "Modelo de partida: revise com o jurídico e com o edital antes de assinar ou enviar. Apague esta nota na versão final.";
const note = `<blockquote><p>${PROPOSTA_REVIEW_NOTE}</p></blockquote>`;

const recipient =
  p("Ao(À)") +
  p(`<strong>${v("edital.orgao")}</strong>`) +
  p(`${v("edital.unidade")}`) +
  p(`Ref.: ${v("edital.modalidade")} nº ${v("edital.numero")} — Processo nº ${v("edital.processo")}`) +
  p(`Objeto: ${v("edital.objeto")}`);

const bidder = p(
  `<strong>${v("estudio.razao_social")}</strong>, inscrita no CNPJ sob o nº ${v("estudio.documento")}, com sede em ${v("estudio.endereco")}, ${v("estudio.cidade")}, por meio de seu representante legal, ${v("estudio.representante")}, CPF ${v("estudio.representante_cpf")}`,
);

const sign = (who: "rep" | "tec") =>
  `<p></p>` +
  center(`${v("estudio.cidade")}, ${v("data.hoje")}.`) +
  `<p></p>` +
  (who === "rep"
    ? center(`______________________________________<br>${v("estudio.representante")}<br>${v("estudio.representante_cargo")} — ${v("estudio.razao_social")}`)
    : center(`______________________________________<br>${v("estudio.resp_tecnico")}<br>${v("estudio.resp_tecnico_profissao")} — ${v("estudio.resp_tecnico_registro")}`));

const breakPage = `<div data-page-break="true"></div>`;

const decl = (title: string, body: string, who: "rep" | "tec" = "rep") => heading(title) + p("") + recipient + p("") + bidder.replace(/<\/p>$/, ", ") + body + sign(who);

/* ------------------------------- declarações ------------------------------- */

const D_IMPEDITIVO = decl(
  "DECLARAÇÃO DE INEXISTÊNCIA DE FATO IMPEDITIVO",
  `declara, sob as penas da lei, que até a presente data inexistem fatos impeditivos para a sua habilitação no presente processo licitatório, ciente da obrigatoriedade de declarar ocorrências posteriores.</p>`,
);
const D_MENOR = decl(
  "DECLARAÇÃO DE CUMPRIMENTO DO ART. 7º, XXXIII, DA CONSTITUIÇÃO FEDERAL",
  `declara, para fins do disposto no inciso XXXIII do art. 7º da Constituição Federal, que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 (dezesseis) anos, salvo na condição de aprendiz, a partir de 14 (quatorze) anos.</p>`,
);
const D_MEEPP = decl(
  "DECLARAÇÃO DE ENQUADRAMENTO COMO ME/EPP",
  `declara, sob as penas da lei, que se enquadra na condição de ${v("campo.porte")} nos termos da Lei Complementar nº 123/2006 e que não incorre em nenhuma das vedações previstas nessa lei para o tratamento diferenciado. <em>(Use somente se o edital previr e se a empresa de fato se enquadrar.)</em></p>`,
);
const D_INDEPENDENTE = decl(
  "DECLARAÇÃO DE ELABORAÇÃO INDEPENDENTE DE PROPOSTA",
  `declara que a proposta apresentada neste processo foi elaborada de maneira independente, que seu conteúdo não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato, e que não tentou influenciar a decisão de qualquer outro participante quanto a participar ou não do certame.</p>`,
);
const D_LOCAL = decl(
  "DECLARAÇÃO DE CONHECIMENTO DAS CONDIÇÕES DO LOCAL",
  `declara que tem pleno conhecimento das condições e peculiaridades do local de execução do objeto (${v("edital.local")}), que examinou o edital e seus anexos e que dispõe das informações necessárias para a elaboração da proposta, não podendo alegar desconhecimento posterior.</p>`,
);
const D_RESP_TECNICO = decl(
  "DECLARAÇÃO DE INDICAÇÃO DE RESPONSÁVEL TÉCNICO",
  `indica como responsável técnico pela execução do objeto ${v("estudio.resp_tecnico")}, ${v("estudio.resp_tecnico_profissao")}, registro ${v("estudio.resp_tecnico_registro")}, CPF ${v("estudio.resp_tecnico_cpf")}, que declara estar ciente de sua indicação e disponível para acompanhar os trabalhos. Equipe técnica: ${v("estudio.equipe_tecnica")}.</p>`,
  "tec",
);

export type PropostaDocTemplate = { slug: string; name: string; description: string; html: string; /** gerado por padrão no botão “Gerar documentos da proposta” */ auto: boolean; fields: Record<string, string> };

export const PROPOSTA_DOCS: PropostaDocTemplate[] = [
  {
    slug: "prop-carta",
    name: "Carta-proposta",
    description: "Carta de apresentação da proposta, com valor, prazo e validade",
    auto: true,
    fields: { valor_proposta: "", prazo_execucao: "", condicoes_pagamento: "Conforme previsto no edital" },
    html:
      note +
      heading("CARTA-PROPOSTA") +
      p("") +
      recipient +
      p("") +
      p("Prezados Senhores,") +
      p(`${v("estudio.razao_social")}, CNPJ ${v("estudio.documento")}, apresenta sua proposta para o objeto do edital em referência, nas condições a seguir:`) +
      `<ul><li><strong>Valor global:</strong> ${v("campo.valor_proposta")};</li>` +
      `<li><strong>Prazo de execução:</strong> ${v("campo.prazo_execucao")};</li>` +
      `<li><strong>Validade da proposta:</strong> ${v("proposta.validade")}, contados da data de abertura da sessão;</li>` +
      `<li><strong>Condições de pagamento:</strong> ${v("campo.condicoes_pagamento")}.</li></ul>` +
      p("Declaramos que, nos preços propostos, estão incluídos todos os custos e despesas necessários à execução do objeto, e que conhecemos e aceitamos as condições do edital e de seus anexos.") +
      p("Atenciosamente,") +
      sign("rep"),
  },
  {
    slug: "prop-comercial",
    name: "Proposta comercial (preços, BDI, prazo e validade)",
    description: "Tabela de preços com BDI, prazo de execução e validade",
    auto: true,
    fields: { prazo_execucao: "", condicoes_pagamento: "Conforme previsto no edital", dados_bancarios: "" },
    html:
      note +
      heading("PROPOSTA COMERCIAL") +
      p("") +
      recipient +
      p("") +
      bidder.replace(/<\/p>$/, ", apresenta a seguinte proposta de preços:</p>") +
      `<h2>Planilha de preços</h2>` +
      `<table><thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Preço unit. (R$)</th><th>Total (R$)</th></tr></thead><tbody>` +
      `<tr><td>1.1</td><td></td><td></td><td></td><td></td><td></td></tr>` +
      `<tr><td>1.2</td><td></td><td></td><td></td><td></td><td></td></tr>` +
      `<tr><td>2.1</td><td></td><td></td><td></td><td></td><td></td></tr>` +
      `</tbody></table>` +
      p(`<em>Dica: no CRM, a planilha de preços do dossiê calcula os totais; copie os valores para esta tabela ou anexe a planilha exigida pelo edital.</em>`) +
      `<h2>Resumo</h2>` +
      `<table><tbody>` +
      `<tr><th>Custo direto</th><td>${v("campo.custo_direto")}</td></tr>` +
      `<tr><th>BDI (${v("proposta.bdi")})</th><td>${v("campo.valor_bdi")}</td></tr>` +
      `<tr><th>Valor global da proposta</th><td><strong>${v("campo.valor_proposta")}</strong></td></tr>` +
      `</tbody></table>` +
      `<h2>Condições</h2>` +
      `<ul><li><strong>Prazo de execução:</strong> ${v("campo.prazo_execucao")};</li>` +
      `<li><strong>Validade da proposta:</strong> ${v("proposta.validade")};</li>` +
      `<li><strong>Condições de pagamento:</strong> ${v("campo.condicoes_pagamento")};</li>` +
      `<li><strong>Dados bancários:</strong> ${v("campo.dados_bancarios")}.</li></ul>` +
      sign("rep"),
  },
  {
    slug: "prop-tecnica",
    name: "Proposta técnica",
    description: "Metodologia, equipe, cronograma e atestados",
    auto: true,
    fields: { metodologia: "", cronograma: "", compreensao: "" },
    html:
      note +
      heading("PROPOSTA TÉCNICA") +
      p("") +
      recipient +
      `<h2>1. Identificação do proponente</h2>` +
      bidder.replace(/<\/p>$/, ".</p>") +
      `<h2>2. Compreensão do objeto</h2>` +
      p(`${v("campo.compreensao")}`) +
      `<h2>3. Metodologia de trabalho</h2>` +
      p(`${v("campo.metodologia")}`) +
      `<h2>4. Equipe técnica</h2>` +
      p(`Responsável técnico: ${v("estudio.resp_tecnico")}, ${v("estudio.resp_tecnico_profissao")}, registro ${v("estudio.resp_tecnico_registro")}.`) +
      p(`Equipe: ${v("estudio.equipe_tecnica")}.`) +
      `<h2>5. Cronograma</h2>` +
      p(`${v("campo.cronograma")}`) +
      `<h2>6. Experiência e atestados</h2>` +
      p(`${v("campo.atestados")}`) +
      sign("tec"),
  },
  {
    slug: "prop-declaracoes",
    name: "Declarações padrão",
    description: "Inexistência de fato impeditivo, não emprega menor, ME/EPP, elaboração independente, conhecimento do local e responsável técnico",
    auto: true,
    fields: { porte: "microempresa (ME) ou empresa de pequeno porte (EPP)" },
    html:
      note +
      D_IMPEDITIVO +
      breakPage +
      D_MENOR +
      breakPage +
      D_INDEPENDENTE +
      breakPage +
      D_LOCAL +
      breakPage +
      D_RESP_TECNICO +
      breakPage +
      D_MEEPP,
  },
  {
    slug: "prop-renuncia",
    name: "Termo de renúncia a recurso",
    description: "Renúncia ao prazo de recurso para acelerar a fase seguinte",
    auto: false,
    fields: { fase: "habilitação" },
    html:
      note +
      heading("TERMO DE RENÚNCIA AO DIREITO DE RECURSO") +
      p("") +
      recipient +
      p("") +
      bidder.replace(/<\/p>$/, ", ") +
      `renuncia expressamente ao direito de interpor recurso e ao respectivo prazo na fase de ${v("campo.fase")} do processo em referência, concordando com o seu resultado e com o prosseguimento do certame.</p>` +
      sign("rep"),
  },
  {
    slug: "prop-esclarecimento",
    name: "Pedido de esclarecimento",
    description: "Perguntas ao órgão sobre o edital, antes do prazo limite",
    auto: false,
    fields: { questoes: "", destinatario: "Agente de contratação / Pregoeiro(a)" },
    html:
      note +
      heading("PEDIDO DE ESCLARECIMENTO") +
      p("") +
      p(`Ao(À) ${v("campo.destinatario")}`) +
      recipient +
      p("") +
      bidder.replace(/<\/p>$/, ", vem, respeitosamente, solicitar os seguintes esclarecimentos sobre o edital em referência:</p>") +
      p(`${v("campo.questoes")}`) +
      p("Solicitamos que a resposta seja dada por escrito e divulgada a todos os interessados, na forma prevista no edital.") +
      p("Nestes termos, pede deferimento.") +
      sign("rep"),
  },
  {
    slug: "prop-impugnacao",
    name: "Impugnação ao edital",
    description: "Contestação de cláusula do edital (confira prazo e fundamento)",
    auto: false,
    fields: { clausula: "", fundamentos: "", pedido: "" },
    html:
      note +
      heading("IMPUGNAÇÃO AO EDITAL") +
      p("") +
      p("Ao(À) Agente de contratação / Pregoeiro(a) / Presidente da Comissão de Licitação") +
      recipient +
      p("") +
      bidder.replace(/<\/p>$/, ", vem, tempestivamente, impugnar o edital em referência, com base na legislação aplicável e nas regras do próprio edital (confira o fundamento legal e o prazo antes de protocolar).</p>") +
      `<h2>1. Da cláusula impugnada</h2>` +
      p(`${v("campo.clausula")}`) +
      `<h2>2. Dos fundamentos</h2>` +
      p(`${v("campo.fundamentos")}`) +
      `<h2>3. Do pedido</h2>` +
      p(`${v("campo.pedido")}`) +
      p("Nestes termos, pede deferimento.") +
      sign("rep"),
  },
];

/** Rótulos dos campos `campo.*` usados pelos modelos da proposta. */
export const PROPOSTA_FIELD_LABELS: Record<string, string> = {
  valor_proposta: "Valor global da proposta (ex.: R$ 1.250.000,00)",
  custo_direto: "Custo direto (R$)",
  valor_bdi: "Valor do BDI (R$)",
  prazo_execucao: "Prazo de execução (ex.: 180 dias corridos)",
  condicoes_pagamento: "Condições de pagamento",
  dados_bancarios: "Dados bancários",
  metodologia: "Metodologia de trabalho",
  compreensao: "Compreensão do objeto",
  cronograma: "Cronograma (resumo das etapas e prazos)",
  atestados: "Experiência e atestados",
  porte: "Porte da empresa (ME ou EPP)",
  fase: "Fase do processo (habilitação, julgamento…)",
  questoes: "Perguntas ao órgão (numere cada uma)",
  destinatario: "Destinatário (agente de contratação, pregoeiro…)",
  clausula: "Cláusula impugnada (número e transcrição)",
  fundamentos: "Fundamentos da impugnação",
  pedido: "Pedido",
};
