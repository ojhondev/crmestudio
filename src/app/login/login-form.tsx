"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

const GOOGLE_ERRORS: Record<string, string> = {
  google_sem_conta: "Essa conta Google não tem acesso. Peça a um administrador para cadastrar seu e-mail na Equipe.",
  google_cancelado: "Login com Google cancelado.",
  google_estado: "A sessão de login expirou. Tente de novo.",
  google_falha: "Não foi possível entrar com o Google. Tente de novo.",
  google_indisponivel: "O login com Google ainda não está configurado.",
};

export function LoginForm({ googleError }: { googleError?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="grid gap-4">
      <Button asChild variant="outline" size="lg" className="h-10 gap-2">
        <a href="/api/auth/google">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
          </svg>
          Entrar com Google
        </a>
      </Button>
      {googleError && GOOGLE_ERRORS[googleError] && <p className="text-sm text-destructive">{GOOGLE_ERRORS[googleError]}</p>}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou com e-mail e senha
        <span className="h-px flex-1 bg-border" />
      </div>
      <PasswordForm state={state} action={action} pending={pending} />
    </div>
  );
}

function PasswordForm({ state, action, pending }: { state: { error?: string } | null | undefined; action: (f: FormData) => void; pending: boolean }) {
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-10" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="mt-2 h-10" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
