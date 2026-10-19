/**
 * Central de ajuda: documentação das funcionalidades e roteiros do tour guiado.
 * Ao criar ou mudar uma funcionalidade, atualize o artigo correspondente aqui.
 */

export type Block =
  | { t: "p"; text: string }
  | { t: "steps"; title?: string; items: string[] }
  | { t: "list"; title?: string; items: string[] }
  | { t: "tip"; text: string }
  | { t: "warn"; text: string };

export type Article = {
  slug: string;
  module: string;
  title: string;
  summary: string;
  /** rota onde fica a funcionalidade (para o botão "abrir") */
  href?: string;
  /** id de tour de página relacionado */
  tour?: string;
  body: Block[];
  keywords?: string[];
};

export const articles: Article[] = [
  {
    slug: "primeiros-passos",
    module: "Começando",
    title: "Primeiros passos",
    summary: "Como o Restaura Gestão está organizado e por onde começar.",
    tour: "welcome",
    keywords: ["início", "menu", "navegação", "tour"],
    body: [
      { t: "p", text: "O Restaura Gestão reúne em um só lugar o funil de negócios, os contatos, o atendimento por WhatsApp, a agenda e o financeiro do estúdio. A Ana, a copiloto, ajuda em tudo isso." },
      {
        t: "list",
        title: "Como navegar",
        items: [
          "No celular, use a barra inferior: Painel, Negócios, Atendimento e Agenda. O botão “Mais” abre o resto do menu.",
          "No computador, use o menu lateral. O botão no topo recolhe o menu para só ícones (atalho: Ctrl+B).",
          "O botão “?” no topo abre o tour guiado, a Central de ajuda e as dúvidas mais comuns.",
          "O ícone de sol/lua troca entre o tema claro (padrão) e o escuro (opcional).",
        ],
      },
      {
        t: "steps",
        title: "Um bom primeiro dia",
        items: [
          "Faça o tour de boas-vindas (botão “?” → Tour de boas-vindas).",
          "Abra Ajustes e troque a sua senha.",
          "Cadastre um lead em Leads e contatos e abra um negócio para ele.",
          "Agende uma visita técnica na Agenda e toque em Sincronizar para vê-la no seu celular.",
        ],
      },
      { t: "tip", text: "Instale o app na tela inicial do celular: ele abre em tela cheia, como um aplicativo. Veja “Instalar no celular”." },
    ],
  },
  {
    slug: "instalar-no-celular",
    module: "Começando",
    title: "Instalar no celular",
    summary: "Coloque o Restaura Gestão na tela inicial, como um aplicativo.",
    keywords: ["pwa", "app", "iphone", "android", "tela inicial", "instalar"],
    body: [
      { t: "p", text: "Não precisa de loja de aplicativos. O sistema abre direto pelo navegador e pode ser fixado na tela inicial." },
      {
        t: "steps",
        title: "No iPhone (Safari)",
        items: ["Abra gestao.estudiorestaura.com.br no Safari.", "Toque no botão de compartilhar (quadrado com seta).", "Escolha “Adicionar à Tela de Início” e confirme."],
      },
      {
        t: "steps",
        title: "No Android (Chrome)",
        items: ["Abra gestao.estudiorestaura.com.br no Chrome.", "Toque nos três pontinhos no canto superior.", "Escolha “Instalar aplicativo” (ou “Adicionar à tela inicial”)."],
      },
      { t: "tip", text: "Use sempre o mesmo e-mail e a mesma senha. Se o app pedir login de novo, é só entrar outra vez." },
    ],
  },
  {
    slug: "painel",
    module: "Operação",
    title: "Painel",
    summary: "O resumo do dia: funil, agenda, tarefas e conversas esperando resposta.",
    href: "/",
    tour: "/",
    keywords: ["resumo", "dashboard", "kpi", "tarefas"],
    body: [
      { t: "p", text: "O Painel é a tela inicial. Ele mostra o que precisa de atenção hoje, sem você precisar procurar." },
      {
        t: "list",
        title: "O que aparece",
        items: [
          "Números do topo: valor no funil, fechado no mês, a receber nos próximos 30 dias e conversas aguardando resposta. Toque em um número para abrir a tela correspondente.",
          "Funil: quantos negócios e quanto dinheiro há em cada etapa.",
          "Minhas tarefas: o que está atribuído a você, em ordem de prazo.",
          "Próximos 7 dias: visitas, reuniões e prazos da agenda.",
          "Aguardando resposta: conversas do WhatsApp com mensagens não lidas.",
        ],
      },
      { t: "tip", text: "A caixa “Pergunte à Ana” responde dúvidas sobre o seu próprio funil, agenda e caixa. Ex.: “quem precisa de follow-up?”." },
    ],
  },
  {
    slug: "negocios",
    module: "Operação",
    title: "Negócios (funil)",
    summary: "O quadro Kanban: crie, mova e feche negócios.",
    href: "/negocios",
    tour: "/negocios",
    keywords: ["kanban", "funil", "etapas", "proposta", "arrastar"],
    body: [
      { t: "p", text: "Cada negócio é uma oportunidade (ex.: “Restauro do forro — Matriz de Itu”). As colunas são as etapas, de Novo lead até Fechado ou Perdido." },
      {
        t: "steps",
        title: "Criar um negócio",
        items: ["Toque em “Novo negócio”.", "Dê um nome, escolha o cliente (ou cadastre um novo ali mesmo) e o valor estimado.", "Escolha o serviço, o tipo de bem e a previsão de fechamento. Toque em Criar."],
      },
      {
        t: "list",
        title: "No dia a dia",
        items: [
          "Mover de etapa: arraste o cartão para outra coluna. No celular, segure o cartão por um instante e arraste. Também dá para mudar a etapa dentro do negócio.",
          "Abrir: toque no cartão para ver histórico, tarefas, agenda e financeiro daquele negócio.",
          "Histórico: registre ligações, visitas, e-mails e notas. Mudanças de etapa são registradas sozinhas.",
          "Fechado: ao mover para “Fechado”, o sistema oferece lançar o valor no Financeiro.",
          "Perdido: informe o motivo na aba Detalhes, para aprender com as perdas.",
        ],
      },
      { t: "tip", text: "As etapas do funil podem ser renomeadas, reordenadas e recoloridas em Ajustes → Etapas do funil." },
    ],
  },
  {
    slug: "leads-contatos",
    module: "Operação",
    title: "Leads e contatos",
    summary: "Cadastro de clientes, origem dos leads e ficha completa.",
    href: "/contatos",
    tour: "/contatos",
    keywords: ["lead", "cliente", "cadastro", "origem", "busca"],
    body: [
      { t: "p", text: "Aqui ficam todas as pessoas e instituições com quem o estúdio se relaciona: paróquias, dioceses, construtoras, proprietários, prefeituras." },
      {
        t: "list",
        title: "De onde vêm os leads",
        items: [
          "Cadastro manual: botão “Novo lead”. Você pode já abrir um negócio no funil.",
          "WhatsApp: quando um número novo escreve para o estúdio, o contato é criado automaticamente com origem WhatsApp.",
          "Site: pedidos de orçamento e mensagens do formulário do site viram um contato e um negócio em “Novo lead”.",
        ],
      },
      {
        t: "list",
        title: "Ficha do contato",
        items: ["Histórico de conversas e registros, tarefas, negócios e dados de contato.", "Botão WhatsApp abre (ou inicia) a conversa com a pessoa.", "Use etiquetas para agrupar (ex.: diocese, IPHAN, recorrente)."],
      },
      { t: "tip", text: "A busca encontra por nome, instituição, e-mail ou telefone. Os filtros de origem ficam logo abaixo." },
    ],
  },
  {
    slug: "atendimento",
    module: "Operação",
    title: "Atendimento (WhatsApp)",
    summary: "Caixa de entrada do WhatsApp do estúdio, com apoio da Ana.",
    href: "/atendimento",
    tour: "/atendimento",
    keywords: ["whatsapp", "conversa", "mensagem", "inbox", "24h", "nota"],
    body: [
      { t: "p", text: "Todas as conversas do WhatsApp Business do estúdio chegam aqui, organizadas por contato." },
      {
        t: "list",
        title: "Recursos",
        items: [
          "Filtros: Abertas, Não lidas, Minhas e Resolvidas.",
          "Responsável: atribua a conversa a alguém da equipe.",
          "Nota interna: o botão “Nota” guarda um recado que o cliente não vê.",
          "Resolver: encerra a conversa; se o cliente escrever de novo, ela reabre sozinha.",
          "Painel da Ana (ao lado no computador, botão “Ana” no celular): resumo da conversa, sugestão de resposta e rascunho de e-mail.",
        ],
      },
      { t: "warn", text: "Regra da Meta: texto livre só pode ser enviado até 24 horas depois da última mensagem do cliente. Depois disso o sistema avisa e é preciso esperar o cliente escrever ou usar um modelo aprovado." },
      { t: "tip", text: "A Ana apenas sugere. Você revisa e toca em Enviar — nada é enviado sem a sua confirmação." },
    ],
  },
  {
    slug: "ana",
    module: "Operação",
    title: "Ana, a copiloto",
    summary: "O que a Ana faz e como pedir bem.",
    keywords: ["ia", "copiloto", "resumo", "email", "sugestão"],
    body: [
      { t: "p", text: "A Ana é a assistente do estúdio dentro do sistema. Ela lê o funil, a agenda, o financeiro e as conversas a que você tem acesso e ajuda a decidir e a escrever." },
      {
        t: "list",
        title: "Ela pode",
        items: [
          "Resumir uma conversa e dizer o que o cliente quer e quais são os próximos passos.",
          "Sugerir a próxima resposta de WhatsApp, no tom do estúdio.",
          "Redigir e-mails (proposta, retorno, agradecimento) a partir do histórico do negócio.",
          "Responder perguntas como “como está o caixa do mês?” ou “o que tenho na agenda esta semana?”.",
        ],
      },
      { t: "list", title: "Ela não faz", items: ["Não envia mensagens nem altera dados sozinha.", "Não inventa valores, prazos ou datas: quando falta informação, ela avisa."] },
      { t: "tip", text: "Abra a Ana em qualquer tela com Ctrl+J (ou ⌘J). Dentro de um negócio, contato ou conversa, ela já enxerga o que está aberto." },
    ],
  },
  {
    slug: "agenda",
    module: "Operação",
    title: "Agenda",
    summary: "Visitas, reuniões, obras e prazos, sincronizados com o celular.",
    href: "/agenda",
    tour: "/agenda",
    keywords: ["calendário", "google", "iphone", "visita", "ics", "sincronizar"],
    body: [
      { t: "p", text: "A agenda do estúdio mostra o mês inteiro e uma lista dos próximos compromissos." },
      { t: "steps", title: "Criar um evento", items: ["Toque em um dia (ou em “Evento”).", "Dê um título, escolha o tipo (reunião, visita técnica, obra, prazo) e o horário.", "Vincule a um negócio ou contato para o evento aparecer no histórico deles."] },
      {
        t: "steps",
        title: "Ver a agenda no Google Agenda ou iPhone",
        items: ["Toque em “Sincronizar”.", "No iPhone/Mac, toque em “Abrir no Calendário”. No Google Agenda, copie o link e use Outras agendas → Do URL.", "Pronto: os eventos aparecem lá e se atualizam sozinhos."],
      },
      { t: "warn", text: "A sincronização é de mão única: o que você cria aqui aparece no Google/iPhone, mas eventos criados lá não voltam para cá. O link é pessoal — não compartilhe." },
    ],
  },
  {
    slug: "financeiro",
    module: "Gestão",
    title: "Financeiro",
    summary: "Painel com gráficos, lançamentos e uma planilha que vai e volta do Excel e do Google Sheets.",
    href: "/financeiro",
    tour: "/financeiro",
    keywords: ["caixa", "receita", "despesa", "parcela", "atrasado", "pagar", "receber", "planilha", "csv", "excel", "sheets", "exportar", "importar", "painel", "gráfico", "previsão"],
    body: [
      { t: "p", text: "O Financeiro tem três abas: Painel (visão geral com gráficos), Lançamentos (a lista do mês) e Planilha (edição rápida, estilo Excel)." },
      {
        t: "list",
        title: "Painel",
        items: [
          "Resultado do período: o que já foi recebido menos o que já foi pago. O que ainda está em aberto aparece em “A receber” e “A pagar”.",
          "Troque o período no topo: este mês, 3, 6 ou 12 meses, ou o ano. Cada número mostra a variação contra o período anterior de mesmo tamanho.",
          "Gráfico de receita × despesa por mês: cor cheia é o que já foi pago, cor clara é o que está em aberto. Toque (ou passe o mouse) em um mês para ler os valores; “Ver em tabela” mostra os mesmos números em linhas.",
          "Previsão de caixa dos próximos 6 meses, só com o que ainda está em aberto, e a lista dos vencimentos dos próximos 14 dias.",
          "Receita e despesa por categoria, receita por serviço e maiores clientes (precisam que os lançamentos estejam ligados a negócios e clientes).",
          "Previsão ponderada do funil: cada negócio em andamento vale o seu valor vezes a chance de fechar da etapa (ajuste as chances em Ajustes → Etapas do funil).",
        ],
      },
      {
        t: "steps",
        title: "Lançar uma receita ou despesa",
        items: ["Em Lançamentos, toque em “Lançamento” e escolha Receita ou Despesa.", "Informe descrição, valor e vencimento. Para dividir, use o campo Parcelas (uma por mês).", "Vincule a um negócio para ver o financeiro dentro dele."],
      },
      {
        t: "list",
        title: "Planilha: preencher rápido, inclusive pelo celular",
        items: [
          "Cada linha é um lançamento; toque na célula e digite. Enter desce para a linha de baixo.",
          "Cole direto do Excel ou do Google Sheets: copie as células, toque na primeira célula de destino e cole — as linhas seguintes viram novos lançamentos.",
          "As alterações só são gravadas quando você toca em Salvar (um contador mostra o que está pendente). “Descartar” volta ao que está salvo.",
          "O rodapé soma receitas, despesas e saldo da planilha na hora, enquanto você edita.",
          "Em Cliente/fornecedor e Negócio, escreva o nome como está no sistema para criar o vínculo. Se não encontrar, o lançamento é salvo sem vínculo e o app avisa.",
        ],
      },
      {
        t: "steps",
        title: "Levar para o Excel ou o Google Sheets",
        items: [
          "Na Planilha, toque em Exportar e escolha o formato: “Excel (Brasil)” (separado por ponto e vírgula, datas dd/mm/aaaa) ou “Google Sheets / internacional” (vírgula e datas aaaa-mm-dd).",
          "Abra o arquivo no programa. Os acentos já saem corretos.",
          "Para trazer de volta: Importar CSV, escolha o arquivo e confira a prévia. Linhas com o ID original são atualizadas; linhas sem ID viram lançamentos novos. Nada é gravado até você tocar em Salvar.",
        ],
      },
      { t: "tip", text: "Precisa começar do zero? Em Importar CSV há o “Modelo em branco” com as colunas e dois exemplos. Não altere a coluna ID se quiser atualizar lançamentos existentes." },
      { t: "warn", text: "Excluir lançamentos exige o nível Gerenciar no Financeiro. Quem só edita pode criar e alterar, mas não apagar." },
    ],
  },
  {
    slug: "equipe-acessos",
    module: "Sistema",
    title: "Equipe e acessos",
    summary: "Perfis, permissões por módulo, contas e a trilha de atividade.",
    href: "/equipe",
    tour: "/equipe",
    keywords: ["usuário", "permissão", "perfil", "parceiro", "senha", "acesso", "nível", "auditoria", "atividade"],
    body: [
      { t: "p", text: "Aqui o estúdio decide quem entra no sistema e o que cada pessoa pode ver e fazer. Quem tiver o módulo “Equipe e acessos” liberado vê esta tela; para criar contas e mudar permissões é preciso o nível Gerenciar." },
      {
        t: "list",
        title: "Perfis prontos",
        items: [
          "Administrador: acesso total, inclusive contas e configurações.",
          "Gestor: toca a operação inteira (negócios, atendimento, agenda, financeiro, documentos); vê a equipe, mas não altera acessos.",
          "Comercial: funil, contatos, atendimento, agenda e documentos. Sem financeiro.",
          "Atendimento: responde clientes e cuida de contatos e agenda; consulta o funil sem alterar.",
          "Financeiro: cuida do caixa e consulta negócios, contatos e agenda.",
          "Parceiro comercial: externo; vê e atualiza só os negócios em que foi indicado e a própria agenda.",
        ],
      },
      {
        t: "list",
        title: "Os quatro níveis de cada módulo",
        items: [
          "Nenhum: o módulo nem aparece no menu e o endereço direto é bloqueado.",
          "Ver: só consulta.",
          "Editar: cria e altera.",
          "Gerenciar: também exclui e mexe em configurações sensíveis.",
        ],
      },
      {
        t: "steps",
        title: "Adicionar uma pessoa",
        items: [
          "Toque em “Adicionar pessoa” e preencha nome, e-mail e perfil.",
          "Copie o acesso gerado (senha provisória) e envie por um canal privado.",
          "No primeiro login a pessoa é obrigada a criar a própria senha.",
        ],
      },
      {
        t: "steps",
        title: "Ajustar o acesso de alguém",
        items: [
          "Toque na pessoa na lista.",
          "Escolha outro perfil ou ajuste módulo a módulo. Se a combinação não bate com um perfil pronto, ela vira “Personalizado”.",
          "Use “Ver só os próprios” para limitar a pessoa aos negócios dela e à própria agenda.",
          "Toque em Salvar. A mudança vale na hora, sem a pessoa precisar sair e entrar de novo.",
        ],
      },
      {
        t: "list",
        title: "Regras de segurança",
        items: [
          "Ninguém concede mais acesso do que tem, e só administrador altera outro administrador.",
          "Você não altera o seu próprio nível de acesso, nem desativa a própria conta.",
          "O último administrador ativo não pode ser rebaixado nem desativado.",
          "Desativar uma conta ou gerar nova senha desconecta a pessoa de todos os aparelhos na hora.",
          "Depois de 8 tentativas de login erradas seguidas, o e-mail fica bloqueado por 15 minutos.",
        ],
      },
      { t: "tip", text: "Na aba Atividade fica a trilha do que aconteceu: acessos, mudanças de permissão, lançamentos financeiros e exclusões, com quem fez e quando." },
    ],
  },
  {
    slug: "ajustes",
    module: "Sistema",
    title: "Ajustes",
    summary: "Perfil, senha, etapas do funil e integrações.",
    href: "/ajustes",
    tour: "/ajustes",
    keywords: ["senha", "perfil", "etapas", "whatsapp", "integração"],
    body: [
      {
        t: "list",
        items: [
          "Meu perfil e Senha: dados pessoais e troca de senha (mínimo de 8 caracteres).",
          "Integrações (administrador): estado do WhatsApp, da Ana e o link do feed da agenda.",
          "Etapas do funil (administrador): renomeie, reordene, recolora, adicione ou remova etapas. Uma etapa só pode ser removida se estiver vazia.",
          "Dados de exemplo: aparecem enquanto houver contatos de demonstração e podem ser removidos com um toque.",
        ],
      },
    ],
  },
  {
    slug: "leads-do-site",
    module: "Operação",
    title: "Leads que chegam do site",
    summary: "O formulário e o popup de orçamento do site alimentam o funil.",
    href: "/negocios",
    keywords: ["site", "formulário", "orçamento", "popup", "origem"],
    body: [
      { t: "p", text: "Quando alguém pede um orçamento ou envia uma mensagem pelo site do estúdio, o sistema cria (ou reaproveita) o contato e abre um negócio na etapa “Novo lead”, com a mensagem guardada no histórico." },
      { t: "list", items: ["Contatos que já existem (mesmo e-mail ou telefone) não são duplicados.", "A origem fica registrada como “Site”.", "Responda rápido: a primeira resposta costuma decidir o orçamento."] },
    ],
  },
  {
    slug: "atalhos",
    module: "Começando",
    title: "Atalhos do teclado",
    summary: "Para quem usa o computador.",
    keywords: ["teclado", "atalho", "ctrl"],
    body: [{ t: "list", items: ["Ctrl+J (⌘J no Mac): abrir/fechar a Ana.", "Ctrl+B (⌘B no Mac): recolher ou expandir o menu lateral.", "Enter no atendimento: enviar mensagem. Shift+Enter: quebrar linha.", "Esc: fechar janelas e o tour."] }],
  },
];

