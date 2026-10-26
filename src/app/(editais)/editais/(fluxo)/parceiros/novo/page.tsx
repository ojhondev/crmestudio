import type { Metadata } from "next";
import { mailConfigured } from "@/lib/mail";
import { requireStaff } from "@/lib/editais-app/session";
import { ParceiroFlow } from "@/components/editais-app/flows/parceiro-flow";

export const metadata: Metadata = { title: "Convidar parceiro" };

export default async function Page() {
  await requireStaff("manage");
  return <ParceiroFlow mailReady={mailConfigured()} />;
}
