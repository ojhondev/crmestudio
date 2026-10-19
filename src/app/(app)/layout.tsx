import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { AnaProvider } from "@/components/ana/ana-provider";
import { anaEnabled } from "@/lib/ana";
import { TourProvider } from "@/components/help/tour";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // lembra se o menu lateral estava recolhido (cookie gravado pelo componente da sidebar)
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <AnaProvider enabled={anaEnabled()}>
      <TourProvider userId={user.id}>
        <AppShell user={user} defaultOpen={defaultOpen}>
          {children}
        </AppShell>
      </TourProvider>
    </AnaProvider>
  );
}