export const articleBySlug = (slug: string) => articles.find((a) => a.slug === slug);

export const faq: { q: string; a: string }[] = [
  { q: "Esqueci minha senha. E agora?", a: "Peça a um administrador para gerar uma nova senha provisória em Equipe e acessos (toque na sua pessoa → Gerar nova senha). No próximo login você cria uma senha nova só sua." },
  { q: "Por que não consigo enviar mensagem no WhatsApp?", a: "Provavelmente passaram 24 horas desde a última mensagem do cliente. A Meta só permite texto livre dentro dessa janela. Aguarde o cliente escrever ou use um modelo aprovado." },
  { q: "A agenda do Google não mostra um evento que criei.", a: "O Google atualiza assinaturas de calendário a cada algumas horas. No iPhone costuma ser mais rápido. Confira também se o link de sincronização é o seu." },
  { q: "Apaguei um negócio sem querer.", a: "A exclusão é definitiva. Por isso o sistema sempre pede confirmação. Se aconteceu, avise um administrador para tentar recuperar pelo banco." },
  { q: "Por que não vejo um módulo no menu (ex.: Financeiro)?", a: "Cada pessoa vê só os módulos liberados no seu perfil de acesso. Se precisar de outro, peça a um administrador em Equipe e acessos." },
  { q: "Posso usar no computador e no celular ao mesmo tempo?", a: "Sim. Os dados são os mesmos em qualquer aparelho." },
];

