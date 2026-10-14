import { revalidatePath } from "next/cache";
import { describeIncoming, validSignature } from "@/lib/whatsapp";
import { recordInbound, updateMessageStatus } from "@/lib/inbox";

/** Verificação do webhook (painel da Meta → WhatsApp → Configuração). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type WaValue = {
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: (Record<string, unknown> & { from: string; id: string; timestamp: string; type: string })[];
  statuses?: { id: string; status: string }[];
};

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: { entry?: { changes?: { value?: WaValue }[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v) continue;
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        await recordInbound({
          phone: m.from,
          name: names.get(m.from),
          body: describeIncoming(m),
          waMessageId: m.id,
          at: new Date(Number(m.timestamp) * 1000),
        });
      }
      for (const s of v.statuses ?? []) await updateMessageStatus(s.id, s.status);
    }
  }
  revalidatePath("/", "layout");
  // A Meta exige 200 rápido; qualquer outro status gera reenvio.
  return new Response("OK", { status: 200 });
}
