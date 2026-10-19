import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, has, type SessionUser } from "@/lib/auth";
import {
  ANA_MODEL,
  ANA_SYSTEM,
  anaClient,
  anaEnabled,
  buildSnapshot,
  contactContext,
  conversationTranscript,
  dealContext,
} from "@/lib/ana";

export const maxDuration = 120;

/** A Ana só lê o que a pessoa que pergunta pode ver. */
async function canSeeDeal(user: SessionUser, dealId: string) {
  if (!has(user, "negocios")) return false;
  if (!user.ownOnly) return true;
  return partnerCanSee(user.id, dealId);
}

async function partnerCanSee(userId: string, dealId: string) {
  const [d] = await db
    .select({ id: schema.deals.id })
    .from(schema.deals)
    .where(and(eq(schema.deals.id, dealId), or(eq(schema.deals.partnerId, userId), eq(schema.deals.ownerId, userId))));
  return !!d;
}

const Body = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("chat"),
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
      .min(1)
      .max(40),
    focus: z.object({ kind: z.enum(["deal", "contact", "conversation"]), id: z.string().uuid() }).nullish(),
  }),
  z.object({ mode: z.enum(["summary", "reply"]), conversationId: z.string().uuid(), hint: z.string().max(1000).optional() }),
  z.object({
    mode: z.literal("email"),
    conversationId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    hint: z.string().max(1000).optional(),
  }),
]);

const INSTRUCTIONS = {
  summary: `Resuma esta conversa para alguém da equipe que vai assumir o atendimento agora. Formato:
**Resumo** — 2 a 3 frases.
**O que o cliente quer** — lista curta.
**Pendências e próximos passos** — lista curta, com quem deve agir.
**Tom do cliente** — uma linha (ex.: interessado, com pressa, inseguro com valores).`,
  reply: `Sugira a PRÓXIMA mensagem de WhatsApp que o estúdio deve enviar a este cliente. Escreva só o texto da mensagem, pronto para colar: natural, curto (até ~5 linhas), cordial, sem assinatura formal e no máximo um emoji se combinar. Se faltar uma informação essencial para responder, faça a pergunta certa ao cliente em vez de inventar.`,
  email: `Redija um e-mail profissional do Estúdio Restaura relacionado a este contexto. Formato exato:
Assunto: <assunto>

<corpo do e-mail, com saudação e despedida "Atenciosamente,\\nEstúdio Restaura">
Não invente valores, prazos ou datas que não estejam nos dados; use [colchetes] para o que a equipe precisa completar.`,
} as const;

function textStream(produce: (push: (s: string) => void) => Promise<void>) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          await produce((s) => controller.enqueue(enc.encode(s)));
        } catch (e) {
          console.error("[ana]", e);
          const msg =
            e instanceof Anthropic.RateLimitError
              ? "\n\n(A Ana está sobrecarregada agora — tente em alguns segundos.)"
              : e instanceof Anthropic.AuthenticationError
                ? "\n\n(Chave da Anthropic inválida — confira ANTHROPIC_API_KEY.)"
                : "\n\n(Não consegui concluir a resposta. Tente novamente.)";
          controller.enqueue(enc.encode(msg));
        } finally {
          controller.close();
        }
      },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
  );
}

/** Atendimento foi retirado da interface: conversas ficam fora do alcance da Ana. */
const inboxOn = (): boolean => false;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.mustChangePassword) return new Response("Não autenticado", { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Pedido inválido", { status: 400 });
  const body = parsed.data;

  if (!anaEnabled())
    return textStream(async (push) =>
      push("Ainda não estou conectada. Peça ao administrador para configurar a chave **ANTHROPIC_API_KEY** no servidor e eu passo a responder por aqui."),
    );

  let messages: Anthropic.Beta.BetaMessageParam[];
  let effort: "low" | "medium" = "medium";

  if (body.mode === "chat") {
    const snapshot = await buildSnapshot(user);
    let focusText = "";
    if (body.focus) {
      if (body.focus.kind === "deal" && (await canSeeDeal(user, body.focus.id))) focusText = (await dealContext(body.focus.id)) ?? "";
      else if (body.focus.kind === "contact" && has(user, "contatos") && !user.ownOnly) focusText = (await contactContext(body.focus.id)) ?? "";
      else if (body.focus.kind === "conversation" && inboxOn()) {
        const t = await conversationTranscript(body.focus.id);
        focusText = t ? `${t.header}\n${t.body}` : "";
      }
    }
    const history = body.messages.slice(0, -1);
    const last = body.messages[body.messages.length - 1];
    messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<dados_do_sistema>\n${snapshot}${focusText ? `\n\nREGISTRO ABERTO NA TELA:\n${focusText}` : ""}\n</dados_do_sistema>`,
          },
          { type: "text", text: last.content },
        ],
      },
    ];
  } else {
    const parts: string[] = [];
    if ("conversationId" in body && body.conversationId) {
      if (!inboxOn()) return new Response("Atendimento indisponível", { status: 403 });
      const t = await conversationTranscript(body.conversationId);
      if (!t) return new Response("Conversa não encontrada", { status: 404 });
      parts.push(`${t.header}\n${t.body}`);
    }
    if (body.mode === "email" && body.dealId) {
      if (!(await canSeeDeal(user, body.dealId))) return new Response("Sem acesso ao negócio", { status: 403 });
      const d = await dealContext(body.dealId);
      if (d) parts.push(d);
    }
    if (!parts.length) return new Response("Sem contexto", { status: 400 });
    if (body.mode === "reply") effort = "low";
    messages = [
      {
        role: "user",
        content: `<contexto>\n${parts.join("\n\n")}\n</contexto>\n\n${INSTRUCTIONS[body.mode]}${body.hint ? `\n\nOrientação da equipe: ${body.hint}` : ""}`,
      },
    ];
  }

  return textStream(async (push) => {
    const stream = anaClient().beta.messages.stream({
      model: ANA_MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: ANA_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort },
      // Se o classificador de segurança recusar, o servidor tenta o modelo recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    } as Anthropic.Beta.MessageCreateParamsStreaming);
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") push(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") push("\n\n(Não posso ajudar com esse pedido específico.)");
  });
}
