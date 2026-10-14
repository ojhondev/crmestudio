import "server-only";

/**
 * WhatsApp Business Platform (Cloud API da Meta).
 * Sem credenciais, roda em modo "simulado": mensagens ficam só no app.
 *
 * Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN,
 *      WHATSAPP_APP_SECRET (assinatura do webhook), WHATSAPP_API_VERSION (opcional)
 */
const VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

export const whatsappConnected = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** A Meta só aceita texto livre até 24h após a última mensagem do cliente. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const insideWindow = (lastInboundAt: Date | null) =>
  !whatsappConnected() || (!!lastInboundAt && Date.now() - lastInboundAt.getTime() < WINDOW_MS);

type SendResult = { ok: true; id: string | null; status: string } | { ok: false; error: string };

export async function sendText(to: string, body: string): Promise<SendResult> {
  if (!whatsappConnected()) return { ok: true, id: null, status: "local" };
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body },
      }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error?.message || `Erro ${res.status} da Meta` };
    return { ok: true, id: json?.messages?.[0]?.id ?? null, status: "sent" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo com o App Secret). */
export async function validSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // sem segredo configurado, não há como validar
  if (!header?.startsWith("sha256=")) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Texto legível para tipos de mensagem não-texto. */
export function describeIncoming(m: Record<string, unknown> & { type?: string }): string {
  const t = m.type;
  const get = (k: string) => (m[k] as Record<string, unknown> | undefined) ?? {};
  switch (t) {
    case "text":
      return String(get("text").body ?? "");
    case "button":
      return String(get("button").text ?? "[botão]");
    case "interactive": {
      const i = get("interactive") as Record<string, Record<string, unknown>>;
      return String(i.button_reply?.title ?? i.list_reply?.title ?? "[resposta interativa]");
    }
    case "image":
      return `📷 Imagem${get("image").caption ? `: ${get("image").caption}` : ""}`;
    case "video":
      return `🎬 Vídeo${get("video").caption ? `: ${get("video").caption}` : ""}`;
    case "audio":
      return "🎤 Áudio";
    case "document":
      return `📎 Documento${get("document").filename ? `: ${get("document").filename}` : ""}`;
    case "location":
      return `📍 Localização${get("location").name ? `: ${get("location").name}` : ""}`;
    case "sticker":
      return "Figurinha";
    case "reaction":
      return `Reagiu ${get("reaction").emoji ?? ""}`;
    default:
      return `[mensagem do tipo ${t ?? "desconhecido"}]`;
  }
}
