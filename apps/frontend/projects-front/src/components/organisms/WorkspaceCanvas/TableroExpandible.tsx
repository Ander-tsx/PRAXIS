'use client';

import { colors } from '@praxis/commons';
import { type ReactNode, useEffect, useState } from 'react';
import { BOARD_SURFACE } from './superficie-tablero';

export interface TableroExpandibleProps {
  /** Nombre del tablero. Nombra el botón de pantalla completa y el `aria-label`. */
  nombre: string;
  /** «4 columnas · 12 tareas». Lo compone quien nos monta. */
  resumen: string;
  /**
   * Sustituye al nombre y al resumen en la cabecera.
   *
   * Existe porque en un espacio con varios tableros lo que tiene que haber ahí
   * **no es el nombre del tablero abierto, sino la forma de cambiar de tablero**.
   * Escribir el nombre y además una fila de pestañas debajo gasta dos líneas en
   * decir lo mismo, y en una pantalla que ya no se desplaza cada línea de cromo
   * son cinco tarjetas menos.
   *
   * Llega como slot y no como `boards` + `onCambiar` porque este componente no
   * tiene por qué saber qué hay a la izquierda de sus controles: hoy es el
   * espacio y las pestañas, mañana podría ser otra cosa.
   */
  titulo?: ReactNode;
  /**
   * Controles extra de la cabecera, a la izquierda de «Ampliar».
   *
   * Llega como slot porque lo que va aquí depende de la pantalla que monta el
   * tablero —hoy el filtro de «solo mis tareas»— y este componente no tiene por
   * qué conocerlo. Se pinta con el mismo tratamiento que «Ampliar» para que se
   * lean como lo que son: los dos controles de vista del tablero.
   */
  accionesDeVista?: ReactNode;
  /**
   * Las acciones del tablero en sí —renombrarlo, eliminarlo—, a la derecha del
   * todo.
   *
   * Separado de `accionesDeVista` porque no son lo mismo y el orden importa:
   * los de vista cambian **cómo se mira** lo que hay y no tocan nada, este
   * cambia el tablero. Van en grupos distintos para que no se pulse uno
   * queriendo el otro, y el destructivo queda detrás de un menú.
   */
  menu?: ReactNode;
  /** La tira de columnas. Llega como slot: aquí no se sabe qué hay dentro. */
  children: ReactNode;
}

/**
 * Cabecera del tablero y su botón de pantalla completa.
 *
 * Un tablero de cinco columnas en el ancho de la página deja cada una en 288 px
 * con la lista de tarjetas recortada a `55vh`. Para reorganizar de verdad —mover
 * varias tarjetas, comparar columnas— hace falta la pantalla entera.
 *
 * ⚠️ **No usa la API de pantalla completa del navegador**, y es deliberado. Esa
 * API entrega un elemento al modo nativo, y el `<dialog open>` del detalle de
 * tarea se pinta en la capa superior del documento: al abrir una tarea desde un
 * tablero en pantalla completa nativa, el diálogo aparecía **detrás**. Un
 * `position: fixed` no tiene ese problema y además sale con Escape, que es lo
 * que la gente intenta primero.
 *
 * ⚠️ El contenedor alterna entre `display: contents` y `position: fixed`, y esa
 * es la pieza que hace que esto funcione: **son los mismos nodos del DOM en los
 * dos modos**. Renderizar `children` en dos ramas distintas del árbol los
 * desmontaría y volvería a montar al expandir, y con ellos se iría el estado de
 * `BoardColumns` —el orden que estés arrastrando, la tarea que tengas abierta—.
 * Con `contents` el envoltorio desaparece del layout y la cabecera y las
 * columnas siguen siendo hijos directos de la sección, exactamente como si esto
 * no existiera.
 */
export function TableroExpandible({
  nombre,
  resumen,
  titulo,
  accionesDeVista,
  menu,
  children,
}: TableroExpandibleProps) {
  const [expandido, setExpandido] = useState(false);

  useEffect(() => {
    if (!expandido) return;

    function alPulsarTecla(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpandido(false);
    }

    /**
     * Se bloquea el desplazamiento del fondo mientras dura.
     *
     * Sin esto, la rueda sobre el tablero expandido mueve la página de debajo:
     * al salir te encuentras en otro punto del proyecto sin haber navegado.
     * Se guarda el valor previo en vez de asumir `''`, por si algo más lo
     * hubiera tocado antes.
     */
    const desbordeInicial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', alPulsarTecla);

    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      document.body.style.overflow = desbordeInicial;
    };
  }, [expandido]);

  return (
    <div
      className={
        /* Sin `overflow-auto`: quien se desplaza es la tira de columnas y la
           lista de cada columna. Una barra aquí encima sería la tercera, y
           desplazar la de fuera dejaría la cabecera fuera de la pantalla. */
        expandido ? 'fixed inset-0 z-40 flex min-h-0 flex-col gap-3 p-5' : 'contents'
      }
      /**
       * En pantalla completa se lleva consigo la retícula de puntos del lienzo.
       *
       * Sin ella, ampliar cambiaba el tablero de sitio **y** de aspecto: pasabas
       * de una superficie con textura a un rectángulo liso, y costaba reconocer
       * que seguías en lo mismo.
       *
       * ⚠️ `backgroundColor` va **después** del `background` de `BOARD_SURFACE`,
       * y el orden importa: la forma corta pone el color en transparente al
       * aplicar el degradado, así que sin esta línea detrás se vería la página
       * por debajo de una capa que se supone opaca.
       */
      style={expandido ? { ...BOARD_SURFACE, backgroundColor: colors.background } : undefined}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        {titulo ?? (
          <>
            <h4 className="font-sans text-base font-semibold text-text-primary">{nombre}</h4>
            {/* Más contraste que antes: sobre el fondo del lienzo, `text-disabled`
                se leía como un borrón. */}
            <span className="font-sans text-xs text-text-secondary">{resumen}</span>
          </>
        )}

        {/* Empujado a la derecha por el `ml-auto` del grupo, no del botón: así
            los dos controles de vista viajan juntos y no se separan cuando el
            nombre del tablero es largo. */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {accionesDeVista}

          <button
            type="button"
            onClick={() => setExpandido((actual) => !actual)}
            aria-expanded={expandido}
            aria-label={
              expandido
                ? `Salir de pantalla completa del tablero ${nombre}`
                : `Ver el tablero ${nombre} en pantalla completa`
            }
            title={expandido ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {expandido ? <MinimizarIcono /> : <MaximizarIcono />}
            {expandido ? 'Salir' : 'Ampliar'}
          </button>

          {menu}
        </div>
      </header>

      {children}
    </div>
  );
}

/**
 * `maximize-2` de Lucide.
 *
 * Dos flechas en diagonal, no las cuatro esquinas que había: a 16 px, cuatro
 * flechas son ocho trazos que se juntan y se leen como una mancha. Lucide dibuja
 * a 24×24 con trazo 2 y remates redondos, igual que los Heroicons del resto del
 * repo, así que conviven sin desentonar.
 */
export function MaximizarIcono() {
  return (
    <IconoLucide>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" x2="14" y1="3" y2="10" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </IconoLucide>
  );
}

/** `minimize-2` de Lucide: la pareja de arriba, para salir. */
export function MinimizarIcono() {
  return (
    <IconoLucide>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" x2="21" y1="10" y2="3" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </IconoLucide>
  );
}

function IconoLucide({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
