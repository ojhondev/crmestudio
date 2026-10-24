# Restaura Gestão — roadmap (v2)

Meta: **uma operação só** para o Estúdio Restaura, no celular primeiro.
Endereço: **gestao.estudiorestaura.com.br** (o antigo `app.` redireciona para ele).

Legenda: ✅ pronto · 🟡 em andamento · ⬜ a fazer · 🔑 depende de algo do Estúdio

## Fase 1 — Fundação e identidade
| Item | Status |
|---|---|
| Domínio gestao.estudiorestaura.com.br (+ redirect do `app.`) | ✅ |

> Manutenção: ao criar ou mudar uma funcionalidade, atualizar o artigo em `src/lib/help.ts` e o roteiro do tour da tela.
| Favicon e ícone do app (PWA: instalar na tela inicial do celular) | ✅ |
| Tema **claro / escuro / automático** | ✅ |
| **Sidebar recolhível** (modo ícones com o "R" da marca) | ✅ |
| **Barra de menu inferior** estilo app nativo (celular) + "Mais" | ✅ |
| Hierarquia tipográfica: títulos leves, **números em destaque** pesados, rótulos | ✅ |
| Telas existentes revisadas para toque: Kanban com colunas deslizantes e conversa em tela cheia ✅ · tabelas de contatos/financeiro e formulários em cartões/gavetas ⬜ |
| Ajuda: botão "?" global, **tour guiado** (boas-vindas + 1 por tela), central de documentação (`/ajuda`) com busca e FAQ | ✅ |

## Fase 2 — Acessos ✅ (entregue 2026-10-19)
Feito: **perfis + permissão por módulo** (nenhum / ver / editar / gerenciar), regra no servidor em todas as telas e ações, tela Equipe e acessos com matriz, aba Atividade (auditoria), senha provisória com troca obrigatória, sessões revogáveis e bloqueio de tentativas de login.
Perfis prontos: Administrador · Gestor · Comercial · Atendimento · Financeiro · Parceiro.
Cada pessoa pode ter permissões ajustadas individualmente. Filtro de dados continua no servidor
(parceiro vê só os negócios dele). Trilha de auditoria (quem mudou o quê) para financeiro e contratos.

## Fase 3 — Financeiro v2 ✅ (entregue 2026-10-19)
- **Dashboard**: receita × despesa por mês, fluxo de caixa, a receber/pagar, inadimplência,
  receita por serviço/origem, ticket médio, previsão (negócios ponderados por etapa).
- **Planilha própria** (grade editável, otimizada para toque): lançamentos em linhas, filtros,
  colar várias linhas, duplicar, parcelar. **Exporta CSV** (UTF-8 com BOM e `;` — abre direto no
  Excel BR e no Google Sheets) e **importa CSV** de volta.
- Categorias e contas configuráveis; conciliação simples (pago/recebido).

## Fase 4 — Central de Atendimento (WhatsApp + E-mail) — Atendimento: retirado por ora (tela removida da interface; tabelas conversations/messages e webhook /api/whatsapp/webhook mantidos)
- Caixa única por contato: WhatsApp e e-mail na mesma linha do tempo, filtros por canal.
- E-mail via **Gmail API** (Google Workspace do estúdio): receber, responder, anexos, assinatura.
  🔑 precisa criar um app OAuth no Google Cloud (eu guio passo a passo; ~10 min).
- WhatsApp Business: Cloud API oficial (já implementada em modo simulado). 🔑 credenciais da Meta.
- Respostas rápidas, modelos, atribuição, status, notas internas, SLA (tempo sem resposta).
- Ana: resumo, resposta sugerida, e-mail redigido, classificação de intenção.

## Fase 5 — Documentos ✅ (entregue 2026-10-19)
- **Gerador de contratos**: modelos (restauro, projeto, laudo, consultoria), editor de texto
  rico próprio com **variáveis** (`{{cliente.nome}}`, `{{negocio.valor}}`, `{{valor.extenso}}`…),
  biblioteca de cláusulas, versões, geração de PDF, envio por link, status (rascunho → enviado → aceito).
- **Gerador de apresentação comercial**: editor de slides próprio (16:9, também usável no celular),
  blocos (capa, escopo, cronograma, portfólio do site, investimento, condições), tema do estúdio,
  puxa dados do negócio, exporta PDF e gera **link público** de visualização.
