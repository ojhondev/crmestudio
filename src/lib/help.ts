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
          "Agende uma visita técnica na Agenda e conecte o Google Agenda para vê-la no seu celular.",
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
        items: ["Abra crm.estudiorestaura.com.br no Safari.", "Toque no botão de compartilhar (quadrado com seta).", "Escolha “Adicionar à Tela de Início” e confirme."],
      },
      {
        t: "steps",
        title: "No Android (Chrome)",
        items: ["Abra crm.estudiorestaura.com.br no Chrome.", "Toque nos três pontinhos no canto superior.", "Escolha “Instalar aplicativo” (ou “Adicionar à tela inicial”)."],
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
          "Avisos (canto superior direito, ou logo abaixo da saudação no celular): atrasadas, o que vence hoje e amanhã, leads sem follow-up, negócios parados e ações recentes da equipe. Recolhível. Veja “Avisos e o sino”.",
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
    summary: "Visitas, reuniões, obras e prazos, sincronizados nos dois sentidos com o seu Google Agenda.",
    href: "/agenda",
    tour: "/agenda",
    keywords: ["calendário", "google", "google agenda", "meet", "convite", "iphone", "visita", "ics", "sincronizar", "conectar"],
    body: [
      { t: "p", text: "A agenda do estúdio mostra o mês inteiro e uma lista dos próximos compromissos." },
      { t: "steps", title: "Criar um evento", items: ["Toque em um dia (ou em “Evento”).", "Dê um título, escolha o tipo (reunião, visita técnica, obra, prazo) e o horário.", "Vincule a um negócio ou contato para o evento aparecer no histórico deles."] },
      {
        t: "steps",
        title: "Ligar ao seu Google Agenda (vai e volta)",
        items: [
          "Na Agenda, toque em “Google Agenda” e depois em “Conectar Google Agenda”.",
          "Entre com a sua conta Google e aceite a permissão. Cada pessoa conecta a própria conta.",
          "Pronto: criamos no seu Google uma agenda separada chamada “Estúdio Restaura”. O que você cria, muda ou apaga aqui aparece lá, e o que você faz lá aparece aqui.",
        ],
      },
      {
        t: "list",
        title: "Bom saber",
        items: [
          "Só a agenda “Estúdio Restaura” é sincronizada. Sua agenda pessoal do Google não é lida nem alterada.",
          "Aparece só o que é seu: eventos em que você é o responsável.",
          "Atualiza ao abrir a Agenda, ao salvar um evento, no botão “Sincronizar agora” e sozinha a cada 15 minutos.",
          "Se você mudar o mesmo evento dos dois lados, vale a alteração mais recente.",
          "Se apagar um evento no Google, aqui ele fica marcado como “cancelado” (nada é perdido). Apagar aqui apaga lá.",
          "Em “Google Agenda” você escolhe quais tipos de evento enviar (reunião, visita, obra, prazo, outro).",
          "Para parar: “Desconectar”. Você escolhe se os eventos ficam no Google ou são removidos de lá. O CRM nunca perde nada.",
        ],
      },
      {
        t: "steps",
        title: "Link do Google Meet e convites por e-mail",
        items: [
          "Ao criar ou editar um evento (com o Google conectado), aparece o quadro “Google Agenda”.",
          "Ligue “Criar link do Google Meet” para gerar a sala. O link aparece no evento.",
          "Ligue “Convidar participantes por e-mail” e informe os e-mails; o contato do evento também é convidado. O Google envia o convite ao salvar.",
          "As duas opções vêm desligadas: ninguém recebe e-mail sem você querer.",
        ],
      },
      {
        t: "steps",
        title: "Só ver a agenda no celular (alternativa)",
        items: ["Toque em “Assinar por link”.", "No iPhone/Mac, toque em “Abrir no Calendário”. No Google Agenda, copie o link e use Outras agendas → Do URL.", "Os eventos aparecem lá, mas é só visualização: o que for criado lá não volta para cá."],
      },
      { t: "warn", text: "Aparece “a API do Google Agenda ainda não foi ativada”? É um ajuste único do administrador no Google Cloud (ativar a Google Calendar API). Avise quem cuida do sistema." },
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
          "Defina o “Gestor / supervisor”: ele recebe os avisos de atraso e negócios parados da pessoa. Sem gestor, os administradores recebem.",
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
    slug: "avisos",
    module: "Operação",
    title: "Avisos e o sino",
    summary: "O sino no topo, a página Avisos, o quadro AVISOS do Painel e as suas preferências.",
    href: "/notificacoes",
    tour: "/notificacoes",
    keywords: ["notificação", "notificacoes", "sino", "aviso", "alerta", "menção", "silenciar", "preferências", "lido"],
    body: [
      { t: "p", text: "O sistema avisa você, dentro do próprio app, do que precisa de atenção: tarefa atrasada, prazo chegando, lead parado, alguém que concluiu ou comentou algo seu. Cada fato gera um aviso só — você nunca recebe o mesmo aviso duas vezes." },
      {
        t: "list",
        title: "Onde os avisos aparecem",
        items: [
          "Sino no topo: o número mostra os não lidos. Toque para abrir a gaveta, filtre (Todas, Não lidas, Tarefas, Leads e negócios), toque num aviso para ir direto ao item ou em “Marcar todas como lidas”. A lista atualiza sozinha a cada cerca de 1 minuto e quando você volta para a aba.",
          "Página Avisos (gaveta do sino → Ver todas): histórico completo, filtro por tipo, só não lidas, seleção para marcar como lida ou arquivar, e “Carregar mais”.",
          "Quadro AVISOS no Painel: resumo do que o sistema mapeou — atrasadas, vencem hoje e amanhã, leads sem follow-up, negócios parados, previsão vencida, valor alto parado e ações recentes de colegas. Pode ser recolhido (a escolha fica neste aparelho).",
        ],
      },
      {
        t: "list",
        title: "Quem vê o quê",
        items: [
          "Administradores e gestores (quem gerencia Tarefas) veem a visão da equipe toda.",
          "Quem é gestor/supervisor de alguém (campo em Equipe e acessos) vê a si e às pessoas que respondem a ele.",
          "Os demais veem só o que lhes diz respeito. Parceiros (“ver só os próprios”) veem apenas as próprias tarefas e os próprios negócios.",
        ],
      },
      {
        t: "steps",
        title: "Escolher o que receber",
        items: [
          "Abra a página Avisos e a aba Preferências (ou o ícone de engrenagem na gaveta do sino).",
          "Desligue as categorias que não quer (ex.: “Mudança de etapa”).",
          "Para uma pausa total, ligue “Silenciar todos os avisos”. Os fatos continuam registrados: ao voltar você não recebe uma enxurrada de avisos antigos.",
        ],
      },
      { t: "tip", text: "Mencione um colega em um comentário de tarefa com @nome (ex.: @Maria) para ele ser avisado na hora." },
    ],
  },
  {
    slug: "editais",
    module: "Operação",
    title: "Editais de restauro",
    summary: "Licitações de restauro (projeto e obra) em órgãos federais, estaduais e prefeituras, encontradas no PNCP e filtradas para valer a pena olhar.",
    href: "/editais",
    tour: "/editais",
    keywords: ["edital", "licitação", "pncp", "pregão", "concorrência", "dispensa", "restauro", "tombado", "patrimônio", "oportunidade", "buscar", "github", "proposta"],
    body: [
      { t: "p", text: "A página Editais lista oportunidades de RESTAURO publicadas no PNCP (Portal Nacional de Contratações Públicas), que cobre União, estados e municípios. Um filtro por regras mantém só o que parece restauro de patrimônio — projeto de restauro, execução de obra, laudo e consultoria — e descarta o ruído (restauração dentária, florestal ou de pavimento, manutenção predial comum, energia solar, compra de material, tombamento patrimonial de móveis etc.)." },
      {
        t: "list",
        title: "O que você vê em cada edital",
        items: [
          "Relevância de 0 a 100: Alta (70+), Boa (50+) e Possível (35+). O padrão mostra só 50 ou mais.",
          "Tipo: projeto de restauro, execução (obra), projeto + execução, laudo/consultoria.",
          "Órgão, esfera (federal, estadual, municipal), UF e município, modalidade, valor estimado e as datas.",
          "Prazo de propostas: em terracota quando faltam 7 dias ou menos.",
          "“Por que apareceu aqui”: os termos que casaram, para você auditar a triagem.",
        ],
      },
      {
        t: "steps",
        title: "Buscar oportunidades",
        items: [
          "Toque em Buscar oportunidades. O pedido é registrado e uma varredura rápida já roda no próprio sistema (cerca de 30 segundos).",
          "O pedido também aciona o GitHub: a cada 30 minutos ele verifica se há pedido pendente e faz a varredura completa (todas as propostas abertas do PNCP). Isso pode levar até cerca de 30 minutos para começar.",
          "A faixa acima da lista mostra o andamento (solicitada, executando, concluída), os números e o link da execução no GitHub.",
          "Todo dia, às 06:17, a varredura completa roda sozinha, mesmo sem pedido.",
        ],
      },
      {
        t: "steps",
        title: "Triar um edital",
        items: [
          "Toque no edital para abrir os detalhes: objeto completo, datas, links para o PNCP e para o portal onde se envia a proposta.",
          "Marque Interessante, Em análise, Proposta enviada, Ganho ou Perdido. Quem marca assume o edital e recebe os lembretes de prazo.",
          "Descarte com um motivo (fora do escopo, valor baixo, longe, exige acervo técnico que não temos…). Ele some da lista, mas dá para ver em Filtros → Triagem.",
          "Use Criar negócio para abrir o contato do órgão e o negócio já com valor, local e link; marque a opção para criar também a tarefa “Enviar proposta” com o prazo.",
          "Ou use Criar tarefa com o prazo, se só quer o lembrete.",
        ],
      },
      {
        t: "list",
        title: "Filtros, estados e exportação",
        items: [
          "Chips de tipo (Projeto, Execução, Laudo) e contadores por estado: toque para filtrar.",
          "Em Filtros: busca por palavra, esfera, UFs, município, faixa de valor, prazo (“encerra em até X dias”), situação, triagem, responsável e relevância mínima.",
          "A ordem pode ser por prazo, relevância, valor ou mais recentes.",
          "Exportar CSV baixa a lista com os mesmos filtros da tela (abre direto no Excel).",
        ],
      },
      {
        t: "list",
        title: "Avisos e automações",
        items: [
          "Edital novo com relevância 70 ou mais avisa quem tem acesso a Editais (regra pronta; ajuste a relevância em Automações).",
          "Edital marcado como interessante ou em análise avisa o responsável 7, 3 e 1 dia antes do fim do prazo.",
          "O Painel mostra o bloco “Oportunidades de restauro” com os novos e os que encerram em 7 dias.",
        ],
      },
      { t: "tip", text: "Nenhum edital é enviado, proposto ou assinado por este sistema: ele só encontra e organiza. A proposta é feita no portal do órgão." },
      { t: "warn", text: "O PNCP às vezes demora ou recusa conexões. Se a varredura rápida parar no meio, a completa do GitHub cobre o resto e se retoma sozinha." },
    ],
  },
  {
    slug: "automacoes",
    module: "Sistema",
    title: "Automações",
    summary: "Regras “Quando… e… então…” entre tarefas, negócios, pessoas e datas.",
    href: "/automacoes",
    tour: "/automacoes",
    keywords: ["automação", "regra", "gatilho", "follow-up", "atrasada", "cron", "supervisor", "gestor", "ação"],
    body: [
      { t: "p", text: "Automações são regras que trabalham por você. Cada regra tem três partes: QUANDO acontece algo (gatilho), E em que condições (opcional) e ENTÃO o que fazer (ações). O sistema já traz regras prontas — você liga, desliga e ajusta os prazos." },
      {
        t: "list",
        title: "Regras prontas de tarefas",
        items: [
          "Tarefa atrasada: avisa o responsável e o gestor dele.",
          "Prazo se aproximando: 1 dia antes e no dia (você escolhe os dias).",
          "Tarefa concluída: avisa quem criou, o gestor e quem comentou.",
          "Tarefa atribuída ou reatribuída: avisa a pessoa que recebeu.",
          "Tarefa travada: avisa o gestor e quem criou.",
          "Comentários e menções (@nome).",
          "Tarefa sem responsável por mais de 24 h.",
          "Tarefa recorrente gerada.",
        ],
      },
      {
        t: "list",
        title: "Regras prontas de leads e negócios",
        items: [
          "Lead novo e lead sem primeiro contato em X horas (padrão: 4 h).",
          "Negócio parado na mesma etapa há X dias (padrão: 7) — com prazo diferente por etapa, se quiser.",
          "Negócio sem atividade ou contato há X dias (padrão: 5).",
          "Previsão de fechamento vencida ou chegando (3 dias antes e no dia).",
          "Negócio ganho e negócio perdido.",
          "Valor alto parado (padrão: a partir de R$ 50 mil, 3 dias parado).",
          "Editais: edital novo relevante (a partir de 70) e prazo de edital de interesse chegando (7, 3 e 1 dia antes).",
          "Desligadas por padrão: criar tarefa de follow-up em negócio parado, criar tarefa de primeiro contato em lead novo e aviso a cada mudança de etapa.",
        ],
      },
      {
        t: "steps",
        title: "Ajustar uma regra ou criar a sua",
        items: [
          "Abra Automações (menu Sistema). Use o interruptor do cartão para ligar ou desligar.",
          "Toque em “Ajustar” para mudar prazos, condições (ex.: só prioridade alta, só negócios acima de R$ 20 mil), quem recebe o aviso e o texto da mensagem.",
          "Em “Nova regra”, escolha o gatilho, as condições e as ações: avisar pessoas ou papéis, mudar situação ou prioridade, atribuir responsável, criar tarefa de follow-up e adicionar etiqueta.",
          "Acompanhe tudo na aba Registro: cada execução mostra a regra, o item e o que foi feito.",
        ],
      },
      {
        t: "list",
        title: "Gestor / supervisor",
        items: [
          "Em Equipe e acessos, cada pessoa tem o campo “Gestor / supervisor”. É ele quem recebe os avisos de atraso, travas e negócios parados daquela pessoa.",
          "Sem gestor definido, os avisos vão para todos os administradores.",
        ],
      },
      {
        t: "list",
        title: "Como e quando as regras rodam",
        items: [
          "Regras de evento (concluir, atribuir, comentar, lead novo, mudar de etapa) disparam na hora, quando alguém faz a ação.",
          "Regras de tempo (atraso, prazo, parado) rodam todo dia de manhã e também quando alguém abre o Painel ou o sino atualiza (no máximo uma rodada a cada 15 minutos). Quem tem permissão de gerenciar pode tocar em “Rodar agora”.",
          "Nada é avisado duas vezes: cada fato (ex.: a tarefa X venceu em 17/10) é registrado e a regra não age de novo sobre ele.",
          "Mudanças feitas por automações não disparam outras automações (evita laços infinitos) e ficam no histórico da tarefa.",
        ],
      },
      { t: "warn", text: "Permissão: ver as regras e o registro exige “Configurações do sistema” em Ver; ligar, editar, criar, excluir e rodar exige Gerenciar (perfil Administrador). Toda mudança fica na trilha de Atividade em Equipe e acessos." },
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
  { q: "A agenda do Google não mostra um evento que criei.", a: "Se você conectou o Google Agenda, toque em Google Agenda → Sincronizar agora e procure a agenda “Estúdio Restaura”; só aparecem eventos em que você é o responsável. Se usa o link de assinatura, o Google atualiza a cada algumas horas." },
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
      { target: ["bell"], title: "Avisos", body: "O sino mostra o que precisa de atenção: tarefas atrasadas, prazos, leads parados, menções. Toque num aviso para ir direto ao item." },
      { target: ["help-button"], title: "Ajuda sempre à mão", body: "Aqui você revê este tour, faz o tour de cada tela e abre a Central de ajuda com o passo a passo de tudo." },
    ],
  },
  "/": {
    label: "Tour do Painel",
    steps: [
      { target: ["dash-kpis"], title: "Números do dia", body: "Valor no funil, fechado no mês, e a receber. Toque em um número para abrir a tela dele." },
      { target: ["dash-avisos"], title: "Avisos", body: "O resumo do que o sistema mapeou: atrasadas, o que vence hoje e amanhã, leads sem follow-up, negócios parados e o que os colegas fizeram. Administradores e gestores veem a equipe; os demais, só o que lhes diz respeito. Dá para recolher." },
      { target: ["dash-funnel"], title: "Funil", body: "Quantos negócios e quanto dinheiro há em cada etapa." },
      { target: ["dash-editais"], title: "Oportunidades de restauro", body: "Editais novos e relevantes e os que encerram em 7 dias (aparece para quem tem acesso a Editais)." },
    ],
  },
  "/editais": {
    label: "Tour dos Editais",
    steps: [
      { target: ["edital-scan"], title: "Buscar oportunidades", body: "Pede a varredura do PNCP: uma busca rápida roda na hora e o GitHub faz a completa (até cerca de 30 minutos para começar). Todo dia ela roda sozinha." },
      { target: ["edital-run"], title: "Andamento", body: "Mostra se a varredura foi solicitada, está rodando ou terminou, com quantos editais novos e o link da execução no GitHub." },
      { target: ["edital-kpis"], title: "Resumo", body: "Abertos relevantes, novos da semana, os que encerram em 7 dias e os que você acompanha. Toque para filtrar." },
      { target: ["edital-tipos", "edital-ufs"], title: "Tipo e estado", body: "Separe projeto de restauro de execução de obra, e toque num estado para ver só ele." },
      { target: ["edital-filters"], title: "Filtros precisos", body: "Esfera, município, faixa de valor, prazo, situação, triagem, responsável e relevância mínima." },
      { target: ["edital-list", "edital-list-m"], title: "Os editais", body: "Relevância, órgão, local, tipo, valor e prazo (em terracota quando faltam 7 dias ou menos). Toque para abrir os detalhes, marcar a triagem e criar negócio ou tarefa." },
    ],
  },
  "/notificacoes": {
    label: "Tour dos Avisos",
    steps: [
      { target: ["notif-tabs"], title: "Avisos e preferências", body: "Em Avisos fica o histórico (filtre por tipo, marque como lido ou arquive). Em Preferências você escolhe quais tipos receber ou silencia tudo." },
      { target: ["bell"], title: "O sino", body: "Atualiza sozinho a cada cerca de 1 minuto. Toque num aviso para abrir o item." },
    ],
  },
  "/automacoes": {
    label: "Tour das Automações",
    steps: [
      { target: ["auto-tabs"], title: "Regras e Registro", body: "Em Regras você liga, desliga e ajusta. No Registro vê tudo o que cada regra fez, com data e hora." },
      { target: ["auto-rule"], title: "Quando… e… então…", body: "Cada cartão resume a regra numa frase. O interruptor liga ou desliga; “Ajustar” muda prazos, condições, quem recebe e a mensagem." },
      { target: ["auto-new"], title: "Nova regra", body: "Monte a sua: escolha o gatilho, as condições e as ações (avisar, mudar situação ou prioridade, atribuir, criar tarefa de follow-up, etiquetar)." },
      { target: ["auto-run"], title: "Rodar agora", body: "As regras de tempo rodam sozinhas todo dia e quando alguém abre o sistema. Este botão força uma rodada na hora; nada é avisado duas vezes." },
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
      { target: ["page-actions"], title: "Google Agenda", body: "Conecte o seu Google Agenda: o que você marca aqui aparece lá e o que marca lá volta para cá. “Assinar por link” só mostra a agenda, sem editar." },
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
