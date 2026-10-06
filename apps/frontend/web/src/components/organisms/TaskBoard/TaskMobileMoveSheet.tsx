'use client';

import { HojaDeAcciones } from '@praxis/commons';

export interface TaskMobileMoveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  columns: { id: string; name: string }[];
  currentColumnId: string;
  onMoveToColumn: (columnId: string) => void;
}

/**
 * «Mover a…» con el dedo: lo que abre una pulsación larga sobre una tarjeta
 * del Kanban, porque en un teléfono las tarjetas no se arrastran (D12 de
 * `docs/PLAN-MOVIL.md`).
 *
 * Era una hoja hecha a mano, con su propia animación en un `<style>` y sin
 * arrastrar para cerrar ni fondo inerte. Ahora es la `HojaDeAcciones` de
 * siempre. `tambienEnTableta`: la pulsación larga también llega desde una
 * tableta, que por ancho ya es escritorio.
 */
export function TaskMobileMoveSheet({
  isOpen,
  onClose,
  columns,
  currentColumnId,
  onMoveToColumn,
}: TaskMobileMoveSheetProps) {
  return (
    <HojaDeAcciones
      abierta={isOpen}
      onCerrar={onClose}
      titulo="Mover a…"
      tambienEnTableta
      acciones={columns.map((col) => ({
        clave: col.id,
        etiqueta: col.id === currentColumnId ? `${col.name} (actual)` : col.name,
        deshabilitada: col.id === currentColumnId,
        onElegir: () => onMoveToColumn(col.id),
      }))}
    />
  );
}
