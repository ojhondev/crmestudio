import type { Metadata } from "next";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { SiteTabs } from "@/components/site/site-tabs";
import { SettingGroupForm } from "@/components/site/settings-forms";
import { SETTING_GROUPS, getSetting } from "@/lib/site";

export const metadata: Metadata = { title: "Textos do site" };

export default async function TextosPage() {
  const user = await requireAccess("site");
  const values = await Promise.all(SETTING_GROUPS.map((g) => getSetting(g.key)));
  const canEdit = has(user, "site", "edit");
  return (
    <>
      <PageToolbar title="Textos e vídeo" tabs={<SiteTabs />} />
      <div className="mx-auto grid max-w-3xl gap-4 p-3 sm:p-5">
        {SETTING_GROUPS.map((g, i) => (
          <SettingGroupForm key={g.key} k={g.key} title={g.title} desc={g.desc} fields={g.fields} initial={values[i]} canEdit={canEdit} />
        ))}
        <p className="text-xs text-muted-foreground">Os contatos do rodapé (e-mail, telefone) ainda estão fixos no código do site; para editá-los pelo CRM é preciso ajustar o site.</p>
      </div>
    </>
  );
}
