import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { BrandLogo } from "@/components/brand";
import { FirstPasswordForm } from "./form";

export const metadata: Metadata = { title: "Crie sua senha" };

export default async function FirstAccessPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");
  return (
    <div className="grid min-h-svh place-items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <BrandLogo className="mb-10 h-9 w-auto object-contain" />
        <p className="label mb-3">Primeiro acesso</p>
        <h1 className="h-display mb-2 text-3xl">Olá, {user.name.split(" ")[0]}.</h1>
        <p className="mb-8 text-sm text-muted-foreground">Você entrou com uma senha provisória. Crie a sua senha pessoal para continuar.</p>
        <FirstPasswordForm />
      </div>
    </div>
  );
}
