"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Texto do site → documento do editor (parágrafos separados por linha em branco). */
const toDoc = (text: string) => ({
  type: "doc",
  content: (text.trim() ? text.split(/\n{2,}/) : [""]).map((p) => {
    const t = p.replace(/\s*\n\s*/g, " ").trim();
    return t ? { type: "paragraph", content: [{ type: "text", text: t }] } : { type: "paragraph" };
  }),
});

type Node = { type?: string; content?: { text?: string }[] };
const fromDoc = (json: unknown) =>
  ((json as { content?: Node[] }).content ?? [])
    .map((n) => (n.content ?? []).map((c) => c.text ?? "").join(""))
    .filter((s) => s.trim())
    .join("\n\n");

/**
 * Editor de parágrafos. O site público renderiza o texto como parágrafos simples (sem negrito, títulos
 * ou listas), então o editor produz exatamente isso: um parágrafo por bloco, separados por linha em branco.
 */
export function ParagraphEditor({ value, onChange, placeholder = "Escreva aqui…", minHeight = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        bold: false,
        italic: false,
        strike: false,
        underline: false,
        link: false,
        horizontalRule: false,
        hardBreak: false,
        listKeymap: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: toDoc(value),
    editorProps: { attributes: { class: "outline-none text-[15px] leading-7 [&_p]:mb-4", style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor: e }) => onChange(fromDoc(e.getJSON())),
  });

  useEffect(() => {
    if (editor && fromDoc(editor.getJSON()) !== value.trim()) editor.commands.setContent(toDoc(value), { emitUpdate: false });
    // só reage a mudanças externas do valor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const paras = value.trim() ? value.trim().split(/\n{2,}/).length : 0;

  return (
    <div className="rounded-lg border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Desfazer" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refazer" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {paras} parágrafo{paras === 1 ? "" : "s"} · {words} palavra{words === 1 ? "" : "s"} · Enter cria novo parágrafo
        </span>
      </div>
      <div className="px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
