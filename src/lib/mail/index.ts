/**
 * Envio de e-mail com PROVEDOR PLUGÁVEL.
 *
 *  - Com `RESEND_API_KEY` e remetente (`MAIL_FROM`, ou `RESEND_FROM`) no ambiente → envia de verdade pelo Resend.
 *  - Sem eles → `sendMail` devolve `{ ok:false, reason:"sem_provedor" }` e quem chamou usa o plano B
 *    (mostrar o texto pronto + link para copiar / WhatsApp / mailto e registrar "pendente de envio").
 *
 * Sem dependências de servidor/Next: roda nos testes. O `fetch` é injetável.
 */

export type MailMessage = { to: string; subject: string; text: string; html?: string; replyTo?: string };

export type MailResult =
  | { ok: true; provider: string; id: string | null }
  | { ok: false; provider: string | null; reason: "sem_provedor" | "invalido" | "erro"; error?: string };

export interface MailProvider {
  readonly name: string;
  send(msg: MailMessage): Promise<MailResult>;
}

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 200 && EMAIL.test(v.trim());

/** Provedor Resend (API HTTP, sem SDK). */
export function resendProvider(apiKey: string, from: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): MailProvider {
  return {
    name: "resend",
    async send(msg) {
      if (!isEmail(msg.to)) return { ok: false, provider: "resend", reason: "invalido", error: "E-mail de destino inválido." };
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [msg.to.trim()], subject: msg.subject, text: msg.text, html: msg.html, reply_to: msg.replyTo }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false, provider: "resend", reason: "erro", error: `Resend respondeu ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
        }
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, provider: "resend", id: data.id ?? null };
      } catch (e) {
        return { ok: false, provider: "resend", reason: "erro", error: e instanceof Error ? e.message : "Falha de rede" };
      }
    },
  };
}

/** Escolhe o provedor pelo ambiente; null = nenhum configurado (plano B). */
export function getMailProvider(env: Env = process.env, fetchImpl?: FetchLike): MailProvider | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = (env.MAIL_FROM || env.RESEND_FROM)?.trim();
  if (key && from) return resendProvider(key, from, fetchImpl);
  return null;
}

export const mailConfigured = (env: Env = process.env) => !!getMailProvider(env);

export async function sendMail(msg: MailMessage, provider: MailProvider | null = getMailProvider()): Promise<MailResult> {
  if (!isEmail(msg.to)) return { ok: false, provider: provider?.name ?? null, reason: "invalido", error: "E-mail de destino inválido." };
  if (!provider) return { ok: false, provider: null, reason: "sem_provedor" };
  return provider.send(msg);
}
