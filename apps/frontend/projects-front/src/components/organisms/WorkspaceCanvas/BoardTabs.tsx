'use client';

import type { Board } from '@praxis/commons';
import { alpha, colors } from '@praxis/commons';

export interface BoardTabsProps {
  boards: Board[];
  activeId: string;
  onCambiar: (boardId: string) => void;
  /** Cuántas tareas tiene cada tablero, para la cifra de la pestaña. */
  tareasPorTablero: Map<string, number>;
}

/**
 * Los tableros del espacio, uno al lado de otro, y solo se ve el elegido.
 *
 * ⚠️ **Antes se apilaban todos, uno debajo de otro.** Cada tablero traía su
 * lienzo de puntos, su cabecera y su tira de columnas con desplazamiento
 * horizontal propio, así que un espacio con tres tableros era una página de tres
 * pantallas de alto con tres barras horizontales dentro. El resultado en la mano
 * es el que se describía como «ortopédico»: la rueda del ratón desplazaba la
 * página o una columna según dónde estuviera el cursor, y llegar al tercer
 * tablero exigía recorrer los dos primeros.
 *
 * Con un solo tablero visible el tablero **es** la pantalla: hay un único
 * desplazamiento vertical (dentro de una columna) y uno horizontal (la tira de
 * columnas), y ninguno de los dos es el de la página.
 *
 * **El cambio no navega.** Las tareas de todos los tableros del espacio ya
 * vienen en la misma carga —la page las pide en paralelo—, así que cambiar de
 * tablero es estado de cliente y es instantáneo. Pedirlo al servidor sería una
 * vuelta entera para enseñar algo que ya está en memoria.
 */
export function BoardTabs({ boards, activeId, onCambiar, tareasPorTablero }: BoardTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Tableros del espacio"
      className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto"
    >
      {boards.map((board) => {
        const activo = board.id === activeId;
        const tareas = tareasPorTablero.get(board.id) ?? 0;

        return (
          <button
            key={board.id}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onCambiar(board.id)}
            title={`${board.name} · ${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}`}
            className={[
              'flex max-w-[13rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1',
              'font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              activo
                ? 'font-semibold text-white'
                : 'text-white hover:bg-[#1c1c1b] hover:text-white',
            ].join(' ')}
            style={activo ? { background: alpha(colors.primary, 12) } : undefined}
          >
            <span className="truncate">{board.name}</span>
            {tareas > 0 && (
              <span className="shrink-0 font-sans text-[11px] tabular-nums text-white">
                {tareas}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
