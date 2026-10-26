import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PageToolbar } from "@/components/toolbar";
import { counts } from "@/lib/propostas/server";
import { EditaisTabs } from "../tabs";
import { ComoUsarNav } from "./nav";
import { ComoUsarContent, TOC } from "./content";

export const metadata: Metadata = { title: "Editais — Como usar" };

/** Aula do módulo Editais para quem nunca usou. Só leitura; o texto fica em ./content.tsx (sem banco). */
export default async function ComoUsarPage() {
  const user = await requireAccess("editais");
  const c = await counts().catch(() => ({ andamento: 0, cofreAlerta: 0 }));
  return (
    <>
      <PageToolbar
        title="Editais"
        actions={
          <Button asChild size="sm" variant="outline" className="max-md:h-11">
            <Link href="/editais-avancado">
              <ArrowLeft /> Voltar para Editais
            </Link>
          </Button>
        }
        tabs={<EditaisTabs canManage={has(user, "editais", "manage")} andamento={c.andamento} cofreAlerta={c.cofreAlerta} />}
      />
      <div className="p-4 sm:p-5">
        <header className="mb-6 max-w-3xl">
          <p className="label mb-1.5">Aula rápida</p>
          <h1 className="h-display text-[26px] sm:text-[32px]">Como usar os Editais</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Do primeiro dia ao resultado: para que serve cada tela, o passo a passo e as boas práticas para não perder prazo. Feito para quem nunca usou o sistema.
          </p>
        </header>
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-10">
          <ComoUsarNav items={TOC} />
          <article className="min-w-0 max-w-6xl flex-1">
            <ComoUsarContent />
          </article>
        </div>
      </div>
    </>
  );
}
