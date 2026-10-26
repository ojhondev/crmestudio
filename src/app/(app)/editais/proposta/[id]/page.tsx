import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { activeUsers, counts, getConfig, listTemplates, loadBundle } from "@/lib/propostas/server";
import { suggestAtestadosFor } from "@/lib/propostas/suggest";
import { EditaisTabs } from "../../tabs";
import { Dossie } from "./dossie";

export const metadata: Metadata = { title: "Dossiê da proposta" };

export default async function PropostaPage({ params }: PageProps<"/editais/proposta/[id]">) {
  const user = await requireAccess("editais");
  const { id } = await params;
  const b = await loadBundle(id);
  if (!b) notFound();
  const [team, checklists, matrices, cfg, suggestions, c] = await Promise.all([
    activeUsers(),
    listTemplates("checklist"),
    listTemplates("matriz"),
    getConfig(),
    suggestAtestadosFor(b.edital.id),
    counts().catch(() => ({ andamento: 0, cofreAlerta: 0 })),
  ]);
  const canEdit = has(user, "editais", "edit");
  return (
    <>
      <PageToolbar
        title={
          <Link href="/editais?aba=propostas" className="inline-flex items-center gap-1.5 hover:underline">
            <ArrowLeft className="size-4" /> Propostas
          </Link>
        }
        tabs={<EditaisTabs canManage={has(user, "editais", "manage")} andamento={c.andamento} cofreAlerta={c.cofreAlerta} />}
      />
      <ToolArea>
        <Dossie
          b={b}
          team={team}
          checklists={checklists.map((t) => ({ key: t.key, name: t.name }))}
          matrices={matrices.map((t) => ({ key: t.key, name: t.name }))}
          lossReasons={cfg.lossReasons}
          suggestions={suggestions}
          flags={{ canEdit, canDocs: has(user, "documentos", "edit"), canSheets: has(user, "planilhas", "edit"), canTasks: has(user, "tarefas", "edit"), canCofre: has(user, "editais", "view") }}
        />
      </ToolArea>
    </>
  );
}
