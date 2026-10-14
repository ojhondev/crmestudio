import { and, eq, gt, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { anaEnabled } from "@/lib/ana";
import { AppSidebar, MobileBar } from "@/components/app-nav";
import { AnaProvider } from "@/components/ana/ana-provider";

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
  return (
    <AnaProvider enabled={anaEnabled()}>
      <div className="flex min-h-svh">
        <AppSidebar user={user} unread={unread} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileBar user={user} unread={unread} />
          {children}
        </div>
      </div>
    </AnaProvider>
  );
}