- Assinatura eletrônica: v1 = aceite por link + PDF. Integração Clicksign/ZapSign = opcional depois.

**Como ficou:** `/documentos` (lista, filtros, novo documento), `/documentos/[id]` (editor Tiptap com variáveis,
cláusulas e campos do contrato; editor de slides 1280×720; prévia; histórico/versões), `/documentos/modelos`
(modelos próprios + cláusulas), `/p/[token]` (página pública: leitura, PDF, aceite com nome/CPF/IP/navegador,
"pedir ajustes", rastreio de visualização). PDF via Chromium (`puppeteer-core` + `@sparticuz/chromium`; local usa
`CHROME_PATH`); `?formato=html` na rota do PDF devolve a versão para impressão. Dados do estúdio em
Ajustes; CPF/CNPJ e endereço no contato. Ao enviar, o conteúdo é **congelado** (snapshot) e aceito = travado.
Pendente (opcional): bloco "portfólio do site" nas apresentações (depende da Fase 6 / `SITE_DATABASE_URL`) e
upload de imagens em Blob (hoje: imagem reduzida embutida ou URL https).

## Passada de contraste e clareza ✅ (2026-10-19)
- Contraste validado por cálculo (WCAG, ≥ 4,5:1 para texto) nos dois temas: acento `#a34c1f` (5,8:1 sobre branco), texto
  secundário 7:1+, etiquetas de situação/prioridade com texto claro no tema claro e escuro no tema escuro (`--on-st`, `--on-brand`).
- Texto mínimo de 12 px em todo o app; alvos de toque ≥ 40 px no celular (botões, campos, abas, menus, linhas de Tarefas).
- Estados vazios com instrução (Negócios, Agenda, Atendimento, Tarefas, Kanban de tarefas, quadro sem grupos), descrições nos
  cabeçalhos de Agenda e Ajustes, foco visível em tudo.
- Tarefas dentro de negócios/contatos: concluir sincroniza `status` (`doneAt` segue como fonte de "concluída") e mostram
  situação/prioridade; botão de excluir visível no toque.

## Planilhas ✅ (entregue 2026-10-19)
Módulo independente do Financeiro (permissão `planilhas`), muito parecido com o Google Sheets. Serve para materiais, custo por projeto, orçamento de obra, fluxo de caixa e cronograma.
- **Lista** `/planilhas`: busca, ordenação (recentes/nome/criação), favoritas, nova em branco ou de **modelo** (Controle de materiais, Custo por projeto, Orçamento de obra, Fluxo de caixa simples, Cronograma), **importar** (arrastar e soltar, prévia antes de confirmar), duplicar, renomear, vincular a negócio/contato, excluir (Gerenciar).
- **Editor** `/planilhas/[id]` em tela cheia: menus Arquivo/Editar/Ver/Inserir/Formatar/Dados, barra de ícones, caixa de nome + barra de fórmulas, abas na base. Grade **virtualizada** (milhares de linhas fluidas), seleção, edição inline, teclado como no Sheets, copiar/colar TSV de e para Excel/Sheets, alça de preenchimento (séries e fórmulas), redimensionar, inserir/excluir/ocultar linhas e colunas, congelar, ordenar, filtrar por valores, formatação (negrito/itálico/sublinhado/tachado, cores, bordas, alinhamento, quebra, mesclar), formatos (número, moeda R$, %, data, hora, texto), abas (criar/renomear/duplicar/mover/excluir), tema claro/escuro, toque no celular (toque duplo edita; barra de fórmulas).
- **Fórmulas**: motor próprio (sem dependência), nomes em português **e** inglês, `;` ou `,`, intervalos, `$`, outras abas, ajuste automático ao inserir/excluir linhas e colunas. Cobre SOMA, MÉDIA, MÍNIMO, MÁXIMO, CONT.VALORES, CONT.NÚM, SE, SOMASE(S), CONT.SE(S), PROCV, ÍNDICE, CORRESP, ARRED, HOJE, TEXTO, CONCATENAR, SEERRO, E/OU, DATA e mais.
- **Importar**: `.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv` (≤ 15 MB, processado no servidor): abas, valores, fórmulas, formatos de número, largura de colunas, negrito/cores/bordas e mesclagens. `.xls` entra com valores (fórmulas viram valores). **Exportar**: `.xlsx` (fórmulas, formatos, estilos, mesclagens, congelamento), CSV Brasil (`;`), CSV internacional, `.tsv`; imprimir/PDF pelo navegador.
- **Dados**: tabelas `sheets`, `sheet_tabs` (grade esparsa em jsonb) e `sheet_versions`. **Autosave** com indicador "Salvo", **controle de versão otimista** (conflito pergunta o que manter) e **histórico** com instantâneos automáticos e restauração. Auditoria em criar/importar/excluir/exportar/restaurar.
- Limitações conhecidas: gráficos, imagens e formatação condicional não são importados; sem edição simultânea em tempo real (conflito simples); no Vercel o corpo de uma requisição é limitado a ~4,5 MB (importações maiores precisam de upload direto ao Blob).

