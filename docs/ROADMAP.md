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

## Fase 3 — Financeiro v2
- **Dashboard**: receita × despesa por mês, fluxo de caixa, a receber/pagar, inadimplência,
  receita por serviço/origem, ticket médio, previsão (negócios ponderados por etapa).
- **Planilha própria** (grade editável, otimizada para toque): lançamentos em linhas, filtros,
  colar várias linhas, duplicar, parcelar. **Exporta CSV** (UTF-8 com BOM e `;` — abre direto no
  Excel BR e no Google Sheets) e **importa CSV** de volta.
- Categorias e contas configuráveis; conciliação simples (pago/recebido).

## Fase 4 — Central de Atendimento (WhatsApp + E-mail)
- Caixa única por contato: WhatsApp e e-mail na mesma linha do tempo, filtros por canal.
- E-mail via **Gmail API** (Google Workspace do estúdio): receber, responder, anexos, assinatura.
  🔑 precisa criar um app OAuth no Google Cloud (eu guio passo a passo; ~10 min).
- WhatsApp Business: Cloud API oficial (já implementada em modo simulado). 🔑 credenciais da Meta.
- Respostas rápidas, modelos, atribuição, status, notas internas, SLA (tempo sem resposta).
- Ana: resumo, resposta sugerida, e-mail redigido, classificação de intenção.

## Fase 5 — Documentos
- **Gerador de contratos**: modelos (restauro, projeto, laudo, consultoria), editor de texto
  rico próprio com **variáveis** (`{{cliente.nome}}`, `{{negocio.valor}}`, `{{valor.extenso}}`…),
  biblioteca de cláusulas, versões, geração de PDF, envio por link, status (rascunho → enviado → aceito).
- **Gerador de apresentação comercial**: editor de slides próprio (16:9, também usável no celular),
  blocos (capa, escopo, cronograma, portfólio do site, investimento, condições), tema do estúdio,
  puxa dados do negócio, exporta PDF e gera **link público** de visualização.
- Assinatura eletrônica: v1 = aceite por link + PDF. Integração Clicksign/ZapSign = opcional depois.

## Fase 6 — CMS do site dentro do CRM
Projetos, blog, vagas, seções/imagens, vídeo da home e configurações passam a ser editados aqui
(`/site/...`). O CRM conecta ao banco e ao armazenamento de imagens do site; o `/admin` do site
é desativado depois da validação. Leads do site já chegam ao CRM.

## Transversal
- PWA: instalar no celular, abrir em tela cheia, ícone próprio, áreas seguras (notch).
- Desempenho no celular (listas paginadas, imagens otimizadas), acessibilidade (contraste nos 2 temas).
- Notificações (e-mail de lead novo, tarefa vencendo) — 🔑 serviço de envio de e-mail.

## Decisões tomadas (podem ser revistas)
- PDF de contratos/apresentações gerado a partir do mesmo HTML do editor (fidelidade total).
- CSV em vez de .xlsx nativo: abre no Excel e no Sheets sem perder acentos nem separador.
- CMS: o CRM acessa o banco do site (sem migrar dados agora).
