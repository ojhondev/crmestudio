"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { setFirstPassword } from "@/app/login/actions";

export function FirstPasswordForm() {
  const [state, action, pending] = useActionState(setFirstPassword, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="next">Nova senha</Label>
        <PasswordInput id="next" name="next" autoComplete="new-password" minLength={8} required className="h-10" />
        <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">Repita a nova senha</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} required className="h-10" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="mt-2 h-10" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Salvar e entrar
      </Button>
    </form>
  );
}
