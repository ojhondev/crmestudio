"use client";

import { useMemo, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Scissors,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PageBreak, Variable } from "./editor-extensions";
import { BUILTIN_CLAUSES, FIELD_LABELS } from "@/lib/docs/templates";
import { VARIABLES, VAR_GROUPS, findFieldNames } from "@/lib/docs/variables";
import type { ContractContent } from "@/lib/docs/types";

export const EDITOR_CSS = `
.rs-editor .ProseMirror{outline:none;min-height:620px}
.rs-editor .ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:#9b9794;float:left;height:0;pointer-events:none}
.rs-editor span[data-var]{background:var(--soft);color:var(--accent);border-radius:5px;padding:1px 6px;font-family:var(--sans);font-size:.78em;font-weight:500;white-space:nowrap;cursor:default}
.rs-editor span[data-var].ProseMirror-selectednode{outline:2px solid var(--accent)}
.rs-editor [data-page-break]{position:relative;border-top:1px dashed #c9c5c2;margin:30px 0 18px}
.rs-editor [data-page-break]::after{content:"quebra de página";position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#fff;padding:0 10px;font:500 10.5px var(--sans);letter-spacing:.12em;text-transform:uppercase;color:#9b9794}
.rs-editor [data-page-break].ProseMirror-selectednode{border-top-color:var(--accent)}
.rs-editor td,.rs-editor th{min-width:60px}
.rs-editor .selectedCell{background:#f7ece5}
`;

type ClauseOption = { id: string; name: string; description?: string | null; html: string };

function Tb({ onClick, active, label, children, disabled }: { onClick: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // onMouseDown evita que o clique tire o foco (e a seleção) do texto
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      justify: e.isActive({ textAlign: "justify" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      inTable: e.isActive("table"),
    }),
  });
  const c = () => editor.chain().focus();
  const sep = <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
  return (
    <div role="toolbar" aria-label="Formatação" className="thin-scroll flex items-center gap-0.5 overflow-x-auto border-b bg-card px-2 py-1.5">
      <Tb label="Desfazer" onClick={() => c().undo().run()} disabled={!s.canUndo}><Undo2 /></Tb>
      <Tb label="Refazer" onClick={() => c().redo().run()} disabled={!s.canRedo}><Redo2 /></Tb>
      {sep}
      <Tb label="Título de cláusula" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 /></Tb>
      <Tb label="Subtítulo" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 /></Tb>
      {sep}
      <Tb label="Negrito" active={s.bold} onClick={() => c().toggleBold().run()}><Bold /></Tb>
      <Tb label="Itálico" active={s.italic} onClick={() => c().toggleItalic().run()}><Italic /></Tb>
      <Tb label="Sublinhado" active={s.underline} onClick={() => c().toggleUnderline().run()}><UnderlineIcon /></Tb>
      {sep}
      <Tb label="Lista com marcadores" active={s.ul} onClick={() => c().toggleBulletList().run()}><List /></Tb>
      <Tb label="Lista numerada" active={s.ol} onClick={() => c().toggleOrderedList().run()}><ListOrdered /></Tb>
      <Tb label="Citação" active={s.quote} onClick={() => c().toggleBlockquote().run()}><Quote /></Tb>
      {sep}
      <Tb label="Alinhar à esquerda" active={s.left} onClick={() => c().setTextAlign("left").run()}><AlignLeft /></Tb>
      <Tb label="Centralizar" active={s.center} onClick={() => c().setTextAlign("center").run()}><AlignCenter /></Tb>
      <Tb label="Alinhar à direita" active={s.right} onClick={() => c().setTextAlign("right").run()}><AlignRight /></Tb>
      <Tb label="Justificar" active={s.justify} onClick={() => c().setTextAlign("justify").run()}><AlignJustify /></Tb>
      {sep}
      <Tb label="Inserir tabela" active={s.inTable} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 /></Tb>
      <Tb label="Quebra de página" onClick={() => c().insertContent({ type: "pageBreak" }).run()}><Scissors /></Tb>
    </div>
  );
}

