"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, FileUp, Loader2, RefreshCw, Smartphone, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/form";
import { decodeBytes } from "@/lib/contacts-import/text";
import { looksLikeVcf, parseVcf } from "@/lib/contacts-import/vcard";
import { csvToRaw, mapProblems, readCsv, ROLE_LABEL, type ParsedCsv, type Role } from "@/lib/contacts-import/csv-contacts";
import { buildCandidate, buildIndex, classify, countByStatus, DEFAULT_FILTERS, defaultLabel, showPhone, type Classified, type Filters } from "@/lib/contacts-import/engine";
import { DUP_MODES, IMPORT_SOURCES, type Candidate, type DupMode, type Existing, type RawContact, type Status } from "@/lib/contacts-import/types";
import { checkExisting, disconnectGoogle, discardPending, finishImport, googleContactsPage, importPart, pendingList, saveAuto, startImport, syncNow, undoImport } from "./actions";

type Info = {
  connected: boolean;
  email: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  hasInitialImport: boolean;
  autoSync: boolean;
  autoMode: string;
  importedTotal: number;
  configured: boolean;
};
type Recent = { id: string; label: string; source: string | null; status: string; created: number; updated: number; skipped: number; undoneCount: number; at: string; mine: boolean };
type Team = { id: string; name: string }[];
type Step = "fonte" | "colunas" | "previa" | "regras" | "importando" | "fim";
type Origin = "google" | "arquivo" | "pendentes";

const RESULT: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Google Contatos conectado! Agora é só tocar em “Importar do Google Contatos”." },
  negado: { ok: false, text: "Você cancelou a autorização no Google. Nada foi conectado." },
  escopo: { ok: false, text: "A permissão de contatos não foi concedida. Tente de novo e deixe a caixa de contatos marcada." },
  sem_refresh: { ok: false, text: "O Google não liberou o acesso contínuo. Tente conectar de novo." },
  estado: { ok: false, text: "A conexão expirou ou veio de outra janela. Tente conectar de novo." },
  troca: { ok: false, text: "Não foi possível concluir a conexão com o Google. Tente de novo." },
  nao_configurado: { ok: false, text: "O Google ainda não está configurado neste sistema." },
};

const STATUS_LABEL: Record<Status, string> = {
  novo: "Novos",
  duplicado: "Já existem",
  sem_telefone: "Sem telefone",
  invalido: "Inválidos",
  repetido: "Repetidos",
  filtrado: "Ignorados pelo filtro",
};
const STATUS_TONE: Record<Status, string> = {
  novo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  duplicado: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sem_telefone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  invalido: "bg-destructive/15 text-destructive",
  repetido: "bg-muted text-muted-foreground",
  filtrado: "bg-muted text-muted-foreground",
};
const SELECTABLE: Status[] = ["novo", "duplicado", "sem_telefone"];
const PAGE = 40;
const CHUNK = 100;
const MAX_FILE = 30 * 1024 * 1024;

function ago(iso: string | null) {
  if (!iso) return "ainda não sincronizou";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora há pouco";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} dia(s)`;
}

