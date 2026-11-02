// Grade da tela inicial (2026-11-02, §126). Fora do modo "Personalizar" só desenha os blocos na ordem/largura da pessoa.
// No modo "Personalizar" cada bloco ganha uma faixa: alça de arrastar (mouse ou toque; com a alça em foco, as setas movem),
// largura, Subir/Descer, Esconder (ou Excluir, no "Meu espaço"). Os escondidos ficam numa bandeja para voltar.
// Regras de layout (validação/mescla) em shared/homeLayout.js; gravação em src/home/homePrefs.js. Sem biblioteca nova: o
// dnd-kit já é o do quadro pessoal e do XFlow.
import React, { useMemo, useState } from 'react';
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronUp, ChevronDown, ArrowUpToLine, EyeOff, Eye, Plus, RotateCcw, Check, Trash2, SlidersHorizontal } from 'lucide-react';
import { Button, IconButton, Segmented } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { useHomePrefs, updateHomePrefs } from './homePrefs.js';
import MySpace from './MySpace.jsx';
import {
  BLOCKS, DEFAULT_LAYOUT, WIDTHS, WIDTH_LABEL, MAX_SPACES, isSpaceId, newSpaceId, mergeLayout, isDefaultLayout,
  moveBlock, moveBlockTo, setBlockWidth, setBlockHidden,
} from '../../shared/homeLayout.js';

export const GRID_CSS = `
.hg { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: stretch; }
.hb { display: flex; flex-direction: column; min-width: 0; }
.hb:not(.edit):has(> .hb-body:empty) { display: none; }
.hb-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.hb-body > * { flex: 1; margin: 0 !important; }
.hb[data-id="week"], .hb[data-id="continue"] { align-self: start; }
.hb.edit { border-radius: 16px; outline: 2px dashed var(--border-3); outline-offset: 4px; cursor: grab; touch-action: manipulation; align-self: start; }
.hb.edit.dragging { cursor: grabbing; }
/* No modo Personalizar cada bloco vira uma miniatura baixa: a tela inteira cabe na janela e dá para levar um bloco do fim ao topo sem rolar. */
.hb.edit .hb-body { flex: none; height: 90px; min-height: 0 !important; overflow: hidden; pointer-events: none; user-select: none; opacity: .82;
  -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent); mask-image: linear-gradient(to bottom, #000 55%, transparent); }
.hb.edit .hb-body:empty::before { content: 'Sem conteúdo agora: aparece quando houver.'; display: block; padding: 18px 20px; border-radius: 14px; border: 1px dashed var(--border-2); color: var(--text-4); font-size: var(--fs-sm); }
.hb.dragging { z-index: 5; opacity: .9; outline-color: var(--ui-accent); }
.hb-bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin: 0 0 8px; padding: 6px 8px; border-radius: var(--r-lg); background: var(--bg-3); border: 1px solid var(--border-2); }
.hb-grip { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--r-md); border: 1px solid var(--border-2); background: var(--bg-1); color: var(--text-3); cursor: grab; touch-action: none; }
.hb-grip:active { cursor: grabbing; }
.hb-grip:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.hb-name { flex: 1; min-width: 120px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-1); }
.hb-acts { display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; }
.hg-tools { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); padding: 12px 14px; border-radius: 14px; border: 1px solid var(--ui-accent); background: var(--ui-accent-bg); }
.hg-tools p { flex: 1 1 260px; margin: 0; font-size: var(--fs-sm); color: var(--text-2); }
.hg-tray { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); padding: 10px 14px; border-radius: 14px; border: 1px dashed var(--border-3); }
.hg-tray b { font-size: var(--fs-sm); color: var(--text-2); margin-right: 4px; }
@media (min-width: 720px) {
  .hg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hb { grid-column: 1 / -1; }
  .hb[data-w="2"] { grid-column: span 1; }
}
@media (min-width: 1200px) {
  .hg { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .hb[data-w="2"] { grid-column: span 2; } .hb[data-w="3"] { grid-column: span 3; } .hb[data-w="4"] { grid-column: span 4; } .hb[data-w="6"] { grid-column: span 6; }
  .hb[data-id="daily"] .hb-body, .hb[data-id="today"] .hb-body { min-height: 400px; }
  .hb[data-id="today"] .tp { position: relative; }
  .hb[data-id="today"] .tp-card { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }
  .hb[data-id="today"] .tp-scroll { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -10px; padding: 0 10px; }
}
@media (max-width: 719px) { .hb-width { display: none; } }
@media (prefers-reduced-motion: reduce) { .hb { transition: none !important; } }
`;

const WIDTH_OPTIONS = WIDTHS.map((w) => ({ value: w, label: WIDTH_LABEL[w] }));
const spaceTitle = (t) => (!t || t === 'Meu espaço' ? 'Meu espaço' : `${t} (Meu espaço)`);
const titleOf = (id, spaces) => (isSpaceId(id) ? spaceTitle(spaces[id] && spaces[id].title) : (BLOCKS.find((b) => b.id === id) || {}).title || id);