/* ---------------- tour guiado ---------------- */

export type TourStep = {
  /** valores de data-tour; usa o primeiro visível na tela. Sem alvo = cartão centralizado. */
  target?: string[];
  title: string;
  body: string;
};

export const tours: Record<string, { label: string; steps: TourStep[] }> = {
  welcome: {
    label: "Tour de boas-vindas",
    steps: [
      { title: "Bem-vinda ao Restaura Gestão", body: "Um app só para o dia a dia do estúdio: negócios, contatos, atendimento, agenda e financeiro. Vamos ver o essencial em menos de 1 minuto." },
      { target: ["nav-negocios"], title: "Negócios", body: "O funil de vendas em formato de quadro. Arraste os cartões entre as etapas conforme o negócio avança." },
      { target: ["nav-atendimento", "nav-mais"], title: "Atendimento", body: "As conversas do WhatsApp do estúdio chegam aqui. A Ana resume e sugere respostas." },
      { target: ["nav-agenda"], title: "Agenda", body: "Visitas, reuniões e prazos. Dá para sincronizar com o Google Agenda e com o iPhone." },
      { target: ["nav-financeiro", "nav-mais"], title: "Financeiro e mais", body: "Receitas, despesas e o caixa do mês ficam no menu. No celular, toque em “Mais” para ver tudo." },
      { target: ["ana", "ana-top"], title: "Ana, a copiloto", body: "Pergunte sobre o funil, peça um resumo de conversa ou um rascunho de e-mail. Atalho no computador: Ctrl+J." },
      { target: ["sidebar-toggle"], title: "Menu recolhível", body: "No computador, este botão recolhe o menu lateral para deixar só os ícones e abrir mais espaço." },
      { target: ["theme-toggle"], title: "Tema claro ou escuro", body: "O visual padrão é claro. Se preferir, troque para o escuro aqui — a escolha fica salva neste aparelho." },
      { target: ["help-button"], title: "Ajuda sempre à mão", body: "Aqui você revê este tour, faz o tour de cada tela e abre a Central de ajuda com o passo a passo de tudo." },
    ],
  },
  "/": {
    label: "Tour do Painel",
    steps: [
      { target: ["dash-kpis"], title: "Números do dia", body: "Valor no funil, fechado no mês, a receber e conversas esperando resposta. Toque em um número para abrir a tela dele." },
      { target: ["dash-ask"], title: "Pergunte à Ana", body: "Escreva uma pergunta sobre o seu funil, agenda ou caixa — ou toque em um dos atalhos." },
      { target: ["dash-funnel"], title: "Funil", body: "Quantos negócios e quanto dinheiro há em cada etapa." },
    ],
  },
  "/negocios": {
    label: "Tour de Negócios",
    steps: [
      { target: ["page-actions"], title: "Novo negócio", body: "Crie um negócio já escolhendo o cliente — ou cadastrando um novo na hora." },
      { target: ["kanban"], title: "O quadro", body: "Cada coluna é uma etapa. Arraste um cartão para mudar a etapa. No celular, segure o cartão um instante antes de arrastar. Deslize de lado para ver as outras etapas." },
      { title: "Dentro do negócio", body: "Toque em um cartão para ver histórico, tarefas, agenda e financeiro, e para pedir um e-mail à Ana." },
    ],
  },
  "/contatos": {
    label: "Tour de Leads e contatos",
    steps: [
      { target: ["page-actions"], title: "Novo lead", body: "Cadastre uma pessoa ou instituição e, se quiser, já abra um negócio para ela." },
      { target: ["contacts-search"], title: "Busca e filtros", body: "Procure por nome, instituição, e-mail ou telefone e filtre pela origem do lead." },
      { target: ["contacts-list"], title: "Lista", body: "Toque em um contato para abrir a ficha com histórico, negócios e tarefas." },
    ],
  },
  "/atendimento": {
    label: "Tour de Atendimento",
    steps: [
      { target: ["inbox-list"], title: "Conversas", body: "As conversas do WhatsApp. O número laranja mostra mensagens não lidas. Use os filtros Abertas, Não lidas, Minhas e Resolvidas." },
      { target: ["thread-composer"], title: "Responder", body: "Escreva e envie. O botão “Nota” guarda um recado interno que o cliente não vê." },
      { target: ["thread-side", "thread-ana-button"], title: "Ana na conversa", body: "Resumo da conversa, sugestão de resposta e rascunho de e-mail. Você revisa e envia." },
    ],
  },
  "/agenda": {
    label: "Tour da Agenda",
    steps: [
      { target: ["page-actions"], title: "Sincronizar", body: "Veja esta agenda no Google Agenda ou no iPhone, atualizando sozinha." },
      { target: ["agenda-grid"], title: "Calendário", body: "Toque em um dia para criar um evento, ou em um evento para editar." },
    ],
  },
  "/financeiro": {
    label: "Tour do Painel financeiro",
    steps: [
      { target: ["fin-tabs"], title: "Três abas", body: "Painel (visão geral), Lançamentos (a lista do mês) e Planilha (edição rápida, estilo Excel)." },
      { target: ["fin-period"], title: "Período", body: "Troque entre este mês, 3, 6 ou 12 meses e o ano. Tudo na tela acompanha o período escolhido." },
      { target: ["fin-hero"], title: "Resultado do período", body: "O que já foi recebido menos o que já foi pago. O que ainda está em aberto fica em “A receber” e “A pagar”." },
      { target: ["fin-chart"], title: "Receita × despesa por mês", body: "Cor cheia é o que já foi pago; clara, o que está em aberto. Toque em um mês para ler os valores." },
      { target: ["fin-forecast"], title: "Previsão de caixa", body: "O que ainda vai entrar e sair nos próximos 6 meses, para você se antecipar a meses apertados." },
    ],
  },
  "/financeiro/lancamentos": {
    label: "Tour dos Lançamentos",
    steps: [
      { target: ["page-actions"], title: "Novo lançamento", body: "Registre receitas e despesas, inclusive parceladas em vários meses." },
      { target: ["fin-kpis"], title: "Resumo do mês", body: "Recebido, pago, resultado e atrasos. Use as setas para mudar de mês." },
      { target: ["fin-table"], title: "Lançamentos", body: "Marque como pago tocando na caixinha. Toque na linha para editar." },
    ],
  },
  "/financeiro/planilha": {
    label: "Tour da Planilha",
    steps: [
      { target: ["sheet-period"], title: "Período", body: "Veja um mês, só o que está em aberto ou tudo. A planilha mostra e edita exatamente esses lançamentos." },
      { target: ["sheet-toolbar"], title: "Linha, Importar e Exportar", body: "Adicione linhas, importe um CSV do Excel/Sheets e exporte nos dois formatos. Só grava quando você toca em Salvar." },
      { target: ["sheet-grid"], title: "A grade", body: "Toque numa célula e digite. Enter desce. Você também pode copiar células do Excel ou do Sheets e colar aqui — as linhas viram lançamentos." },
    ],
  },
  "/equipe": {
    label: "Tour de Equipe e acessos",
    steps: [
      { target: ["page-actions"], title: "Adicionar pessoa", body: "Crie a conta escolhendo um perfil. A senha provisória aparece uma única vez e a pessoa cria a própria no primeiro acesso." },
      { target: ["team-list"], title: "Pessoas e perfis", body: "Cada cartão mostra o perfil e o último acesso. Toque em uma pessoa para ajustar permissões módulo a módulo, desativar a conta ou gerar nova senha." },
      { target: ["team-tabs"], title: "Atividade", body: "Na aba Atividade fica a trilha de acessos, mudanças de permissão, lançamentos financeiros e exclusões." },
    ],
  },
  "/ajustes": {
    label: "Tour de Ajustes",
    steps: [{ target: ["page-header"], title: "Ajustes", body: "Perfil, senha, integrações e as etapas do funil (administrador). Troque a senha provisória no primeiro acesso." }],
  },
};

/** Acha o tour da página pelo caminho (mais específico primeiro). */
export function tourForPath(pathname: string): string {
  if (pathname === "/") return "/";
  const key = Object.keys(tours)
    .filter((k) => k.startsWith("/") && k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ?? "welcome";
}
