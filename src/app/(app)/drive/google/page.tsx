import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { DriveTabs } from "@/components/drive/drive-tabs";
import { KindIcon } from "@/components/drive/kind-icon";
import { RegisterButton } from "@/components/drive/register-button";
import { googleProvider } from "@/lib/drive";
import { googleStatus } from "@/lib/drive";
import { KIND_LABEL } from "@/lib/drive/detect";
import type { DriveEntry } from "@/lib/drive/types";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Google Drive" };

export default async function GoogleDrivePage({ searchParams }: PageProps<"/drive/google">) {
  const user = await requireAccess("drive");
  const sp = await searchParams;
  const st = await googleStatus();
  const pasta = typeof sp.pasta === "string" && /^[\w-]{5,}$/.test(sp.pasta) ? sp.pasta : null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";

  let entries: DriveEntry[] = [];
  let error: string | null = null;
  if (st.connected) {
    try {
      entries = q ? await googleProvider.search(q) : await googleProvider.listFolder(pasta);
    } catch (e) {
      error = e instanceof Error ? e.message : "Não foi possível ler o Google Drive.";
    }
  }

  return (
    <>
      <PageToolbar
        title="Drive"
        tabs={<DriveTabs />}
        filters={
          st.connected && (
            <form className="flex gap-2" action="/drive/google">
              <input name="q" defaultValue={q} placeholder="Buscar no Google Drive…" aria-label="Buscar no Google Drive" className="h-9 w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
            </form>
          )
        }
      />
      <div className="mx-auto grid max-w-4xl gap-3 p-3 sm:p-5">
        {!st.connected ? (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
            <p className="text-sm font-medium">Google Drive não conectado</p>
            <p className="max-w-md text-[13px] text-muted-foreground">Quando a conexão estiver ativa, você navega e busca no Drive aqui e registra pastas e arquivos no CRM com um clique. Veja como conectar em Conexão.</p>
            <Link href="/drive/conexao" className="text-[13px] text-brand underline-offset-2 hover:underline">
              Ir para Conexão
            </Link>
          </div>
        ) : error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[13px]">{error}</p>
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-[13px] text-muted-foreground">Nada aqui.</p>
        ) : (
          <ul className="grid gap-1.5">
            {pasta && !q && (
              <li>
                <Link href="/drive/google" className="text-[13px] text-muted-foreground hover:text-foreground">
                  ← Voltar ao início do Drive
                </Link>
              </li>
            )}
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
                <KindIcon kind={e.kind} />
                {e.isFolder ? (
                  <Link href={`/drive/google?pasta=${e.id}`} className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[13.5px] font-medium">{e.name}</span>
                    <span className="text-xs text-muted-foreground">Pasta{e.modifiedAt ? ` · ${fmtDate(e.modifiedAt)}` : ""}</span>
                  </Link>
                ) : (
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[13.5px] font-medium">{e.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {KIND_LABEL[e.kind]}
                      {e.modifiedAt ? ` · ${fmtDate(e.modifiedAt)}` : ""}
                    </span>
                  </span>
                )}
                {e.url && (
                  <a href={e.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${e.name} no Drive`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                    <ExternalLink className="size-4" />
                  </a>
                )}
                {has(user, "drive", "edit") && <RegisterButton entry={{ id: e.id, name: e.name, url: e.url, kind: e.kind }} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