// Pega o bloco em qualquer ponto, menos nos botões e campos da faixa (clique neles continua sendo clique).
const fromControl = (e) => e.target.closest && e.target.closest('button:not(.hb-grip), input, select, textarea, a');

function Block({ item, index, total, edit, title, children, onMove, onMoveTop, onWidth, onHide, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !edit });
  const style = edit ? { transform: DndCSS.Translate.toString(transform), transition } : undefined;
  const grab = edit && listeners ? {
    onMouseDown: (e) => { if (!fromControl(e)) listeners.onMouseDown(e); },
    onTouchStart: (e) => { if (!fromControl(e)) listeners.onTouchStart(e); },
  } : null;
  return (
    <div ref={setNodeRef} style={style} {...grab} className={`hb${edit ? ' edit' : ''}${isDragging ? ' dragging' : ''}`} data-id={isSpaceId(item.id) ? 'space' : item.id} data-w={item.w}>
      {edit && (
        <div className="hb-bar">
          <button type="button" ref={setActivatorNodeRef} className="hb-grip" {...attributes} aria-roledescription="alça" aria-label={`Mover ${title}: arraste, ou use as setas (Home leva ao topo)`} title="Arraste o bloco para mover (ou setas do teclado)"
            onKeyDown={(e) => {
              if (e.key === 'Home') { e.preventDefault(); onMoveTop(item.id); return; }
              const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
              if (d) { e.preventDefault(); onMove(item.id, d); }
            }}>
            <GripVertical size={16} aria-hidden="true" />
          </button>
          <span className="hb-name">{title}</span>
          <span className="hb-width"><Segmented label={`Largura de ${title}`} value={item.w} onChange={(w) => onWidth(item.id, w)} options={WIDTH_OPTIONS} /></span>
          <span className="hb-acts">
            <IconButton size="sm" icon={ArrowUpToLine} label={`Levar ${title} para o topo`} disabled={index === 0} disabledReason="Já é o primeiro" onClick={() => onMoveTop(item.id)} />
            <IconButton size="sm" icon={ChevronUp} label={`Subir ${title}`} disabled={index === 0} disabledReason="Já é o primeiro" onClick={() => onMove(item.id, -1)} />
            <IconButton size="sm" icon={ChevronDown} label={`Descer ${title}`} disabled={index === total - 1} disabledReason="Já é o último" onClick={() => onMove(item.id, 1)} />
            {onDelete
              ? <IconButton size="sm" icon={Trash2} label={`Excluir ${title}`} onClick={() => onDelete(item.id)} />
              : <IconButton size="sm" icon={EyeOff} label={`Esconder ${title}`} onClick={() => onHide(item.id, true)} />}
          </span>
        </div>
      )}
      <div className="hb-body" inert={edit || undefined}>{children}</div>
    </div>
  );
}

