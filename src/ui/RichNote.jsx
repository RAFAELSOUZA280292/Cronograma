// Campo de texto formatado e compacto (2026-10-07): começa com poucas linhas, cresce enquanto se escreve e só mostra a barra
// de formatação com o cursor dentro. Negrito, itálico, listas e link — de propósito nada além disso.
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Link2 } from 'lucide-react';
import { askText } from './dialogs.jsx';
import { noteToEditorHtml, sanitizeNote } from '../lib/richNote.js';

const CSS = `
.rn { font-family: inherit; }
.rn-bar { display: flex; align-items: center; gap: 2px; padding: 4px; margin-bottom: 4px; border: 1px solid var(--border-2); border-radius: 9px; background: var(--bg-3); width: fit-content; max-width: 100%; flex-wrap: wrap; }
.rn-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-3); cursor: pointer; }
.rn-btn:hover { background: var(--bg-4); color: var(--text-1); }
.rn-btn.on { background: rgba(245,196,0,.18); color: var(--ui-accent-text); }
.rn-btn:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 1px; }
.rn-body .ProseMirror { min-height: 58px; max-height: 46vh; overflow-y: auto; padding: 10px 12px; border: 1px solid var(--border-2); border-radius: 10px; background: var(--bg-2); color: var(--text-1); font-size: 13.5px; line-height: 1.5; outline: none; }
.rn-body .ProseMirror:focus { border-color: var(--ui-accent, #F5C400); }
.rn-body .ProseMirror p { margin: 0 0 4px; }
.rn-body .ProseMirror p:last-child { margin-bottom: 0; }
.rn-body .ProseMirror ul, .rn-body .ProseMirror ol { margin: 2px 0 4px; padding-left: 22px; }
.rn-body .ProseMirror a { color: var(--ui-accent-text, #F5C400); text-decoration: underline; }
.rn-body .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: var(--text-5); }
.rn.ro .ProseMirror { background: transparent; }
@media (max-width: 640px) { .rn-btn { width: 44px; height: 44px; } }
`;

export default function RichNote({ value, format, onChange, onBlur, readOnly, placeholder, label = 'Descrição' }) {
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  const [focused, setFocused] = useState(false);
  // Depois da 1ª edição o valor passa a ser HTML mesmo que `format` (vindo do cartão salvo) ainda não tenha chegado.
  const editedRef = useRef(false);
  const formatRef = useRef(format);
  formatRef.current = format;
  const fmt = () => (editedRef.current ? 'html' : formatRef.current);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false }),
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: noteToEditorHtml(value, format),
    editable: !readOnly,
    editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: ed, transaction }) => { if (!transaction.docChanged) return; editedRef.current = true; if (onChangeRef.current) onChangeRef.current(ed.isEmpty ? '' : sanitizeNote(ed.getHTML())); },
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); if (onBlurRef.current) onBlurRef.current(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2º argumento false: sem isso o Tiptap dispara um "update" falso ao montar, e o cartão antigo viraria HTML só por ser aberto.
  useEffect(() => { if (editor) editor.setEditable(!readOnly, false); }, [editor, readOnly]);

  // Valor que mudou por fora (outra aba, API, "desfazer" do quadro) entra no editor só se o usuário não está digitando.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = noteToEditorHtml(value, fmt());
    const current = editor.isEmpty ? '' : sanitizeNote(editor.getHTML());
    if (current !== next) editor.commands.setContent(next, false);
  }, [value, editor]);

  if (!editor) return null;
  const keep = (e) => e.preventDefault();
  async function setLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = await askText({ title: 'Inserir link', label: 'Endereço do link (deixe vazio para remover)', defaultValue: prev, confirmLabel: 'Aplicar', required: false });
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url.trim()) chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}` }).run();
    else chain.unsetLink().run();
  }
  const btn = (on, name, title, onClick, icon) => (
    <button type="button" className={`rn-btn${on ? ' on' : ''}`} aria-label={name} aria-pressed={on} title={title} onMouseDown={keep} onClick={onClick}>{icon}</button>
  );

  return (
    <div className={`rn${readOnly ? ' ro' : ''}`}>
      <style>{CSS}</style>
      {!readOnly && focused && (
        <div className="rn-bar" role="toolbar" aria-label="Formatação do texto">
          {btn(editor.isActive('bold'), 'Negrito', 'Negrito (Ctrl+B)', () => editor.chain().focus().toggleBold().run(), <Bold size={15} aria-hidden="true" />)}
          {btn(editor.isActive('italic'), 'Itálico', 'Itálico (Ctrl+I)', () => editor.chain().focus().toggleItalic().run(), <Italic size={15} aria-hidden="true" />)}
          {btn(editor.isActive('bulletList'), 'Lista com marcadores', 'Lista com marcadores', () => editor.chain().focus().toggleBulletList().run(), <List size={15} aria-hidden="true" />)}
          {btn(editor.isActive('orderedList'), 'Lista numerada', 'Lista numerada', () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={15} aria-hidden="true" />)}
          {btn(editor.isActive('link'), 'Link', 'Link', setLink, <Link2 size={15} aria-hidden="true" />)}
        </div>
      )}
      <div className="rn-body"><EditorContent editor={editor} /></div>
    </div>
  );
}
