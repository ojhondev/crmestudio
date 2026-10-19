import "server-only";
import { googleConfigured, googleProvider, getConnection } from "./google";
import { linksProvider } from "./links";
import type { DriveProvider } from "./types";

export { linksProvider, googleProvider };
export const providers: Record<"links" | "google", DriveProvider> = { links: linksProvider, google: googleProvider };

/** Estado da integração com o Google (para a tela de conexão). */
export async function googleStatus() {
  const configured = googleConfigured();
  const conn = configured ? await getConnection() : null;
  return {
    configured,
    connected: !!conn?.accessTokenEnc,
    email: conn?.accountEmail ?? null,
    since: conn?.createdAt ?? null,
  };
}

/** URI de retorno do OAuth (cadastrar igual no Google Cloud). */
export const redirectUriFor = (origin: string) => process.env.GOOGLE_REDIRECT_URI || `${origin}/api/drive/callback`;
