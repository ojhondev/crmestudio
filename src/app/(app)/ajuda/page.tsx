import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/page-header";
import { HelpCenter } from "@/components/help/help-center";
import { articles, faq, type Block } from "@/lib/help";

export const metadata: Metadata = { title: "Central de ajuda" };

const plain = (blocks: Block[]) =>
  blocks
    .map((b) => (b.t === "p" || b.t === "tip" || b.t === "warn" ? b.text : `${b.title ?? ""} ${b.items.join(" ")}`))
    .join(" ");

export default function HelpPage() {
  const items = articles.map((a) => ({
    slug: a.slug,
    module: a.module,
    title: a.title,
    summary: a.summary,
    text: `${a.keywords?.join(" ") ?? ""} ${plain(a.body)}`,
  }));
  return (
    <>
      <PageHeader eyebrow="Ajuda" title="Central de ajuda" description="Passo a passo de cada funcionalidade, tours guiados e respostas rápidas." />
      <PageBody>
        <HelpCenter items={items} faq={faq} />
      </PageBody>
    </>
  );
}
