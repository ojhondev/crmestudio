import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { BrandLogo } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  if (await getUser()) redirect("/");
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16">
        <BrandLogo className="h-9 w-auto self-start object-contain" />
        <div className="w-full max-w-sm py-12">
          <p className="label mb-3">Restaura · gestão</p>
          <h1 className="h-display mb-2 text-4xl">Bem-vinda de volta.</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            CRM, agenda e financeiro do estúdio num lugar só.
          </p>
          <LoginForm googleError={erro} />
        </div>
        <p className="text-xs text-muted-foreground">
          Acesso restrito à equipe e parceiros do Estúdio Restaura.
        </p>
      </div>
      <div className="relative hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login.jpg" alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/35" />
        <p className="absolute right-12 bottom-12 left-12 font-serif text-2xl leading-snug text-white/95">
          “Conservar é cuidar do que o tempo confiou a nós.”
        </p>
      </div>
    </div>
  );
}