## Fase 6 — CMS do site + Drive ✅ (entregue 2026-10-19)
**Site** (`/site`, permissão `site`): projetos (capa, galeria arrastável, destaque, ordem por arrastar), blog (rascunho/publicado, data,
capa), vagas, imagens (biblioteca de mídia + imagem de cada seção da home) e textos/vídeo da home. O CRM usa um cliente separado
(`src/lib/site-db.ts`, `SITE_DATABASE_URL`) com cópia do schema do site (`src/lib/site-schema.ts`; nunca rodar db:push nele). Uploads são
comprimidos no navegador e vão para o Vercel Blob do site (`SITE_BLOB_READ_WRITE_TOKEN`), registrados na tabela `media`. Após salvar, o CRM chama
`POST {SITE_URL}/api/revalidate` (segredo `SITE_REVALIDATE_SECRET` = `REVALIDATE_SECRET` do site) porque a home do site é estática. Textos longos são
parágrafos simples, como o site exibe. O `/admin` do site continua ativo (desativar só depois de validar). Pendente: contatos do rodapé estão fixos no código do site; e
blog/projeto com formatação rica exigiria mudar a renderização do site.

**Drive** (`/drive`, permissão `drive`): camada `DriveProvider` (`src/lib/drive`) com `links` (ativo hoje: links do Drive registrados por URL,
tipo detectado, pastas virtuais do CRM, vínculo a cliente/negócio/projeto, busca, favoritos, grade/lista, arrastar para mover, bloco “Arquivos”
no negócio e no contato) e `google` (API REST v3 + OAuth2, tokens criptografados em `drive_connections`; **pronto, aguardando credenciais** 🔑
GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — passo a passo em /drive/conexao). Auditoria em todas as ações.

