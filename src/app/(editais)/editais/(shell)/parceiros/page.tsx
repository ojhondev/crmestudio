import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { mailConfigured } from "@/lib/mail";
import { requireStaff } from "@/lib/editais-app/session";
import { listPartners } from "@/lib/editais-app/partners";
import { PageTitle, PageWrap } from "@/components/editais-app/primitives";
import { PartnersView } from "@/components/editais-app/partners-view";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Parceiros" };

export default async function ParceirosPage() {
  await requireStaff("manage");
  const partners = await listPartners();
  return (
    <PageWrap>
      <PageTitle
        title="Parceiros"
        sub="Pessoas de fora que ajudam nos editais. Cada uma vê só o que você compartilhar."
        actions={
          <Button asChild className="min-h-12 rounded-full px-5 md:min-h-11">
            <Link href="/editais/parceiros/novo">
              <Plus /> Convidar parceiro
            </Link>
          </Button>
        }
      />
      <PartnersView partners={partners} mailReady={mailConfigured()} />
    </PageWrap>
  );
}
