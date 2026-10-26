import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { daysLeft } from "@/lib/editais/filters";
import { nowMs } from "@/lib/editais-app/clock";
import { requireStaff } from "@/lib/editais-app/session";
import { getPartner, sharesOfPartner } from "@/lib/editais-app/partners";
import { PageWrap } from "@/components/editais-app/primitives";
import { PartnerDetail } from "@/components/editais-app/partner-detail";

export const metadata: Metadata = { title: "Parceiro" };

export default async function ParceiroPage({ params }: PageProps<"/editais/parceiros/[id]">) {
  await requireStaff("manage");
  const { id } = await params;
  const p = await getPartner(id);
  if (!p) notFound();
  const now = nowMs();
  const shares = (await sharesOfPartner(id)).map((s) => ({ ...s, daysLeft: daysLeft(s.closeAt, now) }));
  return (
    <PageWrap className="max-w-4xl pb-6">
      <Link href="/editais/parceiros" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" /> Parceiros
      </Link>
      <PartnerDetail p={p} shares={shares} now={now} />
    </PageWrap>
  );
}