## Avisos e Automações ✅ (entregue 2026-10-19)
Sistema de avisos dentro da plataforma + motor de regras "Quando… e… então…" entre tarefas, negócios, pessoas e datas.
- **Avisos (`notifications`)**: tabela com usuário destino, tipo, título, corpo, link, entidade/id, lido/arquivado, criado em e **chave de deduplicação** (única por pessoa). **Sino** no topo (contador de não lidos, gaveta com filtros, marcar lida/todas, abrir o item), página **/notificacoes** (mobile-first: filtro por tipo, só não lidas, seleção, arquivar, carregar mais) e **preferências** por pessoa (`notification_prefs`: silenciar tudo e desligar categorias; avisos silenciados são gravados já arquivados para a chave continuar valendo). Atualiza sozinho: polling de ~60 s e ao focar a aba (`GET /api/notificacoes`).
- **Gestor/supervisor**: novo campo `users.supervisor_id` editável em Equipe e acessos (sem ciclos; auditado). Sem gestor, os administradores recebem os avisos da pessoa.
- **Motor** (`src/lib/automations.ts` puro + `automations-engine.ts`): 18 gatilhos (tarefa atrasada, prazo chegando, sem responsável, concluída, atribuída/reatribuída, travada, comentário/menção, recorrente gerada; lead novo, mudou de etapa, ganho, perdido, parado na etapa, sem atividade, previsão vencida/próxima, lead sem primeiro contato, valor alto parado), condições (E) por prioridade, situação, etiqueta, responsável, etapa, valor, serviço, título; ações: avisar pessoas/papéis (responsável, criador, seguidores, mencionados, dono, parceiro, gestor, administradores, pessoa específica), mudar situação/prioridade, atribuir, criar tarefa de follow-up, adicionar etiqueta. 20 regras prontas (3 desligadas: follow-up automático em negócio parado, tarefa de primeiro contato, aviso a cada mudança de etapa).
- **Tela /automacoes** (menu Sistema): cartões com interruptor, frase "Quando… e… então…", editor visual (gatilho, prazos configuráveis — inclusive **prazo por etapa do funil** —, condições, ações, mensagem personalizável com variáveis), regras próprias, restaurar padrão, **Registro** de execuções e "Rodar agora". Permissão: reutiliza **Configurações do sistema** (Ver = consulta; Gerenciar = liga/edita/cria/exclui/roda). Auditoria em toda mudança.
- **Execução e idempotência**: eventos disparam na própria ação (`after()`, sem atrasar a tela). Regras de tempo: **Vercel Cron diário** (`vercel.json` → `/api/cron/automacoes`, `Authorization: Bearer CRON_SECRET`) **e** rodada preguiçosa (≤ 1 a cada 15 min, reservada no banco) quando alguém abre o Painel ou o sino atualiza. Cada fato é reservado em `automation_runs` com chave única (regra + fato): o mesmo fato nunca age nem avisa duas vezes; lembretes repetidos só a cada período (ex.: negócio parado a cada X dias). Mudanças feitas por automações não disparam outras (sem laços).
- **Painel**: quadro **AVISOS** (canto superior direito em tela larga; abaixo da saudação no celular; recolhível): atrasadas (minhas e da equipe), vencem hoje/amanhã, sem responsável, leads sem follow-up, negócios parados, previsão vencida, valor alto parado e ações recentes. Administrador/gestor vê a equipe; supervisor vê a si e sua equipe direta; demais, só o que lhes diz respeito; "só os próprios" só vê os próprios.
- Testes: `npm run test:automations` (251 verificações). Ajuda: artigos "Avisos e o sino" e "Automações" + tours do sino, /notificacoes, /automacoes e do quadro AVISOS.
- Pendências conhecidas: o aviso de tarefa abre o quadro da tarefa (não há deep link para abrir a gaveta da tarefa); avisos por e-mail/WhatsApp/push continuam em 🔑 (Transversal); sem "seguidores" explícitos em tarefa (usa quem comentou).

