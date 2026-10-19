@AGENTS.md

# Restaura App — gestão do Estúdio Restaura

App interno (CRM + atendimento WhatsApp + agenda + financeiro + copiloto "Ana") do
Estúdio Restaura. Domínio alvo: **app.estudiorestaura.com.br**. Site institucional
fica em outro repo (`A:\Claude Code\estudiorestaura`) — logos/cores vieram de lá.

## Stack
- Next.js 16.4 (App Router, Server Actions, Turbopack). **`cacheComponents` desligado**
  de propósito: tudo é autenticado e dinâmico; mutações chamam `revalidatePath("/", "layout")`.
- Tailwind v4 + shadcn/ui (preset radix-nova). Tema em `src/app/globals.css`
  (carvão `#1c1c1c` + acento ember `#b75928`, Montserrat + Lora).
- Neon Postgres + Drizzle (`src/lib/db/schema.ts`). `npm run db:push` aplica o schema.
- Ana = Claude (`@anthropic-ai/sdk`, modelo `claude-opus-5-5`, streaming, `fallbacks: "default"`).
- Dev: `npm run dev` → porta **3021** (entrada `restaura-app` em `A:\Claude Code\Velo\.claude\launch.json`).

## Regras do projeto
- **Fuso horário**: o servidor roda em UTC. Toda formatação de data passa por
  `src/lib/format.ts` (fixo em America/Sao_Paulo via `@date-fns/tz`). Nunca usar
  `format()` do date-fns direto em componente — dá erro de hidratação.
  `<input type="datetime-local">` → `parseLocalInput()`.
- **Nada de `Intl` com `notation: "compact"`** (difere Node × navegador). Use `moneyShort()`.
- Dinheiro sempre em **centavos** (`*_cents`), telefones no formato wa_id (`5511999990000`).
- Papéis: `admin` (tudo), `equipe` (sem gestão de contas), `parceiro` (só negócios onde é
  `partnerId`/`ownerId`, agenda própria; sem atendimento/financeiro/contatos). Toda server
  action revalida o papel no servidor (`requireUser`, `assertDealAccess`, `dealScope`).
  Consultas que não são actions ficam em `src/lib/*` — nunca exportar consulta de um arquivo `"use server"`.
- WhatsApp: Cloud API oficial da Meta (`src/lib/whatsapp.ts`). Sem `WHATSAPP_TOKEN` +
  `WHATSAPP_PHONE_NUMBER_ID` roda em **modo simulado** (mensagens só no app, botão
  "Simular cliente"). Webhook: `/api/whatsapp/webhook`. Mensagem nova de número
  desconhecido cria o contato automaticamente (origem WhatsApp).
- Agenda: feed `.ics` privado por usuário em `/api/agenda/<calendarToken>` (Google/iPhone/Outlook).
- Dados de exemplo: `npm run db:demo` (origem "exemplo"); removíveis em Ajustes.
- Seed inicial: `npm run db:seed` (etapas + admin; senha provisória vai para `.cache/acesso-inicial.txt`, fora do git).

## Env (Vercel + `.env.local`)
`DATABASE_URL` (+ vars Neon), `AUTH_SECRET`, `ANTHROPIC_API_KEY`,
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
