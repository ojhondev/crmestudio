"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { Field, SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { COFRE_SHORT, COFRE_TYPES, ROLES, STEPS, type PropostasConfig } from "@/lib/propostas/types";
import { deleteTemplateAction, saveConfigAction, saveTemplateAction, toggleTemplateAction } from "../config-actions";

type Person = { id: string; name: string };
type Studio = { name: string; legalName: string; document: string; address: string; city: string; email: string; phone: string; forum: string };
type Tpl = { key: string; type: "checklist" | "matriz"; name: string; description: string; items: Record<string, unknown>[]; builtin: boolean; active: boolean };

function Card({ title, hint, children, tour }: { title: string; hint?: string; children: React.ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className="grid gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** `part`: "dados" mostra só os dados do estúdio e padrões; "modelos" só os modelos de checklist e habilitação; sem ele, tudo (tela avançada). */
export function ConfigClient({ studio, cfg, team, templates, stages, part }: { studio: Studio; cfg: PropostasConfig; team: Person[]; templates: Tpl[]; stages: string[]; part?: "dados" | "modelos" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState(studio);
  const [rep, setRep] = useState(cfg.legalRep);
  const [tech, setTech] = useState(cfg.technical);
  const [bdi, setBdi] = useState(String(cfg.bdiPercent).replace(".", ","));
  const [enc, setEnc] = useState(String(cfg.encargosPercent).replace(".", ","));
  const [validity, setValidity] = useState(String(cfg.validityDays));
  const [roles, setRoles] = useState<Record<string, string>>(cfg.roles as Record<string, string>);
  const [reasons, setReasons] = useState(cfg.lossReasons.join("\n"));
  const [stageSent, setStageSent] = useState(cfg.stageSent);
  const [def, setDef] = useState(cfg.defaultTemplate);
  const checklists = templates.filter((t) => t.type === "checklist");

  const save = () =>
    start(async () => {
      const r = await saveConfigAction({ studio: s, legalRep: rep, technical: tech, bdiPercent: bdi, encargosPercent: enc, validityDays: validity, roles, lossReasons: reasons.split("\n"), stageSent, defaultTemplate: def });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Configuração salva");
        router.refresh();
      }
    });
  const filled = [s.legalName, s.document, s.address, s.city, rep.name, tech.length ? "x" : ""].filter(Boolean).length;
  if (part === "modelos") {
    return (
      <div className="grid gap-4">
        <Templates templates={templates} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-3 sm:p-5">
      <div className="rounded-xl border border-brand/30 bg-brand-soft/50 px-4 py-3 text-[13px]">
        <strong>Comece por aqui.</strong> Estes dados preenchem automaticamente as cartas, as declarações e a proposta técnica. {filled < 6 ? <span>Faltam alguns: razão social, CNPJ, endereço, representante legal e pelo menos um responsável técnico.</span> : "Tudo preenchido. Revise quando algo mudar."}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card title="Dados do estúdio" hint="Os mesmos usados nos contratos (Documentos)." tour="config-estudio">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome fantasia">
              <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="Razão social">
              <Input value={s.legalName} onChange={(e) => setS({ ...s, legalName: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="CNPJ">
              <Input value={s.document} onChange={(e) => setS({ ...s, document: e.target.value })} inputMode="numeric" placeholder="00.000.000/0000-00" className="max-md:h-11" />
            </Field>
            <Field label="Cidade / UF">
              <Input value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="Endereço" className="sm:col-span-2">
              <Input value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="Telefone">
              <Input inputMode="tel" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} className="max-md:h-11" />
            </Field>
          </div>
        </Card>

        <Card title="Representante legal" hint="Quem assina cartas, declarações e propostas pela empresa.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="CPF">
              <Input inputMode="numeric" value={rep.cpf} onChange={(e) => setRep({ ...rep, cpf: e.target.value })} className="max-md:h-11" />
            </Field>
            <Field label="Cargo" className="sm:col-span-2">
              <Input value={rep.role} onChange={(e) => setRep({ ...rep, role: e.target.value })} className="max-md:h-11" />
            </Field>
          </div>
        </Card>

        <Card title="Responsáveis técnicos" hint="O primeiro da lista é o principal: aparece nas declarações e na proposta técnica." tour="config-tecnicos">
          <div className="grid gap-3">
            {tech.map((t, n) => (
              <div key={t.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <Field label="Nome">
                  <Input value={t.name} onChange={(e) => setTech(tech.map((x, k) => (k === n ? { ...x, name: e.target.value } : x)))} className="max-md:h-11" />
                </Field>
                <Field label="Profissão">
                  <Input value={t.profession} onChange={(e) => setTech(tech.map((x, k) => (k === n ? { ...x, profession: e.target.value } : x)))} placeholder="Arquiteto(a), restaurador(a)…" className="max-md:h-11" />
                </Field>
                <Field label="Registro profissional">
                  <Input value={t.registry} onChange={(e) => setTech(tech.map((x, k) => (k === n ? { ...x, registry: e.target.value } : x)))} placeholder="CAU A12345-6 / CREA…" className="max-md:h-11" />
                </Field>
                <Field label="CPF">
                  <Input inputMode="numeric" value={t.cpf} onChange={(e) => setTech(tech.map((x, k) => (k === n ? { ...x, cpf: e.target.value } : x)))} className="max-md:h-11" />
                </Field>
                <Button type="button" size="sm" variant="ghost" className="w-fit text-muted-foreground hover:text-destructive max-md:h-11" onClick={() => setTech(tech.filter((_, k) => k !== n))}>
                  <Trash2 /> Remover
                </Button>
              </div>
            ))}
            {tech.length === 0 && <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">Nenhum responsável técnico ainda. Cadastre quem assina tecnicamente as propostas.</p>}
            <Button type="button" size="sm" variant="outline" className="w-fit max-md:h-11" onClick={() => setTech([...tech, { id: `t${Date.now().toString(36)}`, name: "", profession: "", registry: "", cpf: "" }])}>
              <Plus /> Adicionar responsável técnico
            </Button>
          </div>
        </Card>

        <Card title="Padrões da proposta" hint="Valem para novas propostas e para a planilha de preços." tour="config-padroes">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="BDI padrão (%)">
              <Input inputMode="decimal" value={bdi} onChange={(e) => setBdi(e.target.value)} className="max-md:h-11" />
            </Field>
            <Field label="Encargos sobre mão de obra (%)" hint="0 se os custos já os incluem.">
              <Input inputMode="decimal" value={enc} onChange={(e) => setEnc(e.target.value)} className="max-md:h-11" />
            </Field>
            <Field label="Validade da proposta (dias)">
              <Input inputMode="numeric" value={validity} onChange={(e) => setValidity(e.target.value)} className="max-md:h-11" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Modelo para obra">
              <SimpleSelect value={def.execucao} onValueChange={(v) => setDef({ ...def, execucao: v })} options={checklists.map((t) => ({ value: t.key, label: t.name }))} />
            </Field>
            <Field label="Modelo para projeto / laudo">
              <SimpleSelect value={def.projeto} onValueChange={(v) => setDef({ ...def, projeto: v })} options={checklists.map((t) => ({ value: t.key, label: t.name }))} />
            </Field>
            <Field label="Modelo para dispensa">
              <SimpleSelect value={def.outro} onValueChange={(v) => setDef({ ...def, outro: v })} options={checklists.map((t) => ({ value: t.key, label: t.name }))} />
            </Field>
          </div>
          <Field label="Etapa do funil ao enviar a proposta" hint="O negócio do edital vai para esta etapa quando a etapa “Envio” for concluída. Se não existir, o negócio não é movido. Nenhuma etapa sua é criada ou alterada.">
            <SimpleSelect value={stages.includes(stageSent) ? stageSent : "__none"} onValueChange={(v) => setStageSent(v === "__none" ? "" : v)} options={[{ value: "__none", label: "Não mover o negócio" }, ...stages.map((n) => ({ value: n, label: n }))]} />
          </Field>
        </Card>

        <Card title="Quem cuida de cada função" hint="Os itens do checklist nascem atribuídos à pessoa da função. Sem ninguém, vão para o responsável da proposta." tour="config-funcoes">
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <Field key={r.key} label={r.label} hint={r.hint}>
                <SimpleSelect value={roles[r.key] ?? "__none"} onValueChange={(v) => setRoles({ ...roles, [r.key]: v === "__none" ? "" : v })} options={[{ value: "__none", label: "Ninguém (usa o responsável da proposta)" }, ...team.map((u) => ({ value: u.id, label: u.name }))]} />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="Motivos de perda" hint="Uma linha por motivo. Aparecem ao registrar o resultado e alimentam as estatísticas.">
          <Textarea value={reasons} onChange={(e) => setReasons(e.target.value)} rows={8} className="text-base md:text-sm" />
        </Card>
      </div>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 flex justify-end md:bottom-0">
        <Button type="button" disabled={pending} className="shadow-lg max-md:h-12" onClick={save}>
          {pending && <Loader2 className="animate-spin" />} Salvar configuração
        </Button>
      </div>

      {part !== "dados" && <Templates templates={templates} />}
    </div>
  );
}

/* --------------------------------- modelos --------------------------------- */

function Templates({ templates }: { templates: Tpl[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Tpl | null>(null);
  const list = fresh ? [fresh, ...templates] : templates;
  const newTpl = (type: Tpl["type"], from?: Tpl) => setFresh({ key: "", type, name: from ? `${from.name} (cópia)` : "", description: from?.description ?? "", items: from ? from.items.map((i) => ({ ...i })) : [{ key: "", title: "", ...(type === "checklist" ? { step: "analisar", offsetDays: 5, role: "" } : { cofreType: "" }) }], builtin: false, active: true });
  return (
    <Card title="Modelos de checklist e de habilitação" hint="O checklist vira tarefas com prazo de trás para frente. A matriz de habilitação lista as exigências a conferir contra o cofre. Edite à vontade: o modelo original nunca é apagado." tour="config-modelos">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="max-md:h-11" onClick={() => (newTpl("checklist"), setOpen("")) }>
          <Plus /> Novo checklist
        </Button>
        <Button type="button" size="sm" variant="outline" className="max-md:h-11" onClick={() => (newTpl("matriz"), setOpen(""))}>
          <Plus /> Nova matriz de habilitação
        </Button>
      </div>
      <ul className="grid gap-2">
        {list.map((t) => {
          const id = t.key || "__new";
          const isOpen = open === (t.key || "");
          return (
            <li key={id} className="rounded-lg border">
              <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left max-md:min-h-14" onClick={() => setOpen(isOpen ? null : (t.key || ""))} aria-expanded={isOpen}>
                <span className="min-w-0">
                  <span className={cn("block text-[14px] font-medium", !t.active && "text-muted-foreground line-through")}>{t.name || "Novo modelo"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.type === "checklist" ? "Checklist" : "Matriz de habilitação"} · {t.items.length} itens{t.builtin ? " · do sistema" : ""}
                    {!t.active ? " · desativado" : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{isOpen ? "Fechar" : "Editar"}</span>
              </button>
              {isOpen && <TemplateEditor key={id} tpl={t} onDone={() => setFresh(null)} onCopy={() => newTpl(t.type, t)} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TemplateEditor({ tpl, onDone, onCopy }: { tpl: Tpl; onDone: () => void; onCopy: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(tpl.name);
  const [desc, setDesc] = useState(tpl.description);
  const [items, setItems] = useState<Record<string, unknown>[]>(tpl.items);
  const isCheck = tpl.type === "checklist";
  const set = (n: number, patch: Record<string, unknown>) => setItems(items.map((x, k) => (k === n ? { ...x, ...patch } : x)));
  const move = (n: number, d: -1 | 1) => {
    const m = n + d;
    if (m < 0 || m >= items.length) return;
    const c = [...items];
    [c[n], c[m]] = [c[m], c[n]];
    setItems(c);
  };
  const save = () =>
    start(async () => {
      const r = await saveTemplateAction({ key: tpl.key || undefined, type: tpl.type, name, description: desc, items, active: tpl.active });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Modelo salvo");
        onDone();
        router.refresh();
      }
    });
  return (
    <div className="grid gap-3 border-t px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="max-md:h-11" />
        </Field>
        <Field label="Para que serve">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} className="max-md:h-11" />
        </Field>
      </div>
      {isCheck && <p className="text-xs text-muted-foreground">“Dias úteis antes” conta para trás a partir da data limite do edital: 1 = véspera, 2 = D-2. Em branco = sem prazo calculado.</p>}
      <ol className="grid gap-2">
        {items.map((it, n) => (
          <li key={n} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-[1fr_170px_90px_150px]">
              <Input value={String(it.title ?? "")} onChange={(e) => set(n, { title: e.target.value })} placeholder={isCheck ? "O que fazer" : "Exigência"} maxLength={200} aria-label="Texto" className="max-md:h-11 sm:col-span-1" />
              {isCheck ? (
                <>
                  <SimpleSelect value={String(it.step ?? "analisar")} onValueChange={(v) => set(n, { step: v })} options={STEPS.map((x) => ({ value: x.key, label: x.short }))} />
                  <Input inputMode="numeric" value={it.offsetDays === null || it.offsetDays === undefined ? "" : String(it.offsetDays)} onChange={(e) => set(n, { offsetDays: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} placeholder="Dias úteis antes" aria-label="Dias úteis antes da data limite" className="max-md:h-11" />
                  <SimpleSelect value={String(it.role || "__none")} onValueChange={(v) => set(n, { role: v === "__none" ? null : v })} options={[{ value: "__none", label: "Sem função" }, ...ROLES.map((r) => ({ value: r.key, label: r.label }))]} />
                </>
              ) : (
                <div className="sm:col-span-3">
                  <SimpleSelect value={String(it.cofreType || "__none")} onValueChange={(v) => set(n, { cofreType: v === "__none" ? null : v })} options={[{ value: "__none", label: "Sem documento do cofre (escolher à mão)" }, ...COFRE_TYPES.map((t) => ({ value: t.key, label: COFRE_SHORT[t.key] }))]} />
                </div>
              )}
            </div>
            <div className="flex gap-1">
              <Button type="button" size="icon-sm" variant="ghost" className="max-md:size-11" disabled={n === 0} onClick={() => move(n, -1)} aria-label="Subir">
                <ArrowUp />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="max-md:size-11" disabled={n === items.length - 1} onClick={() => move(n, 1)} aria-label="Descer">
                <ArrowDown />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive max-md:size-11" onClick={() => setItems(items.filter((_, k) => k !== n))} aria-label="Remover item">
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="max-md:h-11" onClick={() => setItems([...items, { key: "", title: "", ...(isCheck ? { step: "analisar", offsetDays: 3, role: null } : { cofreType: null }) }])}>
          <Plus /> Adicionar item
        </Button>
        <Button type="button" size="sm" disabled={pending} className="max-md:h-11" onClick={save}>
          {pending && <Loader2 className="animate-spin" />} Salvar modelo
        </Button>
        {tpl.key && (
          <>
            <Button type="button" size="sm" variant="ghost" className="max-md:h-11" onClick={onCopy}>
              <Copy /> Duplicar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="max-md:h-11"
              onClick={() =>
                start(async () => {
                  await toggleTemplateAction(tpl.key, !tpl.active);
                  router.refresh();
                })
              }
            >
              {tpl.active ? "Desativar" : "Ativar"}
            </Button>
            {!tpl.builtin && (
              <ConfirmButton
                title="Apagar este modelo?"
                description="Dossiês que já usaram o modelo continuam como estão."
                label="Apagar"
                action={async () => {
                  const r = await deleteTemplateAction(tpl.key);
                  if ("error" in r) toast.error(r.error);
                  else router.refresh();
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
