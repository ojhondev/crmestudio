/** Assistentes em tela cheia: sem menu, sem distração — só a pergunta da vez. */
export default function FluxoLayout({ children }: LayoutProps<"/editais">) {
  return <div className="min-h-svh bg-background text-foreground">{children}</div>;
}
