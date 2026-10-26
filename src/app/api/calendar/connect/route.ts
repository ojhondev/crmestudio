import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { redirectUriFor } from "@/lib/drive";
import { CAL_STATE_COOKIE, calendarAuthUrl, googleConfigured, newState } from "@/lib/calendar/oauth";

/** Inicia a conexão da PRÓPRIA pessoa com o Google Agenda. Volta em /api/drive/callback (URI já autorizada no Google Cloud). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  if (!has(user, "agenda")) return NextResponse.redirect(new URL("/?negado=1", url.origin));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/agenda?google=nao_configurado", url.origin));

  const state = newState();
  const res = NextResponse.redirect(calendarAuthUrl(redirectUriFor(url.origin), state, user.email));
  res.cookies.set(CAL_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api", maxAge: 600 });
  return res;
}
