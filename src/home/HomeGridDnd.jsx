// Arrastar da tela inicial: só carregado ao entrar em "Personalizar" (o dnd-kit saía no pacote principal de todo mundo).
import React from 'react';
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';

function SortableItem({ id, render }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return render({ attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style: { transform: DndCSS.Translate.toString(transform), transition } });
}

export default function HomeGridDnd({ ids, onDragEnd, announcements, renderItem }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'Seta para cima ou para a esquerda sobe o bloco; para baixo ou para a direita desce.' } }}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="hg">{ids.map((id, i) => <SortableItem key={id} id={id} render={(sortable) => renderItem(id, i, sortable)} />)}</div>
      </SortableContext>
    </DndContext>
  );
}