## Editais de restauro ✅ (entregue 2026-10-24)
Módulo **/editais**: oportunidades de licitação de RESTAURO (projeto e execução) em órgãos federais, estaduais e prefeituras, vindas do **PNCP**.
- **Coleta** (`src/lib/editais/`, puro, roda na Vercel e no GitHub Actions): `pncp.ts` (busca textual do portal `/api/search` — fonte principal e rápida — e consulta oficial `contratacoes/proposta`, varrendo todas as propostas abertas como rede de segurança; retry com espera crescente, `Retry-After`, 429 com pausas longas, `HttpError`/`DeadlineError`), `scan.ts` (orquestra, deduplica, **retomável** por cursor), `triage.ts` (regras sem IA), `oidc.ts`, `ingest.ts` (servidor), `queries.ts`, `filters.ts`.
- **Triagem por regras**: mascara o ruído (restauração dental/florestal/de pavimento, “obras de arte especiais”, tombamento patrimonial de bens móveis, energia solar, talha elétrica, forro de gesso, endereço “Centro Histórico”, capela mortuária…), pesa o COMEÇO do objeto, exige termo forte (restauro, técnicas como retábulo/douramento/pintura mural) ou contexto de patrimônio + obra/projeto; “iphan/iepha” sozinhos não contam; compra de bens e assuntos vizinhos (ICMS Patrimônio, show, camisetas…) são penalizados. Nota 0–100 (Alta ≥70, Boa ≥50, Possível ≥35), termos casados guardados para auditoria, tipo projeto × execução × projeto+execução × laudo. A nota é SEMPRE recalculada no servidor.
- **Gatilho GitHub sem segredos**: `.github/workflows/editais.yml` (cron de 30 min só consulta `/api/editais/pending`; cron diário 06:17 BRT roda a completa; `workflow_dispatch` com dias/fonte). Autentica com o **token OIDC do GitHub Actions** (`id-token: write`); `/api/editais/ingest` valida assinatura (JWKS do GitHub), emissor, audiência, repositório, branch, evento e o arquivo do workflow. O botão **Buscar oportunidades** grava um pedido (`edital_runs` “solicitada”) e roda já uma varredura rápida (≈ 30 s, `after()` + maxDuration 60); se existirem `GITHUB_DISPATCH_TOKEN` + `GITHUB_REPO`, também dispara o workflow na hora. A tela acompanha o estado (solicitada/executando/concluída, novos, link da execução) com polling de 5 s.
- **Tabelas**: `edital_sources`, `editais`, `edital_events` (histórico), `edital_runs` (pedidos, rodadas, estatísticas, cursor de retomada).
- **Telas**: busca, filtros (tipo, esfera, UF, município, valor, prazo, situação, triagem, responsável, relevância), ordenação, contadores por UF, cartões no celular/tabela no desktop, gaveta de detalhe (objeto, termos, links, triagem com motivo de descarte, responsável, anotações, **criar negócio** com contato do órgão + tarefa do prazo, histórico), **Exportar CSV**, bloco “Oportunidades de restauro” no Painel.
- **Permissão** `editais` (ver/editar/gerenciar): administrador e gestor gerenciam, comercial edita, demais sem acesso. **Automações**: “Novo edital de restauro relevante” (≥ 70, só editais publicados nos últimos 3 dias) e “Edital de interesse encerrando” (7, 3 e 1 dia antes), ambas desligáveis; auditoria em pedidos de busca, triagem, negócio e exportação.
- **Variáveis** (todas opcionais): `GITHUB_DISPATCH_TOKEN` (PAT fine-grained, só este repositório, Actions: Read and write) + `GITHUB_REPO` (padrão `ojhondev/crmestudio`) para resposta instantânea do botão; `EDITAIS_OIDC_AUDIENCE` (padrão `https://crm.estudiorestaura.com.br`), `EDITAIS_GITHUB_REPO`, `EDITAIS_WORKFLOW_FILE`, `EDITAIS_ALLOWED_REFS` para trocar as travas do OIDC. Nenhum segredo é necessário no GitHub.
- **Testes**: `npm run test:editais` (209 verificações: casos reais do PNCP positivos e negativos, normalização, coleta com fetch simulado, retomada, filtros, OIDC com chaves de teste) e `npm run test:editais:db` (idempotência da gravação no banco). Varredura local: `npm run editais:scan -- --days 14 --source busca|consulta|tudo` (grava no banco do `.env.local`) ou `scripts/editais-scan.ts --dry --out arquivo.json`.
- Pendências: Compras.gov.br não foi incluído (o PNCP já cobre a União); o PNCP limita requisições (429) — a varredura completa da consulta oficial leva dezenas de minutos e se retoma sozinha a cada 30 min.

## Transversal
- PWA: instalar no celular, abrir em tela cheia, ícone próprio, áreas seguras (notch).
- Desempenho no celular (listas paginadas, imagens otimizadas), acessibilidade (contraste nos 2 temas).
- Passada mobile (2026-10-19): ✅ alvos de toque ≥ 44px e campos em 16px (sem zoom do iOS) por CSS global; barra de ferramentas com ações primeiro e fade lateral; menu lateral com botão de fechar; Agenda com lista do dia; Contatos e Lançamentos em cartões até 1024px; formulários em gaveta inferior com botão fixo; editor de contrato com gaveta de variáveis/cláusulas; Kanban com snap por coluna. Pendente: testar arrastar com pressão longa em aparelho real e as telas Tarefas/Planilhas/Site/Drive (outra frente).
- Avisos dentro da plataforma: ✅ (ver Avisos e Automações). Falta o envio por e-mail/WhatsApp/push — 🔑 serviço de envio.

## Decisões tomadas (podem ser revistas)
- PDF de contratos/apresentações gerado a partir do mesmo HTML do editor (fidelidade total).
- CSV em vez de .xlsx nativo: abre no Excel e no Sheets sem perder acentos nem separador.
- CMS: o CRM acessa o banco do site (sem migrar dados agora).
