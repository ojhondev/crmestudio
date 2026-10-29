import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IN_DEVELOPMENT } from "@/lib/modules-status";
import { CheckCircle2, CircleSlash, Link2, Unplug } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { DriveTabs } from "@/components/drive/drive-tabs";
import { DisconnectButton } from "@/components/drive/disconnect-button";
import { Button } from "@/components/ui/button";
import { googleStatus } from "@/lib/drive";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Conexão com o Drive" };

const ERRORS: Record<string, string> = {
  nao_configurado: "As credenciais do Google ainda não foram configuradas no servidor.",
  negado: "A autorização foi negada no Google.",
  estado: "A conexão expirou ou foi interrompida. Tente conectar de novo.",
  troca: "O Google recusou a conexão. Confira o ID e o segredo do cliente e a URI de redirecionamento.",
};

const STEPS = [
  "Acesse console.cloud.google.com, crie um projeto (ex.: “Restaura Gestão”) e ative a API “Google Drive API” em APIs e serviços > Biblioteca.",
  "Em “Tela de permissão OAuth”, escolha tipo Interno (se a conta for Google Workspace) ou Externo em modo de teste e adicione os e-mails da equipe. Inclua os escopos drive.file e drive.readonly.",
  "Em Credenciais > Criar credenciais > ID do cliente OAuth, escolha “Aplicativo da Web”. Em “URIs de redirecionamento autorizados”, cadastre exatamente a URI abaixo.",
  "Copie o ID do cliente e a chave secreta e crie na Vercel (projeto restaura-app) as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (e, se quiser fixar o endereço, GOOGLE_REDIRECT_URI). Faça um novo deploy.",
  "Volte a esta tela, clique em “Conectar Google Drive” e autorize com a conta do estúdio. Pronto: a aba “Google Drive” passa a navegar e buscar no Drive de verdade.",
];

export default async function ConexaoPage({ searchParams }: PageProps<"/drive/conexao">) {
  if (IN_DEVELOPMENT.drive) redirect("/");
  const user = await requireAccess("drive");
  const sp = await searchParams;
  const st = await googleStatus();
  const canManage = has(user, "drive", "manage");
  const erro = typeof sp.erro === "string" ? ERRORS[sp.erro] : null;
  const base = process.env.GOOGLE_REDIRECT_URI || "https://crm.estudiorestaura.com.br/api/drive/callback";

  return (
    <>
      <PageToolbar title="Drive" tabs={<DriveTabs />} />
      <div className="mx-auto grid max-w-3xl gap-4 p-3 sm:p-5">
        {sp.ok && <p className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-4 py-2.5 text-[13px]">Google Drive conectado.</p>}
        {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[13px]">{erro}</p>}

        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${st.connected ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
              {st.connected ? <CheckCircle2 className="size-5" /> : <CircleSlash className="size-5" />}
            </span>
            <div className="grid flex-1 gap-0.5">
              <h2 className="text-[15px] font-medium">{st.connected ? "Google Drive conectado" : "Não conectado"}</h2>
              <p className="text-[13px] text-muted-foreground">
                {st.connected
                  ? `Conta ${st.email ?? "Google"}${st.since ? ` · desde ${fmtDateTime(st.since)}` : ""}.`
                  : st.configured
                    ? "As credenciais existem. Falta autorizar a conta do estúdio."
                    : "As credenciais do Google ainda não foram configuradas. Enquanto isso, a aba “Arquivos” funciona normalmente com links do Drive."}
              </p>
            </div>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {st.connected ? (
                <DisconnectButton />
              ) : (
                <Button asChild disabled={!st.configured}>
                  <a href="/api/drive/connect" aria-disabled={!st.configured} className={st.configured ? "" : "pointer-events-none opacity-50"}>
                    <Link2 /> Conectar Google Drive
                  </a>
                </Button>
              )}
              {st.connected && (
                <Button asChild variant="outline">
                  <a href="/api/drive/connect">
                    <Unplug /> Reconectar
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Só quem gerencia o Drive pode conectar ou desconectar.</p>
          )}
        </section>

        {!st.connected && (
          <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-[15px] font-medium">Como conectar em 5 passos</h2>
            <ol className="grid gap-2.5 text-[13px]">
              {STEPS.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <div className="grid gap-1 rounded-lg bg-muted px-3 py-2 text-xs">
              <span className="text-muted-foreground">URI de redirecionamento autorizada</span>
              <code className="break-all select-all">{base}</code>
            </div>
            <p className="text-xs text-muted-foreground">Os tokens ficam criptografados no banco (AES-256). O app pede acesso a arquivos criados por ele e leitura do Drive; nunca altera arquivos existentes sem você pedir.</p>
          </section>
        )}
      </div>
    </>
  );
}