/** Editor de contratos: texto rico + variáveis + biblioteca de cláusulas + campos do contrato. */
export function ContractEditor({
  value,
  onChange,
  readOnly,
  customClauses = [],
}: {
  value: ContractContent;
  onChange: (fn: (prev: ContractContent) => ContractContent) => void;
  readOnly?: boolean;
  customClauses?: ClauseOption[];
}) {
  const [html, setHtml] = useState(value.html);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    content: value.html,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Escreva o contrato ou insira uma cláusula da biblioteca…" }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Variable,
      PageBreak,
    ],
    editorProps: { attributes: { class: "rs-paper rs-editor", "aria-label": "Texto do contrato" } },
    onUpdate: ({ editor: e }) => {
      const next = e.getHTML();
      setHtml(next);
      onChange((p) => ({ ...p, html: next }));
    },
  });

  const fieldNames = useMemo(() => findFieldNames(html), [html]);
  const clauses: ClauseOption[] = [
    ...customClauses,
    ...BUILTIN_CLAUSES.map((c) => ({ id: c.slug, name: c.name, description: c.description, html: c.html })),
  ];

  const insertVar = (key: string) => editor?.chain().focus().insertContent({ type: "variable", attrs: { key } }).insertContent(" ").run();
  const insertClause = (h: string) => editor?.chain().focus().insertContent(h).run();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-muted/40">
        <style dangerouslySetInnerHTML={{ __html: EDITOR_CSS }} />
        {editor && !readOnly && <Toolbar editor={editor} />}
        <div className="rs-doc thin-scroll max-h-[calc(100dvh-15rem)] min-h-[420px] overflow-y-auto p-2 sm:p-5">
          <div className="mx-auto max-w-[794px] overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <aside data-tour="doc-side" className="min-w-0">
        <Tabs defaultValue="variaveis">
          <TabsList className="w-full">
            <TabsTrigger value="variaveis">Variáveis</TabsTrigger>
            <TabsTrigger value="clausulas">Cláusulas</TabsTrigger>
            <TabsTrigger value="campos">
              Campos{fieldNames.length ? ` (${fieldNames.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="variaveis" className="mt-3">
            <p className="mb-3 text-[12.5px] text-muted-foreground">Clique para inserir no ponto do cursor. O sistema troca pelos dados do cliente, do negócio e do estúdio.</p>
            <div className="thin-scroll grid max-h-[52dvh] gap-4 overflow-y-auto pr-1">
              {VAR_GROUPS.map((g) => (
                <div key={g}>
                  <p className="label mb-1.5">{g}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.filter((v) => v.group === g).map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        disabled={readOnly}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertVar(v.key)}
                        className="rounded-full border bg-card px-2.5 py-1 text-[12px] hover:border-brand hover:bg-brand-soft disabled:opacity-50"
                        title={`{{${v.key}}}`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="clausulas" className="mt-3">
            <p className="mb-3 text-[12.5px] text-muted-foreground">Insere a cláusula no cursor. Você pode editar o texto depois.</p>
            <ul className="thin-scroll grid max-h-[52dvh] gap-1.5 overflow-y-auto pr-1">
              {clauses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertClause(c.html)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-left hover:border-brand hover:bg-brand-soft disabled:opacity-50"
                  >
                    <span className="block text-[13px] font-medium">{c.name}</span>
                    {c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="campos" className="mt-3">
            {fieldNames.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                Nenhum campo personalizado neste contrato. Os modelos trazem campos como prazo, escopo e forma de pagamento, que aparecem aqui para você preencher.
              </p>
            ) : (
              <div className="grid gap-3">
                {fieldNames.map((n) => (
                  <label key={n} className="grid gap-1.5">
                    <span className="text-[12.5px] font-medium text-foreground/80">{FIELD_LABELS[n] ?? n.replace(/_/g, " ")}</span>
                    <Input
                      value={value.fields[n] ?? ""}
                      disabled={readOnly}
                      onChange={(e) => onChange((p) => ({ ...p, fields: { ...p.fields, [n]: e.target.value } }))}
                    />
                  </label>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
