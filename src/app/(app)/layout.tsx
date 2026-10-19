import { cookies } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { anaEnabled } from "@/lib/ana";
import { AppShell } from "@/components/app-shell";
import { AnaProvider } from "@/components/ana/ana-provider";
import { TourProvider } from "@/components/help/tour";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  let unread = 0;
  if (user.role !== "parceiro") {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.conversations)
      .where(and(gt(schema.conversations.unread, 0), eq(schema.conversations.status, "aberta")));
    unread = row?.n ?? 0;
  }
  // lembra se o menu lateral estava recolhido (cookie gravado pelo componente da sidebar)
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <AnaProvider enabled={anaEnabled()}>
      <TourProvider userId={user.id}>
        <AppShell user={user} unread={unread} defaultOpen={defaultOpen}>
          {children}
        </AppShell>
      </TourProvider>
    </AnaProvider>
  );
}
