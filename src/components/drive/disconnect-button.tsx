"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { disconnectGoogle } from "@/app/(app)/drive/actions";

export function DisconnectButton() {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Desconectar"
      confirmLabel="Desconectar"
      title="Desconectar o Google Drive?"
      description="Os tokens são apagados do CRM. Os links já registrados continuam funcionando."
      action={async () => {
        const r = await disconnectGoogle();
        if (r.ok) {
          toast.success("Google Drive desconectado.");
          router.refresh();
        } else toast.error(r.error);
      }}
    />
  );
}

