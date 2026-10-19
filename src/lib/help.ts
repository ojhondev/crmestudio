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
      { t: "p", text: "O Restaura Gestão reúne em um só lugar o funil de negócios, os contatos, a agenda e o financeiro do estúdio." },
      {
        t: "list",
        title: "Como navegar",
        items: [
          "No celular, use a barra inferior: Painel, Negócios, Tarefas e Agenda. O botão “Mais” abre o resto do menu.",
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
    summary: "O resumo do dia: funil, agenda e tarefas.",
    href: "/",
    tour: "/",
    keywords: ["resumo", "dashboard", "kpi", "tarefas"],
    body: [
      { t: "p", text: "O Painel é a tela inicial. Ele mostra o que precisa de atenção hoje, sem você precisar procurar." },
      {
        t: "list",
        title: "O que aparece",
        items: [
          "Números do topo: valor no funil, fechado no mês, e a receber nos próximos 30 dias. Toque em um número para abrir a tela correspondente.",
          "Funil: quantos negócios e quanto dinheiro há em cada etapa.",
          "Minhas tarefas: o que está atribuído a você, em ordem de prazo.",
          "Próximos 7 dias: visitas, reuniões e prazos da agenda.",
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
          "Site: pedidos de orçamento e mensagens do formulário do site viram um contato e um negócio em “Novo lead”.",
        ],
      },
      {
        t: "list",
        items: ["Histórico de registros, tarefas, negócios e dados de contato.", "Use etiquetas para agrupar (ex.: diocese, IPHAN, recorrente)."],
        title: "Ficha do contato",
      },
      { t: "tip", text: "A busca encontra por nome, instituição, e-mail ou telefone. Os filtros de origem ficam logo abaixo." },
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
    slug: "tarefas",
    module: "Operação",
    title: "Tarefas",
    summary: "Quadros de tarefas em tabela, lista, Kanban, calendário e linha do tempo, com colunas personalizadas, checklist e comentários.",
    href: "/tarefas",
    tour: "/tarefas",
    keywords: ["tarefa", "quadro", "monday", "prazo", "responsável", "kanban", "projeto", "pendência", "atrasada", "checklist", "calendário", "gantt", "subtarefa", "etiqueta", "recorrente", "modelo"],
    body: [
      { t: "p", text: "Tarefas é onde a equipe organiza o trabalho do dia a dia. Cada quadro representa um assunto (por exemplo “Rotina do estúdio” ou “Obra da Matriz”) e se divide em grupos; cada tarefa tem responsável, prazo, situação e prioridade." },
      {
        t: "steps",
        title: "Começar",
        items: [
          "Abra Tarefas e toque em “+ Quadro”. Escolha “Em branco” ou um modelo pronto (Rotina do estúdio, Obra de restauro), dê um nome e confirme.",
          "No grupo, digite o título na linha “Adicionar tarefa” e tecle Enter (ou use “Nova tarefa” na barra de cima).",
          "Em cada linha, escolha o responsável, o prazo, a situação (A fazer, Em andamento, Travada, Concluída) e a prioridade.",
          "Toque em “Detalhes” para abrir a tarefa: checklist, etiquetas, links, repetição, comentários e histórico.",
        ],
      },
      {
        t: "list",
        title: "Visões (botões na barra de cima — a escolha fica salva em cada quadro)",
        items: [
          "Tabela: grupos que podem ser recolhidos, com tudo editável na linha e colunas personalizadas.",
          "Lista: versão compacta, uma linha por tarefa.",
          "Kanban: colunas por situação, responsável ou prioridade (menu Organizar); arraste o cartão para mudar o campo (no celular, segure um instante antes de arrastar).",
          "Calendário: tarefas por prazo, em mês ou semana; arraste para outro dia para mudar o prazo e use o + do dia para criar.",
          "Linha do tempo: barras do dia em que a tarefa foi criada até o prazo (cronograma simples).",
          "Minhas tarefas: tudo o que está atribuído a você, em todos os quadros e negócios, separado em Atrasadas, Hoje, Próximos 7 dias, Depois e Sem prazo.",
        ],
      },
      {
        t: "list",
        title: "Recursos",
        items: [
          "Filtros (responsável, prioridade, situação, prazo, etiqueta, ocultar concluídas) e Organizar (agrupar por grupo, responsável, prioridade, situação ou prazo; ordenar).",
          "Arrastar pelo ícone ⋮⋮ para reordenar dentro do grupo ou mover para outro grupo (com “Ordem manual” e agrupado por grupo).",
          "Colunas personalizadas: o botão + no cabeçalho da tabela adiciona campos de texto, número, data, seleção, pessoa, caixa de seleção ou link.",
          "Checklist (subtarefas), etiquetas coloridas, anexos por link, comentários e histórico de alterações dentro da tarefa.",
          "Repetir: tarefas diárias, semanais ou mensais — ao concluir, a próxima nasce sozinha.",
          "Duplicar tarefa ou grupo inteiro.",
          "Ações em massa: marque várias tarefas na caixinha da esquerda e mude situação, responsável, prazo ou exclua de uma vez.",
        ],
      },
      { t: "tip", text: "Tarefas criadas dentro de um negócio ou de um contato também aparecem em “Minhas tarefas” de quem é o responsável, com o nome do negócio ao lado. Marcar como concluída em qualquer lugar vale para todos: a situação “Concluída” e o visto no negócio são a mesma coisa." },
      { t: "warn", text: "Excluir quadros e grupos exige o nível Gerenciar em Tarefas. Parceiros só veem as tarefas atribuídas a eles." },
    ],
  },
  {
    slug: "documentos",
    module: "Gestão",
    title: "Contratos e apresentações",
    summary: "Monte contratos e propostas comerciais com os dados do cliente, envie um link e receba o aceite online.",
    href: "/documentos",
    tour: "/documentos",
    keywords: ["contrato", "proposta", "apresentação", "slides", "pdf", "aceite", "assinatura", "cláusula", "modelo", "variável", "link", "cpf", "cnpj"],
    body: [
      { t: "p", text: "Em Documentos você cria dois tipos de peça: o Contrato (texto com cláusulas e aceite do cliente) e a Apresentação (proposta comercial em slides). Os dados do cliente, do negócio e do estúdio entram sozinhos." },
      {
        t: "steps",
        title: "Criar um contrato",
        items: [
          "Em Documentos (ou dentro de um negócio), toque em “Novo documento” e escolha Contrato.",
          "Escolha o modelo (restauro, projeto, laudo, consultoria ou em branco) e o negócio. Cliente, valor e local são preenchidos pelo negócio.",
          "No editor, ajuste o texto. Na aba Variáveis toque em um item para inserir dados que o sistema preenche; em Cláusulas, insira trechos prontos; em Campos, preencha o que é específico deste contrato (prazo, escopo, forma de pagamento).",
          "Veja a Prévia: o que ainda estiver vazio aparece destacado em laranja.",
          "Toque em “Enviar ao cliente”. O sistema congela esta versão e gera um link.",
        ],
      },
      {
        t: "steps",
        title: "Criar uma apresentação",
        items: [
          "Escolha Apresentação em “Novo documento”. Já vem uma proposta completa: capa, escopo, cronograma, investimento, condições e encerramento.",
          "Selecione um slide na faixa, edite os textos e, se quiser, mude o layout. Use “Slide” para acrescentar mais, e Subir/Descer para reordenar.",
          "Para fotos, toque em “Enviar imagem” (a foto é reduzida automaticamente) ou cole o endereço de uma imagem.",
        ],
      },
      {
        t: "steps",
        title: "O que o cliente vê",
        items: [
          "Você copia o link e envia por WhatsApp ou e-mail. O cliente abre sem precisar de login, lê e pode baixar o PDF.",
          "No contrato ele informa nome e CPF/CNPJ, marca a confirmação e toca em “Aceitar e assinar”. Ficam registrados data, horário, IP e navegador.",
          "Se algo precisa mudar, ele toca em “Pedir ajustes” e escreve uma mensagem — ela aparece no Histórico do documento e no negócio.",
        ],
      },
      {
        t: "list",
        title: "Situações do documento",
        items: [
          "Rascunho: você ainda pode editar. Salva sozinho enquanto digita.",
          "Enviado: o cliente vê a versão congelada. Para mudar, use “Reabrir para editar” e envie de novo.",
          "Aceito: travado. Para uma nova versão, use “Duplicar”.",
          "Cancelado: o link deixa de funcionar.",
        ],
      },
      { t: "tip", text: "Preencha uma vez em Ajustes → Dados do estúdio (CNPJ, endereço, responsável, foro) e no cadastro do contato (CPF/CNPJ e endereço). Assim os contratos saem completos." },
      { t: "warn", text: "Os modelos de contrato são um ponto de partida em linguagem simples. Peça a um advogado para revisar e adaptar antes de usar com clientes." },
      { t: "p", text: "Quem tem o nível Gerenciar também cria modelos próprios (“Salvar como modelo” dentro do documento) e cláusulas novas em “Modelos e cláusulas”, e pode excluir documentos." },
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
          "Gestor: toca a operação inteira (negócios, agenda, financeiro, documentos); vê a equipe, mas não altera acessos.",
          "Comercial: funil, contatos, agenda e documentos. Sem financeiro.",
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
    keywords: ["senha", "perfil", "etapas", "integração"],
    body: [
      {
        t: "list",
        items: [
          "Meu perfil e Senha: dados pessoais e troca de senha (mínimo de 8 caracteres).",
          "Integrações (administrador): o link do feed da agenda.",
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
    slug: "site",
    module: "Gestão",
    title: "Site: projetos, blog, vagas e imagens",
    summary: "Edite o site público do estúdio sem sair do sistema.",
    href: "/site",
    keywords: ["site", "projetos", "blog", "vagas", "imagens", "vídeo", "home", "publicar", "rascunho", "capa", "galeria"],
    body: [
      { t: "p", text: "O módulo Site edita o mesmo conteúdo do site público (estudiorestaura.com.br). Ao salvar, o site já é atualizado. O painel antigo do site (/admin) continua funcionando como reserva." },
      {
        t: "list",
        title: "O que dá para editar",
        items: [
          "Projetos: título, categoria, localização, ano, área, resumo, texto, capa e galeria. Arraste as fotos pela alça para ordenar e a estrela para escolher a capa. Na lista, arraste os projetos para mudar a ordem no site.",
          "Blog: artigos com resumo, texto, capa, categoria, data e rascunho.",
          "Vagas: descrição, requisitos (um por linha), tipo e local.",
          "Imagens: biblioteca de mídia (envie, renomeie, copie o link) e a imagem de cada seção da home.",
          "Textos e vídeo: abertura, manifesto, faixa de vídeo da home (URL de um .mp4) e introdução de Trabalhe conosco.",
        ],
      },
      {
        t: "steps",
        title: "Publicar um projeto novo",
        items: ["Abra Site > Projetos e toque em Novo projeto.", "Preencha os dados, escolha a capa e adicione as fotos da galeria.", "Ligue “Publicado” e toque em Salvar. Use “Ver no site” para conferir."],
      },
      { t: "tip", text: "Desligue “Publicado” para guardar como rascunho: o item não aparece no site. As imagens são comprimidas automaticamente antes do envio." },
      { t: "p", text: "Os textos longos são parágrafos simples (Enter cria um novo parágrafo), porque é assim que o site exibe. Permissões: Ver consulta, Editar publica e altera, Gerenciar exclui projetos, artigos, vagas e imagens." },
      { t: "warn", text: "Excluir um projeto, artigo ou vaga o remove do site na hora. Se só quer esconder, desligue “Publicado”." },
    ],
  },
  {
    slug: "drive",
    module: "Gestão",
    title: "Drive: arquivos e pastas dos clientes",
    summary: "Organize os links do Google Drive por cliente, negócio e projeto.",
    href: "/drive",
    keywords: ["drive", "google", "arquivos", "pastas", "links", "cliente", "favoritos", "conectar"],
    body: [
      { t: "p", text: "O Drive do sistema guarda os links das pastas e arquivos do Google Drive e os organiza em pastas do CRM, ligados a clientes, negócios e projetos. Nada é copiado: o arquivo continua no Google Drive e abre em nova aba." },
      {
        t: "steps",
        title: "Registrar a pasta de um cliente",
        items: ["No Google Drive, copie o link da pasta (Compartilhar > Copiar link).", "Em Drive > Arquivos, toque em Adicionar link e cole. O sistema detecta se é pasta, documento, planilha, apresentação, PDF…", "Escolha o cliente e/ou o negócio. A pasta passa a aparecer no bloco “Arquivos” do negócio e do contato."],
      },
      {
        t: "list",
        title: "Recursos",
        items: [
          "Pastas do CRM: crie quantas quiser; arraste um arquivo da lista para uma pasta (ou use Editar para mover, no celular).",
          "Busca em todas as pastas, filtros por tipo, favoritos e ordenação (mais recentes, nome, tipo).",
          "Visão em grade ou em lista.",
          "Remover do CRM não apaga nada do Google Drive.",
        ],
      },
      { t: "p", text: "A aba “Google Drive” (navegar e buscar direto no Drive, registrar com um clique) fica ativa quando o Google é conectado em Drive > Conexão. Isso depende das credenciais do Google Cloud, com passo a passo na própria tela. Quem tem o nível Gerenciar conecta e desconecta." },
      { t: "tip", text: "Enquanto o Google não está conectado, tudo o mais funciona normalmente com links." },
    ],
  },
  {
    slug: "planilhas",
    module: "Gestão",
    title: "Planilhas",
    summary: "Planilhas completas, parecidas com o Google Sheets: materiais, custos por projeto, orçamentos. Importam e exportam Excel.",
    href: "/planilhas",
    tour: "/planilhas",
    keywords: ["planilha", "excel", "xlsx", "xls", "ods", "csv", "sheets", "fórmula", "soma", "importar", "exportar", "materiais", "custo", "orçamento", "cronograma", "fluxo de caixa", "abas"],
    body: [
      { t: "p", text: "Planilhas é um módulo independente do Financeiro: serve para controle de materiais, custo por projeto, orçamento de obra, cronograma e o que mais precisar. A tela de edição ocupa a tela toda, com menus como os do Google Sheets." },
      {
        t: "steps",
        title: "Criar ou importar",
        items: [
          "Em Planilhas, toque em “Nova planilha” e escolha em branco ou um modelo: Controle de materiais, Custo por projeto, Orçamento de obra, Fluxo de caixa simples ou Cronograma.",
          "Para trazer uma planilha que já existe, toque em “Importar” (ou arraste o arquivo para a tela). Aceita .xlsx, .xls, .ods, .csv e .tsv do Excel, Google Sheets e LibreOffice, até 15 MB.",
          "Confira a prévia (abas, linhas, fórmulas) e toque em “Importar e abrir”. Você continua editando de onde parou: abas, valores, fórmulas, formatos de número, largura das colunas e, quando o arquivo traz, negrito, cores e células mescladas.",
          "Do Google Sheets: Arquivo → Fazer download → Microsoft Excel (.xlsx). Do Excel e do LibreOffice, basta salvar normalmente.",
        ],
      },
      {
        t: "list",
        title: "Editar",
        items: [
          "Clique (ou toque) numa célula e digite; Enter confirma e desce, Tab confirma e vai para a direita, Esc cancela, F2 ou duplo clique edita o que já existe. A barra de fórmulas mostra e edita o conteúdo.",
          "Setas movem; Shift+setas selecionam; Ctrl+setas pulam até a borda dos dados; Delete limpa. Ctrl+C, Ctrl+X, Ctrl+V copiam, recortam e colam — inclusive de e para o Excel e o Google Sheets. Ctrl+Z e Ctrl+Y desfazem e refazem.",
          "Alça de preenchimento: arraste o quadradinho no canto da seleção para copiar ou continuar uma série (1, 2, 3… ou Item 1, Item 2…). Ctrl+D e Ctrl+R preenchem para baixo e para a direita.",
          "Arraste a borda de um cabeçalho para mudar a largura da coluna ou a altura da linha. Clique com o botão direito (ou segure no celular) para inserir, excluir, ocultar e mais.",
          "Formatar: negrito, itálico, sublinhado, cores, bordas, alinhamento, quebra de texto, mesclar células, e formatos de número (número, moeda R$, porcentagem, data, hora, texto).",
          "Dados: ordenar A→Z/Z→A e “Criar um filtro” (a setinha de cada título filtra por valores). Ver → Congelar mantém linhas e colunas fixas ao rolar.",
          "Abas na base: toque no + para criar, dê dois cliques para renomear e use a setinha para duplicar, mover ou excluir. Arraste uma aba para reordenar.",
        ],
      },
      {
        t: "list",
        title: "Fórmulas",
        items: [
          "Comece com =. Nomes em português ou inglês: =SOMA(B2:B9) ou =SUM(B2:B9); separe argumentos com ; ou ,.",
          "Principais: SOMA, MÉDIA, MÍNIMO, MÁXIMO, CONT.VALORES, CONT.NÚM, SE, SOMASE, SOMASES, CONT.SE, PROCV, ÍNDICE, CORRESP, ARRED, HOJE, TEXTO, CONCATENAR, SEERRO, E, OU, DATA, ANO, MÊS e outras.",
          "Referências como A1, intervalos B2:B9, colunas inteiras (A:A), $ para fixar ($B$2) e outras abas: ='Custos obra'!B2.",
          "Ao inserir ou excluir linhas e colunas, as fórmulas se ajustam. Enquanto edita uma fórmula, clique (ou use as setas) em uma célula para inserir a referência.",
        ],
      },
      {
        t: "list",
        title: "Salvar, versões e compartilhar",
        items: [
          "Tudo é salvo sozinho poucos segundos depois de editar: o selo ao lado do nome mostra “Salvo”. Se outra pessoa salvar a mesma planilha ao mesmo tempo, o sistema avisa e deixa você escolher qual versão manter.",
          "Arquivo → Histórico de versões: o sistema guarda instantâneos automáticos e você pode restaurar um deles (o estado de agora também fica guardado) ou salvar uma versão manualmente.",
          "Arquivo → Fazer download: Excel (.xlsx, com fórmulas, formatos, cores e mesclagens), CSV para Excel Brasil (;), CSV internacional (,) e .tsv. Arquivo → Imprimir abre uma página limpa para imprimir ou salvar como PDF.",
          "Na lista, favorite com a estrela, duplique, renomeie e vincule a planilha a um negócio ou contato. A permissão Ver abre e baixa; Editar cria, edita e importa; Gerenciar também exclui.",
        ],
      },
      { t: "tip", text: "Arquivos .xls antigos entram com valores, formatos e mesclagens, mas as fórmulas viram valores. Para manter fórmulas e cores, salve o arquivo como .xlsx antes de importar." },
      { t: "warn", text: "Gráficos, imagens e formatação condicional de arquivos importados não são trazidos. As cores fixas e os valores são mantidos." },
    ],
  },
  {
    slug: "atalhos",
    module: "Começando",
    title: "Atalhos do teclado",
    summary: "Para quem usa o computador.",
    keywords: ["teclado", "atalho", "ctrl"],
    body: [{ t: "list", items: ["Ctrl+B (⌘B no Mac): recolher ou expandir o menu lateral.", "Esc: fechar janelas e o tour."] }],
  },
];

export const articleBySlug = (slug: string) => articles.find((a) => a.slug === slug);

export const faq: { q: string; a: string }[] = [
  { q: "Esqueci minha senha. E agora?", a: "Peça a um administrador para gerar uma nova senha provisória em Equipe e acessos (toque na sua pessoa → Gerar nova senha). No próximo login você cria uma senha nova só sua." },
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
      { title: "Bem-vinda ao Restaura Gestão", body: "Um app só para o dia a dia do estúdio: negócios, contatos, agenda e financeiro. Vamos ver o essencial em menos de 1 minuto." },
      { target: ["nav-negocios"], title: "Negócios", body: "O funil de vendas em formato de quadro. Arraste os cartões entre as etapas conforme o negócio avança." },
      { target: ["nav-agenda"], title: "Agenda", body: "Visitas, reuniões e prazos. Dá para sincronizar com o Google Agenda e com o iPhone." },
      { target: ["nav-financeiro", "nav-mais"], title: "Financeiro e mais", body: "Receitas, despesas e o caixa do mês ficam no menu. No celular, toque em “Mais” para ver tudo." },
      { target: ["sidebar-toggle"], title: "Menu recolhível", body: "No computador, este botão recolhe o menu lateral para deixar só os ícones e abrir mais espaço." },
      { target: ["theme-toggle"], title: "Tema claro ou escuro", body: "O visual padrão é claro. Se preferir, troque para o escuro aqui — a escolha fica salva neste aparelho." },
      { target: ["help-button"], title: "Ajuda sempre à mão", body: "Aqui você revê este tour, faz o tour de cada tela e abre a Central de ajuda com o passo a passo de tudo." },
    ],
  },
  "/": {
    label: "Tour do Painel",
    steps: [
      { target: ["dash-kpis"], title: "Números do dia", body: "Valor no funil, fechado no mês, e a receber. Toque em um número para abrir a tela dele." },
      { target: ["dash-funnel"], title: "Funil", body: "Quantos negócios e quanto dinheiro há em cada etapa." },
    ],
  },
  "/negocios": {
    label: "Tour de Negócios",
    steps: [
      { target: ["page-actions"], title: "Novo negócio", body: "Crie um negócio já escolhendo o cliente — ou cadastrando um novo na hora." },
      { target: ["kanban"], title: "O quadro", body: "Cada coluna é uma etapa. Arraste um cartão para mudar a etapa. No celular, segure o cartão um instante antes de arrastar. Deslize de lado para ver as outras etapas." },
      { title: "Dentro do negócio", body: "Toque em um cartão para ver histórico, tarefas, agenda e financeiro." },
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
  "/planilhas": {
    label: "Tour de Planilhas",
    steps: [
      { target: ["sheets-new"], title: "Nova planilha", body: "Comece em branco ou de um modelo: controle de materiais, custo por projeto, orçamento de obra, fluxo de caixa ou cronograma." },
      { target: ["sheets-import"], title: "Importar", body: "Traga arquivos do Excel, Google Sheets ou LibreOffice (.xlsx, .xls, .ods, .csv). Você vê uma prévia antes de confirmar e continua editando de onde parou." },
      { target: ["sheets-search"], title: "Buscar e ordenar", body: "Procure pelo nome, ordene por recentes, nome ou criação e filtre as favoritas." },
      { target: ["sheets-list"], title: "Suas planilhas", body: "Toque para abrir. No menu de cada uma: favoritar, renomear, duplicar, vincular a negócio ou contato, baixar em .xlsx ou excluir." },
    ],
  },
  "/planilhas/": {
    label: "Tour do editor de planilhas",
    steps: [
      { target: ["sheet-editor"], title: "Editor de planilhas", body: "Menus Arquivo, Editar, Ver, Inserir, Formatar e Dados, barra de ícones, barra de fórmulas e abas na base — como no Google Sheets. Tudo é salvo sozinho." },
      { title: "Editar e navegar", body: "Digite numa célula e use Enter, Tab e as setas. F2 edita, Ctrl+C/V copia e cola do Excel, Ctrl+Z desfaz. No celular, toque duas vezes na célula ou use a barra de fórmulas." },
      { title: "Fórmulas", body: "Comece com =, por exemplo =SOMA(B2:B9) ou =SE(B2>0;\"ok\";\"falta\"). Funcionam nomes em português e em inglês, intervalos, outras abas e $ para fixar referências." },
      { title: "Importar e exportar", body: "Arquivo → Fazer download exporta .xlsx (com fórmulas e formatos) e .csv. Arquivo → Histórico de versões restaura uma versão anterior." },
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
  "/tarefas": {
    label: "Tour de Tarefas",
    steps: [
      { target: ["task-boards"], title: "Quadros", body: "“Minhas tarefas” mostra tudo o que é seu. Os demais são quadros da equipe — crie um com “+ Quadro”." },
      { target: ["task-filters"], title: "Filtros e visões", body: "Busque pelo título, escolha a visão (Tabela, Lista, Kanban, Calendário ou Linha do tempo) e use Filtros e Organizar para filtrar, agrupar e ordenar. A visão fica salva em cada quadro." },
      { target: ["task-groups", "task-quick"], title: "Grupos e tarefas", body: "Digite o título na última linha do grupo e tecle Enter. Clique na bolinha para concluir; nas etiquetas coloridas para mudar situação e prioridade." },
    ],
  },
  "/documentos": {
    label: "Tour de Documentos",
    steps: [
      { target: ["page-actions"], title: "Novo documento", body: "Crie um contrato ou uma apresentação a partir de um modelo. Se escolher um negócio, os dados do cliente entram sozinhos." },
      { target: ["docs-list"], title: "Seus documentos", body: "Cada linha mostra a situação: rascunho, enviado, aceito ou cancelado. Use os filtros acima para achar mais rápido." },
    ],
  },
  "/documentos/": {
    label: "Tour do editor de documento",
    steps: [
      { target: ["doc-header"], title: "Título e situação", body: "O texto salva sozinho enquanto você escreve. Aqui também ficam o PDF, o link do cliente e o menu com duplicar, reabrir e cancelar." },
      { target: ["doc-tabs"], title: "Editar, Prévia e Histórico", body: "A Prévia mostra como o cliente verá, com os dados já preenchidos. O Histórico guarda quando foi enviado, visto e aceito." },
      { target: ["doc-side", "deck-strip"], title: "Variáveis, cláusulas e slides", body: "No contrato, insira variáveis e cláusulas prontas. Na apresentação, escolha e organize os slides." },
      { target: ["doc-send"], title: "Enviar ao cliente", body: "Congela esta versão e gera o link. O cliente lê, baixa o PDF e aceita online." },
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
