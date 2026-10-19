import { requireAccess } from "@/lib/auth";
import { FinanceNav } from "./finance-nav";

export default async function FinanceLayout({ children }: LayoutProps<"/financeiro">) {
  await requireAccess("financeiro");
  return (
    <>
      <FinanceNav />
      {children}
    </>
  );
}