// blocks: { id → nó } só com os blocos que esta pessoa pode ver (os outros ficam fora até no modo Personalizar).
export default function HomeGrid({ blocks, edit, onEditChange }) {
  const prefs = useHomePrefs();
  const [said, setSaid] = useState('');
  const layout = useMemo(() => mergeLayout(prefs.layout, prefs.spaces), [prefs.layout, prefs.spaces]);
  const usable = (it) => (isSpaceId(it.id) ? !!prefs.spaces[it.id] : blocks[it.id] !== undefined);
  const visible = layout.items.filter((it) => usable(it) && !it.hidden);
  const hidden = layout.items.filter((it) => usable(it) && it.hidden);
  const spaceCount = Object.keys(prefs.spaces).length;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );
  const tt = (id) => titleOf(id, prefs.spaces);
  const posOf = (lay, id) => lay.items.filter((it) => usable(it) && !it.hidden).findIndex((x) => x.id === id) + 1;

  function apply(next, message) {
    updateHomePrefs({ layout: next });
    if (message) setSaid(message);
  }
  const onMove = (id, d) => {
    // Subir/Descer pula os escondidos e os que esta pessoa não vê: anda uma posição na tela, não na lista guardada.
    const order = visible.map((x) => x.id);
    const i = order.indexOf(id);
    const target = order[i + d];
    if (!target) return;
    const next = moveBlockTo(layout, id, target);
    apply(next, `${tt(id)} agora é o ${posOf(next, id)}º de ${visible.length}.`);
  };
  const onMoveTop = (id) => {
    if (!visible.length || visible[0].id === id) return;
    apply(moveBlockTo(layout, id, visible[0].id), `${tt(id)} agora é o primeiro.`);
  };
  const onWidth = (id, w) => apply(setBlockWidth(layout, id, w), `${tt(id)}: largura ${WIDTH_LABEL[w]}.`);
  const onHide = (id, h) => apply(setBlockHidden(layout, id, h), h ? `${tt(id)} escondido. Ele fica na bandeja "Escondidos".` : `${tt(id)} de volta à tela.`);
  async function onDelete(id) {
    const ok = await askConfirm({ title: 'Excluir este bloco?', message: `"${tt(id)}" sai da tela com a anotação e os links dele.`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    const prevSpaces = prefs.spaces;
    const prevLayout = prefs.layout;
    const { [id]: _gone, ...spaces } = prefs.spaces;
    updateHomePrefs({ spaces, layout: { items: layout.items.filter((x) => x.id !== id) } });
    notify('Bloco excluído.', { undo: () => updateHomePrefs({ spaces: prevSpaces, layout: prevLayout }) });
  }
  function addSpace() {
    if (spaceCount >= MAX_SPACES) return;
    const id = newSpaceId();
    updateHomePrefs({ spaces: { ...prefs.spaces, [id]: { title: 'Meu espaço', note: '', links: [] } }, layout: { items: [{ id, w: 3 }, ...layout.items] } });
    setSaid('Bloco "Meu espaço" adicionado no começo da tela.');
  }
  async function restore() {
    const ok = await askConfirm({ title: 'Restaurar o padrão?', message: 'A ordem, as larguras e os blocos escondidos voltam a ser como os de todo mundo. Os seus blocos "Meu espaço" continuam, no fim da tela.', confirmLabel: 'Restaurar' });
    if (!ok) return;
    const prevLayout = prefs.layout;
    const spaceIds = Object.keys(prefs.spaces);
    updateHomePrefs({ layout: spaceIds.length ? { items: [...DEFAULT_LAYOUT.items, ...spaceIds.map((id) => ({ id, w: 3 }))] } : null });
    notify('Tela inicial de volta ao padrão.', { undo: () => updateHomePrefs({ layout: prevLayout }) });
  }
  function onDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const next = moveBlockTo(layout, active.id, over.id);
    apply(next, null);
  }
  const announcements = {
    onDragStart: ({ active }) => `${tt(active.id)} pego.`,
    onDragOver: ({ active, over }) => (over ? `${tt(active.id)} sobre ${tt(over.id)}.` : `${tt(active.id)} fora da grade.`),
    onDragEnd: ({ active, over }) => (over ? `${tt(active.id)} solto no lugar de ${tt(over.id)}.` : `${tt(active.id)} solto.`),
    onDragCancel: ({ active }) => `Movimento cancelado. ${tt(active.id)} voltou ao lugar.`,
  };

  const grid = (
    <div className="hg">
      {visible.map((it, i) => (
        <Block key={it.id} item={it} index={i} total={visible.length} edit={edit} title={tt(it.id)} onMove={onMove} onMoveTop={onMoveTop} onWidth={onWidth} onHide={onHide} onDelete={isSpaceId(it.id) ? onDelete : null}>
          {isSpaceId(it.id) ? <MySpace id={it.id} space={prefs.spaces[it.id]} spaces={prefs.spaces} editingLayout={edit} /> : blocks[it.id]}
        </Block>
      ))}
    </div>
  );

  return (
    <>
      <style>{GRID_CSS}</style>
      {edit && (
        <div className="hg-tools" role="region" aria-label="Personalizar a tela inicial">
          <p>Pegue o bloco em qualquer ponto e arraste, ou use Para o topo / Subir / Descer (ou as setas, com a alça <GripVertical size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> em foco). A largura vale na tela larga; no celular fica um bloco por linha. Salva sozinho, na sua conta.</p>
          <Button icon={Plus} onClick={addSpace} disabled={spaceCount >= MAX_SPACES} disabledReason={`No máximo ${MAX_SPACES} blocos "Meu espaço"`}>Meu espaço</Button>
          <Button icon={RotateCcw} onClick={restore} disabled={!prefs.layout || isDefaultLayout(layout)} disabledReason="Já está no padrão">Restaurar padrão</Button>
          <Button variant="primary" icon={Check} onClick={() => onEditChange(false)}>Concluir</Button>
        </div>
      )}
      {edit && hidden.length > 0 && (
        <div className="hg-tray" role="group" aria-label="Blocos escondidos">
          <b>Escondidos:</b>
          {hidden.map((it) => <Button key={it.id} size="sm" icon={Eye} onClick={() => onHide(it.id, false)} aria-label={`Mostrar ${tt(it.id)}`}>{tt(it.id)}</Button>)}
        </div>
      )}
      <p className="ui-sr" role="status" aria-live="polite">{said}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: 'Seta para cima ou para a esquerda sobe o bloco; para baixo ou para a direita desce.' } }}>
        <SortableContext items={visible.map((x) => x.id)} strategy={rectSortingStrategy}>{grid}</SortableContext>
      </DndContext>
    </>
  );
}

export function PersonalizeButton({ onClick, disabled }) {
  return <Button size="sm" icon={SlidersHorizontal} onClick={onClick} disabled={disabled} disabledReason="Carregando as suas preferências" title="Mudar a ordem, a largura e quais blocos aparecem">Personalizar</Button>;
}
