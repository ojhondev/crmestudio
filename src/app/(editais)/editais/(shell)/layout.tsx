import { atLeast } from "@/lib/permissions";
import { requireEditais } from "@/lib/editais-app/session";
import { EditaisShell } from "@/components/editais-app/shell";

export default async function ShellLayout({ children }: LayoutProps<"/editais">) {
  const { user, actor } = await requireEditais();
  return (
    <EditaisShell user={{ name: user.name, email: user.email, kind: actor.kind, canManage: actor.kind === "staff" && atLeast(actor.level, "manage") }}>{children}</EditaisShell>
  );
}
