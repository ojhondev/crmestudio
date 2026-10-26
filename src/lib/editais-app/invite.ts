/**
 * Convite de parceiro (puro): texto pronto, links de WhatsApp / mailto e o estado do convite.
 */

export type InviteState = "pendente" | "aceito" | "revogado";
export const INVITE_LABEL: Record<InviteState, string> = { pendente: "Convite pendente", aceito: "Aceito", revogado: "Revogado" };

/** Estado derivado: revogado (revokedAt) > aceito (já entrou alguma vez) > pendente. */
export function inviteState(p: { revokedAt: Date | string | null; lastLoginAt: Date | string | null }): InviteState {
  if (p.revokedAt) return "revogado";
  if (p.lastLoginAt) return "aceito";
  return "pendente";
}

export type InviteChannel = "email" | "manual";
export const CHANNEL_LABEL: Record<InviteChannel, string> = { email: "Enviado por e-mail", manual: "Pendente de envio (manual)" };

export type InviteInput = {
  partnerName: string;
  partnerEmail: string;
  inviterName: string;
  /** endereço do app, ex.: https://crm.estudiorestaura.com.br */
  origin: string;
  /** senha provisória (só no momento de criar / gerar nova); some depois */
  tempPassword?: string | null;
};

export const SUBJECT = "Convite — você foi convidado para o app Editais do Estúdio Restaura";

export function inviteLink(origin: string) {
  return `${origin.replace(/\/+$/, "")}/login`;
}

/** Texto do convite. Prioriza o Google; explica também e-mail + senha provisória. */
export function inviteText(i: InviteInput): string {
  const first = i.partnerName.trim().split(/\s+/)[0] || "";
  const link = inviteLink(i.origin);
  const lines = [
    `Olá${first ? `, ${first}` : ""}!`,
    "",
    `${i.inviterName} convidou você para trabalhar com o Estúdio Restaura nos editais de restauro, no app Editais.`,
    "Lá você vê só o que a equipe compartilhar com você: o edital, as tarefas que são suas e a conversa de cada proposta.",
    "",
    "Como entrar (2 jeitos):",
    "",
    `1) Com o Google (o mais fácil): abra ${link} e toque em “Entrar com Google”, usando a conta do e-mail ${i.partnerEmail}.`,
    "",
    i.tempPassword
      ? `2) Com e-mail e senha provisória: abra ${link}, entre com ${i.partnerEmail} e a senha provisória ${i.tempPassword}. No primeiro acesso o sistema pede para você criar a sua senha.`
      : `2) Com e-mail e senha: abra ${link} e entre com ${i.partnerEmail}. Se ainda não tem senha, peça uma provisória à equipe.`,
    "",
    "O app funciona bem no celular — dá para salvar na tela inicial.",
    "",
    "Qualquer dúvida, é só responder esta mensagem.",
    "Estúdio Restaura",
  ];
  return lines.join("\n");
}

/** Versão HTML simples do mesmo convite (e-mail). */
export function inviteHtml(i: InviteInput): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = inviteText(i)
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const link = inviteLink(i.origin);
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1c1c;max-width:560px">${body}<p style="margin:20px 0"><a href="${esc(link)}" style="background:#a34c1f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Abrir o app Editais</a></p></div>`;
}

/** wa.me só com dígitos; sem telefone, abre a escolha de contato. */
export function whatsappLink(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length >= 10 && digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full.length >= 12 ? full : ""}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(to: string, subject: string, text: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
