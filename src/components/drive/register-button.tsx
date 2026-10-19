"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importGoogleEntry } from "@/app/(app)/drive/actions";
import type { DriveKind } from "@/lib/db/schema";

export function RegisterButton({ entry }: { entry: { id: string; name: string; url: string | null; kind: DriveKind } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="max-md:h-11"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await importGoogleEntry(entry, null);
          if (r.ok) {
            toast.success("Registrado nos arquivos do CRM.");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Plus /> Registrar
    </Button>
  );
}
