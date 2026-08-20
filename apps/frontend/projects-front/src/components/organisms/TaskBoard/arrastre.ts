/**
 * Piezas sueltas del arrastre del tablero: tipos, constantes y geometría.
 *
 * Aquí no hay React ni DOM propio a propósito. Todo lo que decide **dónde cae**
 * una tarjeta es aritmética sobre rectángulos, y separarlo del hook permite
 * leerlo —y equivocarse en ello— sin tener el ciclo de vida delante.
 *
 * ⚠️ **Esto sustituye a la API nativa de arrastre del navegador**, que es la que
 * teníamos. `draggable` + `dragover` + `drop` es lo más barato de escribir y lo
 * peor de usar: el navegador dibuja su propio fantasma —una captura translúcida
 * que no se puede animar ni girar—, no emite eventos con la frecuencia del
 * puntero, no existe en pantallas táctiles, y `dragover` solo dice «estás encima
 * de este elemento», nunca **entre qué dos tarjetas**. De ahí salían los dos
 * defectos que se ven: el movimiento a saltos y que soltar en una columna
 * siempre mandara la tarea al final.
 *
 * Con eventos de puntero controlamos las tres cosas: el fantasma es un nodo
 * nuestro, la posición se actualiza a la frecuencia de la pantalla y el destino
 * se calcula midiendo, así que sabemos el hueco exacto.
 */

/**
 * Píxeles que hay que recorrer con el botón pulsado antes de que aquello cuente
 * como arrastre y no como clic.
 *
 * Es el mismo umbral que ya usaba `TaskCard` para decidir si un clic abría la
 * tarea, y ahora es **el mismo número para las dos decisiones** — antes había
 * uno para abrir y el navegador tenía el suyo, invisible, para arrastrar.
 */
export const UMBRAL_DE_ARRASTRE = 5;

/**
 * Lo que tarda un dedo en decir «quiero mover esto» y no «quiero desplazar».
 *
 * En un ratón el gesto se distingue solo por la dirección, pero en una pantalla
 * táctil arrastrar y desplazar empiezan igual. La pulsación mantenida es la
 * convención que ya usa cualquier tablero móvil: por debajo de ~200 ms se
 * dispara al desplazar, por encima de ~400 ms se siente rota.
 */
export const PULSACION_LARGA_MS = 240;

/** Franja del borde donde el lienzo empieza a desplazarse solo mientras arrastras. */
export const MARGEN_DE_AUTODESPLAZAMIENTO = 88;

/** Píxeles por fotograma en el borde mismo. Se interpola hasta 0 en el margen. */
export const VELOCIDAD_DE_AUTODESPLAZAMIENTO = 24;

/** Duración de las reposiciones (FLIP) y del aterrizaje del fantasma. */
export const DURACION_DE_REPOSICION_MS = 220;

/**
 * La curva de todo lo que se mueve en el tablero.
 *
 * Sale rápido y frena largo: es la que hace que un objeto pesado parezca que
 * tiene inercia. Un `ease-out` corriente arranca igual pero se detiene seco, y
 * en un elemento que el usuario acaba de soltar con la mano eso se lee como un
 * corte.
 */
export const CURVA = 'cubic-bezier(0.22, 0.85, 0.28, 1)';

export type TipoDeArrastre = 'tarea' | 'columna';

/** Cómo se colocan las tarjetas dentro de una columna. Decide cómo se busca el hueco. */
export type Disposicion = 'columna' | 'rejilla';

export interface ArrastreEnCurso {
  tipo: TipoDeArrastre;
  id: string;
  /** Columna de la que salió la tarea. Cadena vacía cuando lo que viaja es una columna. */
  columnaOrigen: string;
  /** Medidas del elemento original: el fantasma y el hueco se pintan con ellas. */
  ancho: number;
  alto: number;
  /**
   * Dónde va el fantasma **en su primer fotograma**.
   *
   * Va en el estado y no solo en el bucle porque el nodo se monta con este
   * render: sin una posición inicial en el `style`, el navegador lo pinta una
   * vez en la esquina superior izquierda y el siguiente fotograma lo teletransporta
   * hasta el puntero. Un solo fotograma, y se ve.
   */
  inicialX: number;
  inicialY: number;
}

export interface DestinoDeTarea {
  columnId: string;
  /** Índice de inserción **en la lista ya sin la tarea que viaja**. */
  indice: number;
}

export interface TarjetaMedida {
  id: string;
  caja: DOMRect;
}

/**
 * ¿En qué hueco cae el puntero?
 *
 * Devuelve el índice de inserción dentro de `tarjetas`, que llega **sin la
 * tarjeta que se está arrastrando**: el hueco 0 es «antes de todas» y
 * `tarjetas.length` es «al final».
 *
 * Son dos criterios y no uno porque las dos disposiciones no se recorren igual:
 *
 * - En una **columna** solo cuenta la vertical. Cada tarjeta ocupa el ancho
 *   entero, así que mirar la horizontal daría un hueco distinto según por qué
 *   lado del título pase el cursor — que es exactamente el temblor que hace que
 *   un tablero se sienta impredecible.
 * - En una **rejilla** hay varias por fila, así que primero se decide la fila
 *   (vertical) y dentro de ella el lado (horizontal).
 */
export function huecoBajoElPuntero(
  tarjetas: TarjetaMedida[],
  x: number,
  y: number,
  disposicion: Disposicion,
): number {
  for (let i = 0; i < tarjetas.length; i++) {
    const caja = tarjetas[i].caja;

    if (disposicion === 'columna') {
      if (y < caja.top + caja.height / 2) return i;
      continue;
    }

    /* Rejilla: por encima de la fila entera, o dentro de ella y a la izquierda
       del centro de esta tarjeta. */
    if (y < caja.top) return i;
    if (y <= caja.bottom && x < caja.left + caja.width / 2) return i;
  }

  return tarjetas.length;
}

/**
 * Cuánto hay que desplazar un contenedor porque el puntero está pegado a un borde.
 *
 * Devuelve píxeles por fotograma, negativos hacia el principio. La velocidad es
 * **proporcional a lo cerca que estés del borde** y no un valor fijo: con una
 * constante, entrar un píxel en la franja dispara el desplazamiento a toda
 * velocidad y el tablero se va de golpe.
 */
export function empujeDeAutodesplazamiento(posicion: number, inicio: number, fin: number): number {
  const margen = Math.min(MARGEN_DE_AUTODESPLAZAMIENTO, (fin - inicio) / 3);
  if (margen <= 0) return 0;

  if (posicion < inicio + margen) {
    const cercania = (inicio + margen - posicion) / margen;
    return -VELOCIDAD_DE_AUTODESPLAZAMIENTO * Math.min(1, cercania);
  }
  if (posicion > fin - margen) {
    const cercania = (posicion - (fin - margen)) / margen;
    return VELOCIDAD_DE_AUTODESPLAZAMIENTO * Math.min(1, cercania);
  }
  return 0;
}

/** ¿Ha pedido esta persona que las cosas no se muevan? */
export function movimientoReducido(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