export function Importer({ info, team, me, pending, googleResult, recent }: { info: Info; team: Team; me: string; pending: number; googleResult?: string; recent: Recent[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("fonte");
  const [origin, setOrigin] = useState<Origin>("arquivo");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Status | "todos">("novo");
  const [page, setPage] = useState(0);
  const [dupMode, setDupMode] = useState<DupMode>("pular");
  const [src, setSrc] = useState<string>("Importação");
  const [label, setLabel] = useState("");
  const [ownerId, setOwnerId] = useState(me);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [loading, setLoading] = useState<{ text: string; pct?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prog, setProg] = useState({ done: 0, total: 0, created: 0, updated: 0, skipped: 0 });
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ id: string; created: number; updated: number; skipped: number } | null>(null);
  const [undone, setUndone] = useState<{ removed: number; kept: number } | null>(null);
  const [busy, startT] = useTransition();
  const [confirmOff, setConfirmOff] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const batchRef = useRef<{ id: string } | null>(null);
  const posRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!googleResult) return;
    const r = RESULT[googleResult];
    if (r) (r.ok ? toast.success : toast.error)(r.text);
    router.replace("/contatos/importar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const index = useMemo(() => buildIndex(existing), [existing]);
  const classified = useMemo(() => classify(cands, index, filters), [cands, index, filters]);
  const counts = useMemo(() => countByStatus(classified), [classified]);
  const isSel = (x: Classified) => SELECTABLE.includes(x.status) && (manual[x.c.key] ?? (x.status === "novo" || (x.status === "duplicado" && dupMode !== "pular")));
  const chosen = useMemo(
    () => classified.filter(isSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classified, manual, dupMode],
  );
  const shown = useMemo(() => (tab === "todos" ? classified : classified.filter((x) => x.status === tab)), [classified, tab]);

  /* ------------------------------ entrada de dados ------------------------------ */

  async function prepare(list: Candidate[], from: Origin, token: string | null) {
    setLoading({ text: "Comparando com os contatos que você já tem…", pct: 0 });
    const found = new Map<string, Existing>();
    for (let i = 0; i < list.length; i += 500) {
      const part = await checkExisting(list.slice(i, i + 500));
      for (const e of part) found.set(e.id, e);
      setLoading({ text: "Comparando com os contatos que você já tem…", pct: Math.round(((i + 500) / list.length) * 100) });
    }
    setExisting([...found.values()]);
    setCands(list);
    setSyncToken(token);
    setOrigin(from);
    setManual({});
    setPage(0);
    setTab("novo");
    setSrc(from === "arquivo" ? "Importação" : "Google Contatos");
    setLabel("");
    setDupMode("pular");
    setLoading(null);
    setStep("previa");
  }

  async function fromRaws(raws: RawContact[]) {
    if (raws.length === 0) {
      setError("Não encontramos nenhum contato nesse arquivo.");
      return;
    }
    await prepare(raws.map((r, i) => buildCandidate(r, String(i))), "arquivo", null);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (f.size > MAX_FILE) return setError("Arquivo grande demais (máximo 30 MB). Divida em partes.");
    try {
      setLoading({ text: "Lendo o arquivo…" });
      const text = decodeBytes(new Uint8Array(await f.arrayBuffer()));
      if (looksLikeVcf(text)) return await fromRaws(parseVcf(text));
      const p = readCsv(text);
      if (p.headers.length === 0 || p.rows.length === 0) throw new Error("vazio");
      setCsv(p);
      setLoading(null);
      setStep("colunas");
    } catch {
      setLoading(null);
      setError("Não conseguimos ler esse arquivo. Use um .vcf ou um .csv exportado do celular ou do Google Contatos.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function fromGoogle() {
    setError(null);
    const all: Candidate[] = [];
    let token: string | null = null;
    let sync: string | null = null;
    try {
      do {
        setLoading({ text: `Buscando seus contatos no Google… ${all.length ? `${all.length} até agora` : ""}` });
        const r = await googleContactsPage(token);
        if ("error" in r) {
          setLoading(null);
          setError(r.error ?? "Erro ao falar com o Google.");
          return;
        }
        all.push(...r.items);
        token = r.nextPageToken;
        sync = r.syncToken ?? sync;
      } while (token);
    } catch {
      setLoading(null);
      setError("A conexão caiu durante a busca. Tente de novo.");
      return;
    }
    if (all.length === 0) {
      setLoading(null);
      setError("Sua conta Google não tem contatos salvos. Veja o passo a passo para ativar a sincronização dos contatos do celular.");
      return;
    }
    await prepare(all, "google", sync);
  }

  async function fromPending() {
    setError(null);
    setLoading({ text: "Carregando os novos contatos do Google…" });
    const list = await pendingList();
    if (list.length === 0) {
      setLoading(null);
      return setError("Não há contatos aguardando.");
    }
    await prepare(list, "pendentes", null);
  }

  /* ------------------------------ importação em lotes ------------------------------ */

  async function run(from: number) {
    setPaused(false);
    setStep("importando");
    const list = chosen.map((x) => x.c);
    try {
      if (!batchRef.current) {
        const b = await startImport({
          kind: origin === "google" ? "google" : origin === "pendentes" ? "sincronizacao" : "arquivo",
          source: src,
          label: label.trim() || defaultLabel(src),
          dupMode,
          ownerId,
          total: list.length,
        });
        batchRef.current = { id: b.id };
        setProg({ done: 0, total: list.length, created: 0, updated: 0, skipped: 0 });
      }
      for (let i = from; i < list.length; i += CHUNK) {
        posRef.current = i;
        let r: Awaited<ReturnType<typeof importPart>> | null = null;
        for (let t = 0; t < 3 && !r; t++) {
          try {
            const x = await importPart(batchRef.current.id, ownerId, list.slice(i, i + CHUNK));
            if ("error" in x) throw new Error(x.error);
            r = x;
          } catch (e) {
            if (t === 2) throw e;
            await new Promise((ok) => setTimeout(ok, 1200 * (t + 1)));
          }
        }
        setProg((p) => ({ done: Math.min(list.length, i + CHUNK), total: list.length, created: p.created + r!.created, updated: p.updated + r!.updated, skipped: p.skipped + r!.skipped }));
      }
      const pendIds = origin === "pendentes" ? cands.map((c) => c.externalId).filter((x): x is string => !!x) : [];
      const fin = await finishImport(batchRef.current.id, origin === "google" ? syncToken : null, pendIds);
      if ("error" in fin) throw new Error(fin.error);
      setResult({ id: fin.id, created: fin.created, updated: fin.updated, skipped: fin.skipped });
      setStep("fim");
      router.refresh();
    } catch {
      setPaused(true);
      toast.error("A importação foi interrompida. O que já entrou está salvo; toque em “Continuar”.");
    }
  }

  const undo = (id: string) =>
    startT(async () => {
      const r = await undoImport(id);
      if ("error" in r) return void toast.error(r.error);
      setUndone(r);
      toast.success(`${r.removed} contato(s) removido(s)${r.kept ? `; ${r.kept} mantido(s) por já terem negócio ou histórico` : ""}.`);
      router.refresh();
    });

  const restart = () => {
    batchRef.current = null;
    posRef.current = 0;
    setResult(null);
    setUndone(null);
    setCands([]);
    setExisting([]);
    setCsv(null);
    setError(null);
    setStep("fonte");
  };

  /* ------------------------------ telas ------------------------------ */

  const wrap = "mx-auto w-full max-w-3xl p-4 sm:p-6";
  if (loading)
    return (
      <div className={wrap}>
        <div className="grid place-items-center gap-4 rounded-xl border bg-card p-10 text-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm">{loading.text}</p>
          {loading.pct !== undefined && <Bar pct={loading.pct} />}
        </div>
      </div>
    );

  if (step === "colunas" && csv) {
    const problems = mapProblems(csv.roles);
    const sample = csv.rows[0] ?? [];
    return (
      <div className={wrap}>
        <h2 className="text-lg font-semibold">Confira as colunas</h2>
        <p className="mb-4 text-sm text-muted-foreground">Reconhecemos {csv.rows.length} linha(s). Confira o que é cada coluna; as que você não precisa ficam como “Ignorar”.</p>
        <ul className="grid gap-2">
          {csv.headers.map((h, i) => (
            <li key={i} className="grid gap-1 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_14rem] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{h || `Coluna ${i + 1}`}</p>
                <p className="truncate text-xs text-muted-foreground">{sample[i] || "—"}</p>
              </div>
              <select
                aria-label={`Tipo da coluna ${h}`}
                value={csv.roles[i]}
                onChange={(e) => setCsv({ ...csv, roles: csv.roles.map((r, j) => (j === i ? (e.target.value as Role) : r)) })}
                className="min-h-11 rounded-md border bg-background px-2 text-sm"
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        {problems.map((p) => (
          <p key={p} className="mt-3 text-sm text-destructive">{p}</p>
        ))}
        <Nav back={restart} next={{ label: "Ver prévia", disabled: problems.length > 0, on: () => fromRaws(csvToRaw(csv.rows, csv.roles)) }} />
      </div>
    );
  }

  if (step === "previa") {
    const tabs: Status[] = ["novo", "duplicado", "sem_telefone", "invalido", "repetido", "filtrado"];
    const slice = shown.slice(page * PAGE, (page + 1) * PAGE);
    const pages = Math.max(1, Math.ceil(shown.length / PAGE));
    const toggleAll = (on: boolean) => setManual((m) => ({ ...m, ...Object.fromEntries(shown.filter((x) => SELECTABLE.includes(x.status)).map((x) => [x.c.key, on])) }));
    return (
      <div className={wrap}>
        <h2 className="text-lg font-semibold">Prévia: {cands.length} contato(s) lidos</h2>
        <p className="mb-3 text-sm text-muted-foreground">Nada foi salvo ainda. Veja o que vai acontecer e marque quem você quer importar.</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tabs.map((s) => (
            <button
              key={s}
              onClick={() => { setTab(s); setPage(0); }}
              className={`min-h-14 rounded-lg border px-3 py-2 text-left transition-colors ${tab === s ? "border-foreground bg-muted" : "hover:border-foreground/30"}`}
            >
              <span className="block text-xl font-semibold tabular-nums">{counts[s]}</span>
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>

        <fieldset className="mt-4 grid gap-1 rounded-lg border p-3 text-[13px]">
          <legend className="px-1 text-xs tracking-wider text-muted-foreground uppercase">Filtros</legend>
          {(
            [
              ["onlyBrMobile", "Só quem tem celular brasileiro"],
              ["ignoreLandline", "Ignorar telefones fixos"],
              ["ignoreUnnamed", "Ignorar cartões sem nome (só número ou empresa)"],
            ] as [keyof Filters, string][]
          ).map(([k, t]) => (
            <label key={k} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-5 accent-foreground" checked={filters[k]} onChange={(e) => setFilters({ ...filters, [k]: e.target.checked })} />
              {t}
            </label>
          ))}
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <strong>{chosen.length}</strong> selecionado(s) para importar
          </p>
          {SELECTABLE.includes(tab as Status) && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => toggleAll(true)}>Marcar todos desta aba</Button>
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => toggleAll(false)}>Desmarcar</Button>
            </div>
          )}
        </div>

        <ul className="mt-2 grid gap-2">
          {slice.length === 0 && <li className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum contato nesta aba.</li>}
          {slice.map((x) => {
            const selectable = SELECTABLE.includes(x.status);
            return (
              <li key={x.c.key} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                {selectable ? (
                  <input type="checkbox" aria-label={`Importar ${x.c.name}`} className="mt-1 size-5 shrink-0 accent-foreground" checked={isSel(x)} onChange={(e) => setManual((m) => ({ ...m, [x.c.key]: e.target.checked }))} />
                ) : (
                  <span className="mt-1 size-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1 text-[13px]">
                  <p className="truncate text-[14px] font-medium">{x.c.name}</p>
                  <p className="break-words text-muted-foreground">{[x.c.phone ? showPhone(x.c.phone) : null, x.c.email, x.c.company].filter(Boolean).join(" · ") || "sem dados de contato"}</p>
                  {x.match && <p className="text-xs text-muted-foreground">Já existe como “{x.match.existing.name}” ({x.match.by})</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[x.status]}`}>{x.reason && x.status !== "novo" && x.status !== "duplicado" ? x.reason : STATUS_LABEL[x.status].replace(/s$/, "")}</span>
              </li>
            );
          })}
        </ul>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <Button variant="outline" className="min-h-11" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span className="text-muted-foreground">{page + 1} de {pages}</span>
            <Button variant="outline" className="min-h-11" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        )}
        <Nav back={restart} next={{ label: "Continuar", on: () => setStep("regras"), disabled: chosen.length === 0 }} />
      </div>
    );
  }

  if (step === "regras") {
    const dups = chosen.filter((x) => x.status === "duplicado").length;
    return (
      <div className={wrap}>
        <h2 className="text-lg font-semibold">Como importar</h2>
        <p className="mb-4 text-sm text-muted-foreground">{chosen.length} contato(s) selecionado(s).</p>
        <div className="grid gap-5">
          {dups > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{dups} já existem no CRM. O que fazer com eles?</legend>
              {(Object.keys(DUP_MODES) as DupMode[]).map((m) => (
                <label key={m} className={`flex min-h-11 items-start gap-3 rounded-lg border p-3 ${dupMode === m ? "border-foreground bg-muted/50" : ""}`}>
                  <input type="radio" name="dup" className="mt-1 size-4 accent-foreground" checked={dupMode === m} onChange={() => setDupMode(m)} />
                  <span className="text-[13px]"><strong>{DUP_MODES[m].label}</strong><br /><span className="text-muted-foreground">{DUP_MODES[m].help}</span></span>
                </label>
              ))}
            </fieldset>
          )}
          <Field label="De onde vêm estes contatos?" htmlFor="src" hint="Fica gravado na origem de cada contato.">
            <select id="src" value={src} onChange={(e) => setSrc(e.target.value)} className="min-h-11 w-full rounded-md border bg-background px-2 text-sm">
              {IMPORT_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Etiqueta do lote" htmlFor="label" hint="Todos os contatos do lote recebem esta etiqueta. Ajuda a achar e a desfazer.">
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={defaultLabel(src)} className="min-h-11" />
          </Field>
          <Field label="Responsável pelos novos contatos" htmlFor="owner">
            <select id="owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="min-h-11 w-full rounded-md border bg-background px-2 text-sm">
              {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            O estúdio é responsável pelos dados importados (LGPD). Importe apenas contatos que você tem base legal para tratar, como clientes e pessoas que já conversaram com o estúdio.
          </p>
        </div>
        <Nav back={() => setStep("previa")} next={{ label: `Importar ${chosen.length}`, on: () => void run(0) }} />
      </div>
    );
  }

  if (step === "importando") {
    const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
    return (
      <div className={wrap}>
        <h2 className="text-lg font-semibold">Importando…</h2>
        <p className="mb-4 text-sm text-muted-foreground">Não feche esta tela até terminar. Se a conexão cair, é só continuar de onde parou.</p>
        <Bar pct={pct} />
        <p className="mt-2 text-sm tabular-nums">{prog.done} de {prog.total} · {prog.created} novos · {prog.updated} atualizados · {prog.skipped} ignorados</p>
        {paused && (
          <div className="mt-4 grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="flex gap-2 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Interrompido. O que já entrou está salvo e nada será duplicado.</p>
            <Button className="min-h-11" onClick={() => void run(posRef.current)}>Continuar de onde parou</Button>
          </div>
        )}
      </div>
    );
  }

  if (step === "fim" && result) {
    return (
      <div className={wrap}>
        <div className="grid gap-3 rounded-xl border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
          <h2 className="text-lg font-semibold">{undone ? "Importação desfeita" : "Importação concluída"}</h2>
          {undone ? (
            <p className="text-sm text-muted-foreground">{undone.removed} contato(s) removido(s){undone.kept ? `; ${undone.kept} mantido(s) porque já têm negócio ou histórico` : ""}. Quem já estava no CRM não foi tocado.</p>
          ) : (
            <p className="text-sm tabular-nums"><strong>{result.created}</strong> criados · <strong>{result.updated}</strong> atualizados · <strong>{result.skipped}</strong> ignorados</p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {!undone && <Button asChild className="min-h-11"><Link href={`/contatos?lote=${result.id}`}><Users /> Ver o lote</Link></Button>}
            {!undone && result.created > 0 && (
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => undo(result.id)}>
                {busy ? <Loader2 className="animate-spin" /> : <Undo2 />} Desfazer importação
              </Button>
            )}
            <Button variant="ghost" className="min-h-11" onClick={restart}>Nova importação</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ passo 1: fonte ------------------------------ */
  const sync = () =>
    startT(async () => {
      const r = await syncNow();
      if (!r.ok) toast.error(r.error);
      else toast.success(r.pending ? `${r.pending} novo(s) aguardando sua confirmação.` : r.created || r.updated ? `${r.created} novo(s), ${r.updated} atualizado(s).` : "Tudo em dia.");
      router.refresh();
    });
  const problem = info.connected && info.status !== "ativo";

  return (
    <div className={wrap}>
      <h2 className="text-lg font-semibold">De onde vêm os contatos?</h2>
      <ul className="mb-4 grid gap-1 text-sm text-muted-foreground">
        <li>• O WhatsApp não permite exportar nem ler a lista de contatos. Só importamos os contatos <strong className="text-foreground">salvos na agenda do celular</strong>.</li>
        <li>• Se a agenda do celular sincroniza com o Google, conecte o Google Contatos e importe com um toque.</li>
        <li>• Ou envie um arquivo .vcf ou .csv exportado do celular. Quem só aparece nas conversas e não está salvo na agenda não dá para importar.</li>
      </ul>

      {error && (
        <div className="mb-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <p>{error}</p>
        </div>
      )}

      {pending > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
          <p className="text-sm"><strong>{pending}</strong> contato(s) novo(s) do Google aguardando sua confirmação.</p>
          <div className="flex gap-2">
            <Button className="min-h-11" onClick={() => void fromPending()}>Revisar</Button>
            <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => startT(async () => { await discardPending(); router.refresh(); })}>Descartar</Button>
          </div>
        </div>
      )}

      <section className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Smartphone className="size-5 text-muted-foreground" />
          <h3 className="font-medium">Google Contatos</h3>
          {info.connected && !problem && <Badge variant="secondary">Conectado</Badge>}
        </div>
        {!info.connected ? (
          <div className="grid gap-3 text-[13px]">
            <p className="text-muted-foreground">Conecte uma vez. O estúdio só <strong className="text-foreground">lê</strong> seus contatos: nada é alterado nem apagado no Google, e você desconecta quando quiser.</p>
            {info.lastError && info.status === "desconectado" && <p className="text-destructive">{info.lastError}</p>}
            {info.configured ? (
              <Button asChild size="lg" className="min-h-11"><a href="/api/contatos/connect">Conectar Google Contatos</a></Button>
            ) : (
              <p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">O Google ainda não foi configurado neste sistema. Avise o administrador.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 text-[13px]">
            <p className="break-all text-muted-foreground">
              {info.email ?? "Conta Google"} · última sincronização {ago(info.lastSyncAt)} · {info.importedTotal} importado(s)
            </p>
            {problem && (
              <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <p>{info.lastError ?? "Houve um problema na última sincronização."}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="lg" className="min-h-11" onClick={() => void fromGoogle()}>Importar do Google Contatos</Button>
              {info.hasInitialImport && (
                <Button variant="outline" className="min-h-11" disabled={busy} onClick={sync}>
                  {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar agora
                </Button>
              )}
              {info.status === "reautorizar" && <Button asChild variant="secondary" className="min-h-11"><a href="/api/contatos/connect">Reconectar</a></Button>}
            </div>
            {info.hasInitialImport && (
              <div className="grid gap-2 rounded-lg border p-3">
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="size-5 accent-foreground" checked={info.autoSync} onChange={(e) => startT(async () => { await saveAuto(e.target.checked, info.autoMode === "direto" ? "direto" : "confirmar"); router.refresh(); })} />
                  Buscar contatos novos do Google todo dia
                </label>
                {info.autoSync && (
                  <select aria-label="O que fazer com os novos" value={info.autoMode} onChange={(e) => startT(async () => { await saveAuto(true, e.target.value as "confirmar" | "direto"); router.refresh(); })} className="min-h-11 rounded-md border bg-background px-2 text-sm">
                    <option value="confirmar">Aguardar minha confirmação</option>
                    <option value="direto">Entrar direto no CRM</option>
                  </select>
                )}
                <p className="text-xs text-muted-foreground">Só traz contatos novos ou alterados do Google para cá. Nunca apaga contatos do CRM e nunca escreve de volta no Google.</p>
              </div>
            )}
            {!confirmOff ? (
              <Button variant="ghost" className="min-h-11 w-fit text-muted-foreground hover:text-destructive" onClick={() => setConfirmOff(true)}>Desconectar</Button>
            ) : (
              <div className="grid gap-2 rounded-lg border p-3">
                <p>Desconectar o Google Contatos? Os contatos já importados continuam no CRM.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-11 text-destructive" disabled={busy} onClick={() => startT(async () => { await disconnectGoogle(); setConfirmOff(false); toast.success("Desconectado."); router.refresh(); })}>Desconectar</Button>
                  <Button variant="ghost" className="min-h-11" onClick={() => setConfirmOff(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <FileUp className="size-5 text-muted-foreground" />
          <h3 className="font-medium">Arquivo (.vcf ou .csv)</h3>
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">O arquivo é lido aqui no seu aparelho e não fica guardado: só os contatos escolhidos são gravados.</p>
        <input ref={fileRef} type="file" accept=".vcf,.vcard,.csv,text/vcard,text/csv,text/x-vcard" className="sr-only" id="file" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button size="lg" variant="outline" className="min-h-11" onClick={() => fileRef.current?.click()}>
          <FileUp /> Escolher arquivo
        </Button>
      </section>

      <section className="mb-4 rounded-xl border bg-card">
        {[
          ["android", "Android: ativar a sincronização com o Google", ["Abra Configurações → Contas (ou “Senhas e contas”).", "Toque na sua conta Google.", "Toque em “Sincronização de conta”.", "Ligue a chave “Contatos” e toque em “Sincronizar agora”.", "Para conferir, abra contacts.google.com no computador: seus contatos devem aparecer."]],
          ["iphone", "iPhone: ativar a sincronização com o Google", ["Abra Ajustes → Contatos → Contas.", "Toque em Gmail (adicione a conta se não aparecer).", "Ligue a chave “Contatos”.", "Aguarde alguns minutos e confira em contacts.google.com."]],
          ["vcf", "Como exportar um arquivo .vcf do celular", ["Android: abra o app Contatos → menu (três linhas) → Ajustes → Exportar → salvar como .vcf.", "iPhone: em contacts.google.com (após sincronizar) use Exportar → vCard; ou envie os contatos por um app de exportação.", "Depois envie o arquivo para este computador (e-mail ou WhatsApp para você mesmo) e escolha-o acima."]],
        ].map(([id, title, steps]) => (
          <div key={id as string} className="border-b last:border-0">
            <button className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left text-sm font-medium" aria-expanded={help === id} onClick={() => setHelp(help === id ? null : (id as string))}>
              {title as string} <ChevronDown className={`size-4 transition-transform ${help === id ? "rotate-180" : ""}`} />
            </button>
            {help === id && (
              <ol className="grid gap-1 px-4 pb-4 pl-8 text-[13px] text-muted-foreground [list-style:decimal]">
                {(steps as string[]).map((s) => <li key={s}>{s}</li>)}
              </ol>
            )}
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Importações recentes</h3>
          <ul className="grid gap-2">
            {recent.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.at).toLocaleDateString("pt-BR")} · {b.created} novos · {b.updated} atualizados ·{" "}
                    {b.status === "desfeito" ? `desfeita (${b.undoneCount} removidos)` : b.status === "em_andamento" ? "interrompida" : "concluída"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {b.status !== "desfeito" && <Button asChild size="sm" variant="outline" className="min-h-11"><Link href={`/contatos?lote=${b.id}`}>Ver</Link></Button>}
                  {b.status !== "desfeito" && b.created > 0 && (
                    <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => { if (confirm(`Desfazer “${b.label}”? Os ${b.created} contatos criados por este lote serão removidos (quem já tem negócio ou histórico é mantido).`)) undo(b.id); }}>
                      <Undo2 /> Desfazer
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Nav({ back, next }: { back: () => void; next?: { label: string; on: () => void; disabled?: boolean } }) {
  return (
    <div className="sticky bottom-0 max-md:bottom-[calc(4.25rem+env(safe-area-inset-bottom))] -mx-4 mt-6 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <Button variant="ghost" className="min-h-11" onClick={back}>
        <ArrowLeft /> Voltar
      </Button>
      {next && (
        <Button className="min-h-11" onClick={next.on} disabled={next.disabled}>
          {next.label} <ArrowRight />
        </Button>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-foreground transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
