import type { Metadata } from "next";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { SiteTabs } from "@/components/site/site-tabs";
import { MediaLibrary } from "@/components/site/media-library";
import { SectionImagesForm } from "@/components/site/settings-forms";
import { SECTION_SLOTS, getSetting, listMedia } from "@/lib/site";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Imagens do site" };

export default async function ImagensPage() {
  const user = await requireAccess("site");
  const [media, sections] = await Promise.all([listMedia(), getSetting("sections")]);
  const canEdit = has(user, "site", "edit");
  return (
    <>
      <PageToolbar title="Imagens" tabs={<SiteTabs />} />
      <div className="mx-auto grid max-w-5xl gap-8 p-3 sm:p-5">
        <section className="grid gap-3">
          <div>
            <h2 className="text-[15px] font-medium">Biblioteca de mídia</h2>
            <p className="text-[13px] text-muted-foreground">Tudo o que foi enviado. Use “Copiar link” ou escolha pelo seletor nos projetos, artigos e seções.</p>
          </div>
          <MediaLibrary canEdit={canEdit} canManage={has(user, "site", "manage")} items={media.map((m) => ({ id: m.id, url: m.url, label: m.label, date: fmtDate(m.createdAt) }))} />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="text-[15px] font-medium">Imagens das seções</h2>
            <p className="text-[13px] text-muted-foreground">Troque a imagem de cada seção do site. Vazio = o site usa a foto padrão.</p>
          </div>
          <SectionImagesForm slots={SECTION_SLOTS} initial={sections} canEdit={canEdit} />
        </section>
      </div>
    </>
  );
}
