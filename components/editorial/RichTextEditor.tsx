"use client";

import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { Bold, Italic, List, ListOrdered, Quote, Undo2, Redo2, Link as LinkIcon, ImagePlus, Table2, Strikethrough } from "lucide-react";

// Conservative by design: unsupported source always stays in the original text editor.
export function hasUnsupportedMarkdown(content: string) {
  return /<[!/?A-Za-z]|[{}]|^\s*(?:import|export)\s|\[\^[^\]]+\]|^\s*\[[^\]]+\]:|^\s*[-*+]\s+\[[ xX]\]|^\s*:::|^---\s*$|\$\$|^\s*\|.*:-|^\s*\|.*-:/m.test(content);
}
export function RichTextEditor({ content, onChange }: { content: string; onChange: (markdown: string) => void }) {
  const [insert, setInsert] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image.configure({ allowBase64: false }), TableKit, Markdown],
    content,
    contentType: "markdown",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "ed-prose", role: "textbox", "aria-label": "Contenido del documento, editor visual", "aria-multiline": "true" } },
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
  });
  if (!editor) return <p role="status">Preparando editor visual…</p>;
  const tools = [
    { label: "Negrita", icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: "Cursiva", icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Tachado", icon: Strikethrough, active: editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    { label: "Lista con viñetas", icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Lista numerada", icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Cita", icon: Quote, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "Insertar enlace", icon: LinkIcon, active: editor.isActive("link"), run: () => { setInsert("link"); setUrl(editor.getAttributes("link").href || ""); } },
    { label: "Insertar imagen", icon: ImagePlus, active: false, run: () => { setInsert("image"); setUrl(""); } },
    { label: "Insertar tabla", icon: Table2, active: editor.isActive("table"), run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: "Deshacer", icon: Undo2, active: false, run: () => editor.chain().focus().undo().run() },
    { label: "Rehacer", icon: Redo2, active: false, run: () => editor.chain().focus().redo().run() },
  ];
  function add() {
    try { if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error(); } catch { setError("Introduce una URL completa que empiece por https:// o http://."); return; }
    if (insert === "image" && !alt.trim()) { setError("Describe la imagen para las personas que utilizan lectores de pantalla."); return; }
    if (insert === "link") editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    else editor!.chain().focus().setImage({ src: url, alt }).run();
    setInsert(null); setUrl(""); setAlt(""); setError("");
  }
  return <div className="ed-rich-editor"><div className="ed-toolbar" role="toolbar" aria-label="Formato del texto"><label><span className="ed-sr-only">Estilo de párrafo</span><select aria-label="Estilo de párrafo" value={editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "p"} onChange={e => { if (e.target.value === "p") editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: Number(e.target.value) as 2 | 3 }).run(); }}><option value="p">Párrafo</option><option value="2">Título 2</option><option value="3">Título 3</option></select></label>{tools.map(tool => <button type="button" title={tool.label} aria-label={tool.label} aria-pressed={tool.active} key={tool.label} onClick={tool.run}><tool.icon size={17} /></button>)}{editor.isActive("link") && <button onClick={() => editor.chain().focus().unsetLink().run()}>Quitar enlace</button>}</div>
    {insert && <div className="ed-insert-form"><label htmlFor="insert-url">{insert === "link" ? "Dirección del enlace" : "Dirección pública de la imagen"}</label><input id="insert-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />{insert === "image" && <><label htmlFor="image-alt">Descripción de la imagen</label><input id="image-alt" value={alt} onChange={e => setAlt(e.target.value)} /></>}{error && <p role="alert" className="ed-error">{error}</p>}<button onClick={add}>Insertar</button><button onClick={() => { setInsert(null); setError(""); }}>Cancelar</button></div>}
    {editor.isActive("table") && <div className="ed-table-tools"><span>Tabla:</span><button onClick={() => editor.chain().focus().addRowAfter().run()}>Añadir fila</button><button onClick={() => editor.chain().focus().addColumnAfter().run()}>Añadir columna</button><button onClick={() => editor.chain().focus().deleteRow().run()}>Quitar fila</button><button onClick={() => editor.chain().focus().deleteColumn().run()}>Quitar columna</button><button onClick={() => editor.chain().focus().deleteTable().run()}>Quitar tabla</button></div>}
    <EditorContent editor={editor} /><p className="ed-rich-caption">El editor visual guarda Markdown. Revisa las diferencias antes de publicar.</p>
  </div>;
}
