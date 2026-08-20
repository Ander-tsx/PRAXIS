'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ArrastreEnCurso,
  type DestinoDeTarea,
  type Disposicion,
  MARGEN_DE_AUTODESPLAZAMIENTO,
  PULSACION_LARGA_MS,
  type TarjetaMedida,
  UMBRAL_DE_ARRASTRE,
  empujeDeAutodesplazamiento,
  huecoBajoElPuntero,
} from './arrastre';

/**
 * El gesto de arrastrar del tablero, entero.
 *
 * Mantiene tres cosas y ninguna más: **qué viaja**, **dónde caería ahora mismo**
 * y **dónde está el puntero**. Lo tercero no es estado de React —cambia sesenta
 * veces por segundo— así que vive en un `ref` y se escribe directamente en el
 * `transform` del fantasma dentro del bucle de fotogramas. Lo segundo sí es
 * estado, pero cambia solo al cruzar el centro de una tarjeta: unas pocas veces
 * por arrastre, no por fotograma.
 *
 * Esa separación es lo que hace que el movimiento se sienta continuo. Un
 * `useState` con la posición del puntero repinta el árbol del tablero entero en
 * cada `pointermove`, y con veinte tarjetas eso ya no cabe en 16 ms: sale a
 * tirones, que es justo lo que se quería arreglar.
 *
 * ### Lo que registra, y por qué hace falta registrarlo
 *
 * El destino se **mide**, no se deduce de eventos. Para medir hace falta tener
 * los nodos: la pista horizontal, cada columna, la lista desplazable de cada
 * columna y cada tarjeta. De ahí los cuatro `registrar*`, que los componentes
 * llaman desde su `ref`. A cambio de ese trámite se obtiene lo que la API nativa
 * no daba: el hueco exacto entre dos tarjetas, y no solo «encima de esta
 * columna».
 *
 * ### Ratón y dedo empiezan distinto
 *
 * Con ratón basta con recorrer `UMBRAL_DE_ARRASTRE` píxeles. Con el dedo no:
 * desplazar la pantalla empieza con el mismo gesto, así que hace falta una
 * **pulsación mantenida** y, si el dedo se mueve antes de que venza, aquello era
 * un desplazamiento y no se toca nada.
 */
export interface OpcionesDeArrastre {
  /**
   * La tarea se soltó en un hueco concreto.
   *
   * El tercer argumento es **dónde estaba el fantasma al soltar**, y no es un
   * dato de adorno: es el punto desde el que la tarjeta de verdad tiene que
   * volar hasta su sitio nuevo. Sin él, la tarjeta aparecería de la nada en la
   * columna destino y el gesto terminaría en un corte.
   */
  alSoltarTarea: (taskId: string, destino: DestinoDeTarea, cajaDelFantasma: DOMRect | null) => void;
  /** La columna se soltó en una posición concreta de la pista. */
  alSoltarColumna: (columnId: string, indice: number, cajaDelFantasma: DOMRect | null) => void;
  /** Si es `false`, ningún gesto llega a empezar (sin permiso, o proyecto suspendido). */
  activo?: boolean;
}

interface Pendiente {
  tipo: 'tarea' | 'columna';
  id: string;
  columnaOrigen: string;
  elemento: HTMLElement;
  x0: number;
  y0: number;
  /** Punto de agarre dentro del elemento: el fantasma se coloca respecto a él. */
  agarreX: number;
  agarreY: number;
  ancho: number;
  alto: number;
  puntero: number;
  esTactil: boolean;
  temporizador: ReturnType<typeof setTimeout> | null;
}

export function useArrastreDeTablero({
  alSoltarTarea,
  alSoltarColumna,
  activo = true,
}: OpcionesDeArrastre) {
  const [arrastre, setArrastre] = useState<ArrastreEnCurso | null>(null);
  const [destinoTarea, setDestinoTarea] = useState<DestinoDeTarea | null>(null);
  const [destinoColumna, setDestinoColumna] = useState<number | null>(null);

  /** El nodo flotante que sigue al puntero. Lo pinta quien nos usa. */
  const fantasmaRef = useRef<HTMLDivElement | null>(null);

  const pista = useRef<HTMLElement | null>(null);
  const columnas = useRef(new Map<string, HTMLElement>());
  const listas = useRef(new Map<string, { el: HTMLElement; disposicion: Disposicion }>());
  const tarjetas = useRef(new Map<string, Map<string, HTMLElement>>());

  /**
   * Las funciones de suelta, en un `ref`.
   *
   * Quien nos usa las recalcula en cada render —dependen del reparto de tareas,
   * que cambia con cada movimiento—, y si entraran en las dependencias del
   * efecto que engancha los oyentes de `window`, ese efecto se desmontaría y se
   * volvería a montar varias veces **durante** el arrastre. Funciona, pero es
   * frágil por nada: aquí lo único que hace falta es llamar a la última versión.
   */
  const alSoltar = useRef({ tarea: alSoltarTarea, columna: alSoltarColumna });
  alSoltar.current = { tarea: alSoltarTarea, columna: alSoltarColumna };

  const pendiente = useRef<Pendiente | null>(null);
  const enCurso = useRef<Pendiente | null>(null);
  const puntero = useRef({ x: 0, y: 0 });
  const ultimoMedido = useRef({ x: Number.NaN, y: Number.NaN });
  const fotograma = useRef<number | null>(null);
  const destinoRef = useRef<DestinoDeTarea | null>(null);
  const destinoColumnaRef = useRef<number | null>(null);

  /* ─── Registro de nodos ──────────────────────────────────────────────── */

  const registrarPista = useCallback((el: HTMLElement | null) => {
    pista.current = el;
  }, []);

  const registrarColumna = useCallback((columnId: string, el: HTMLElement | null) => {
    if (el) columnas.current.set(columnId, el);
    else columnas.current.delete(columnId);
  }, []);

  const registrarLista = useCallback(
    (columnId: string, el: HTMLElement | null, disposicion: Disposicion) => {
      if (el) listas.current.set(columnId, { el, disposicion });
      else listas.current.delete(columnId);
    },
    [],
  );

  const registrarTarjeta = useCallback(
    (columnId: string, taskId: string, el: HTMLElement | null) => {
      let deLaColumna = tarjetas.current.get(columnId);
      if (!deLaColumna) {
        deLaColumna = new Map();
        tarjetas.current.set(columnId, deLaColumna);
      }
      if (el) deLaColumna.set(taskId, el);
      else deLaColumna.delete(taskId);
    },
    [],
  );

  /* ─── Medida ─────────────────────────────────────────────────────────── */

  /**
   * Las tarjetas de una columna, ordenadas **como se ven**.
   *
   * No por orden de registro: React monta y desmonta en el orden que le
   * conviene, y en una rejilla el orden del DOM no dice nada de la fila. Se
   * ordena por posición real —arriba primero, y a igual altura, izquierda
   * primero—, que es el orden en el que el ojo busca el hueco.
   */
  const medirTarjetas = useCallback((columnId: string, excluir: string): TarjetaMedida[] => {
    const deLaColumna = tarjetas.current.get(columnId);
    if (!deLaColumna) return [];

    const medidas: TarjetaMedida[] = [];
    for (const [id, el] of deLaColumna) {
      if (id === excluir) continue;
      if (!el.isConnected) continue;
      medidas.push({ id, caja: el.getBoundingClientRect() });
    }

    medidas.sort((a, b) => a.caja.top - b.caja.top || a.caja.left - b.caja.left);
    return medidas;
  }, []);

  /** ¿Sobre qué columna está el puntero? Se mira la columna entera, no solo su lista. */
  const columnaBajoElPuntero = useCallback((x: number, y: number): string | null => {
    let mejor: { id: string; distancia: number } | null = null;

    for (const [id, el] of columnas.current) {
      const caja = el.getBoundingClientRect();
      if (y < caja.top - 40 || y > caja.bottom + 40) continue;

      if (x >= caja.left && x <= caja.right) return id;

      /* Fuera por los lados: se guarda la más cercana como red de seguridad,
         para que arrastrar por el hueco entre dos columnas no deje el gesto sin
         destino y la tarjeta rebote al origen. */
      const distancia = x < caja.left ? caja.left - x : x - caja.right;
      if (!mejor || distancia < mejor.distancia) mejor = { id, distancia };
    }

    return mejor && mejor.distancia < 120 ? mejor.id : null;
  }, []);

  /** Posición de la pista en la que caería la columna que viaja. */
  const huecoDeColumna = useCallback((x: number, arrastrada: string): number | null => {
    const cajas: { id: string; caja: DOMRect }[] = [];
    for (const [id, el] of columnas.current) {
      if (id === arrastrada) continue;
      cajas.push({ id, caja: el.getBoundingClientRect() });
    }
    if (cajas.length === 0) return 0;

    cajas.sort((a, b) => a.caja.left - b.caja.left);
    for (let i = 0; i < cajas.length; i++) {
      if (x < cajas[i].caja.left + cajas[i].caja.width / 2) return i;
    }
    return cajas.length;
  }, []);

  /* ─── Bucle de fotogramas ────────────────────────────────────────────── */

  const recalcular = useCallback(() => {
    const activo = enCurso.current;
    if (!activo) return;

    const { x, y } = puntero.current;

    if (activo.tipo === 'tarea') {
      const columnId = columnaBajoElPuntero(x, y);
      if (!columnId) return;

      const lista = listas.current.get(columnId);
      const indice = huecoBajoElPuntero(
        medirTarjetas(columnId, activo.id),
        x,
        y,
        lista?.disposicion ?? 'columna',
      );

      const anterior = destinoRef.current;
      if (anterior && anterior.columnId === columnId && anterior.indice === indice) return;

      const nuevo = { columnId, indice };
      destinoRef.current = nuevo;
      setDestinoTarea(nuevo);
      return;
    }

    const indice = huecoDeColumna(x, activo.id);
    if (indice === null || indice === destinoColumnaRef.current) return;
    destinoColumnaRef.current = indice;
    setDestinoColumna(indice);
  }, [columnaBajoElPuntero, huecoDeColumna, medirTarjetas]);

  /**
   * ¿Está el puntero pegado a un borde que se puede desplazar?
   *
   * Sirve para saber si hay que **seguir pidiendo fotogramas con el puntero
   * quieto**: en la franja del borde el tablero se mueve solo, así que sin este
   * bucle el desplazamiento se detendría hasta el siguiente movimiento del dedo.
   */
  const estaEnLaFranja = useCallback(
    (x: number, y: number): boolean => {
      const tira = pista.current;
      if (tira) {
        const caja = tira.getBoundingClientRect();
        if (x < caja.left + MARGEN_DE_AUTODESPLAZAMIENTO) return true;
        if (x > caja.right - MARGEN_DE_AUTODESPLAZAMIENTO) return true;
      }
      const encima = columnaBajoElPuntero(x, y);
      const lista = encima ? listas.current.get(encima) : null;
      if (lista) {
        const caja = lista.el.getBoundingClientRect();
        if (y < caja.top + MARGEN_DE_AUTODESPLAZAMIENTO) return true;
        if (y > caja.bottom - MARGEN_DE_AUTODESPLAZAMIENTO) return true;
      }
      return false;
    },
    [columnaBajoElPuntero],
  );

  /**
   * Un fotograma: desplaza si toca, mueve el fantasma y recalcula el hueco.
   *
   * El orden importa. Primero el desplazamiento automático, porque cambia lo que
   * hay debajo del puntero; luego el fantasma, que solo depende del puntero; y
   * al final la medida, que ya ve el resultado de lo anterior.
   */
  const pintar = useCallback(() => {
    fotograma.current = null;
    const activo = enCurso.current;
    if (!activo) return;

    const { x, y } = puntero.current;
    let huboDesplazamiento = false;

    /* Horizontal: la pista de columnas. Es lo que permite llevar una tarjeta a
       una columna que ni siquiera está en pantalla. */
    const tira = pista.current;
    if (tira) {
      const caja = tira.getBoundingClientRect();
      const empuje = empujeDeAutodesplazamiento(x, caja.left, caja.right);
      if (empuje !== 0 && tira.scrollWidth > tira.clientWidth) {
        const antes = tira.scrollLeft;
        tira.scrollLeft += empuje;
        huboDesplazamiento ||= tira.scrollLeft !== antes;
      }
    }

    /* Vertical: la lista de la columna que hay debajo. Solo esa: desplazar
       todas a la vez dejaría el tablero irreconocible al soltar. */
    const encima = activo.tipo === 'tarea' ? columnaBajoElPuntero(x, y) : null;
    const lista = encima ? listas.current.get(encima) : null;
    if (lista) {
      const caja = lista.el.getBoundingClientRect();
      const empuje = empujeDeAutodesplazamiento(y, caja.top, caja.bottom);
      if (empuje !== 0 && lista.el.scrollHeight > lista.el.clientHeight) {
        const antes = lista.el.scrollTop;
        lista.el.scrollTop += empuje;
        huboDesplazamiento ||= lista.el.scrollTop !== antes;
      }
    }

    const fantasma = fantasmaRef.current;
    if (fantasma) {
      fantasma.style.transform = `translate3d(${x - activo.agarreX}px, ${y - activo.agarreY}px, 0)`;
    }

    const seMovio =
      Math.abs(x - ultimoMedido.current.x) >= 1 || Math.abs(y - ultimoMedido.current.y) >= 1;
    if (seMovio || huboDesplazamiento) {
      ultimoMedido.current = { x, y };
      recalcular();
    }

    /* Se sigue pidiendo fotograma mientras el puntero esté en la franja de
       autodesplazamiento: ahí el tablero se mueve **sin que el dedo se mueva**,
       y sin este bucle se quedaría parado hasta el siguiente `pointermove`. */
    if (huboDesplazamiento || estaEnLaFranja(x, y)) {
      fotograma.current = requestAnimationFrame(pintar);
    }
  }, [recalcular, columnaBajoElPuntero, estaEnLaFranja]);

  const pedirFotograma = useCallback(() => {
    if (fotograma.current === null) fotograma.current = requestAnimationFrame(pintar);
  }, [pintar]);

  /* ─── Ciclo de vida del gesto ────────────────────────────────────────── */

  const limpiar = useCallback(() => {
    if (pendiente.current?.temporizador) clearTimeout(pendiente.current.temporizador);
    pendiente.current = null;
    enCurso.current = null;
    destinoRef.current = null;
    destinoColumnaRef.current = null;
    if (fotograma.current !== null) {
      cancelAnimationFrame(fotograma.current);
      fotograma.current = null;
    }
    setArrastre(null);
    setDestinoTarea(null);
    setDestinoColumna(null);
    document.body.classList.remove('arrastrando-en-tablero');
  }, []);

  const activar = useCallback(() => {
    const p = pendiente.current;
    if (!p || enCurso.current) return;

    if (p.temporizador) clearTimeout(p.temporizador);
    p.temporizador = null;
    enCurso.current = p;
    /* ⚠️ Infinito y no `NaN`: la comparación de más abajo es `Math.abs(x - antes) >= 1`,
       y **cualquier** comparación con `NaN` da `false`. Con `NaN` aquí, el primer
       fotograma decidía que el puntero no se había movido, no actualizaba la
       referencia, y volvía a decidir lo mismo para siempre: el hueco se quedaba
       donde apareciera y el arrastre no cambiaba de destino nunca. */
    ultimoMedido.current = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };

    /* El cursor de agarre y la prohibición de seleccionar texto se ponen en el
       `<body>`: mientras dura el gesto el puntero puede estar sobre cualquier
       cosa, y el estilo tiene que valer para toda la pantalla. */
    document.body.classList.add('arrastrando-en-tablero');

    setArrastre({
      tipo: p.tipo,
      id: p.id,
      columnaOrigen: p.columnaOrigen,
      ancho: p.ancho,
      alto: p.alto,
      inicialX: puntero.current.x - p.agarreX,
      inicialY: puntero.current.y - p.agarreY,
    });

    /* El destino de partida es el sitio donde ya está: así el hueco aparece
       exactamente debajo de la tarjeta que acabas de levantar, y no hay ningún
       salto entre coger y empezar a mover. */
    if (p.tipo === 'tarea') {
      const medidas = medirTarjetas(p.columnaOrigen, p.id);
      const indice = huecoBajoElPuntero(
        medidas,
        p.x0,
        p.y0,
        listas.current.get(p.columnaOrigen)?.disposicion ?? 'columna',
      );
      const inicial = { columnId: p.columnaOrigen, indice };
      destinoRef.current = inicial;
      setDestinoTarea(inicial);
    } else {
      const indice = huecoDeColumna(p.x0, p.id);
      destinoColumnaRef.current = indice;
      setDestinoColumna(indice);
    }

    pedirFotograma();
  }, [pedirFotograma, huecoDeColumna, medirTarjetas]);

  const soltar = useCallback(() => {
    const activo = enCurso.current;

    if (activo) {
      /**
       * ⚠️ **Una última medida antes de soltar, y no es redundante.**
       *
       * El destino se recalcula dentro del bucle de fotogramas, así que un gesto
       * que empieza y termina entre dos fotogramas —un golpe rápido, o un
       * arrastre sintético de una prueba— soltaría con el destino de partida:
       * el sitio donde ya estaba. Se veía como que el arrastre «no hacía nada».
       */
      recalcular();

      /**
       * Dónde quedó el fantasma, para que la pieza de verdad **aterrice** ahí y
       * no aparezca de golpe en su sitio nuevo. Se mide antes de soltar nada:
       * un fotograma después el nodo ya no existe.
       */
      const fantasma = fantasmaRef.current;
      const caja = fantasma ? fantasma.getBoundingClientRect() : null;

      if (activo.tipo === 'tarea' && destinoRef.current) {
        alSoltar.current.tarea(activo.id, destinoRef.current, caja);
      } else if (activo.tipo === 'columna' && destinoColumnaRef.current !== null) {
        alSoltar.current.columna(activo.id, destinoColumnaRef.current, caja);
      }
    }

    limpiar();
  }, [limpiar, recalcular]);

  /* Los oyentes viven en `window` durante todo el gesto: el puntero se sale del
     elemento en el primer centímetro, y con oyentes en la tarjeta el arrastre
     se perdería ahí mismo. */
  useEffect(() => {
    function alMover(evento: PointerEvent) {
      const p = pendiente.current;
      if (!p || evento.pointerId !== p.puntero) return;

      puntero.current = { x: evento.clientX, y: evento.clientY };

      if (!enCurso.current) {
        const recorrido = Math.max(
          Math.abs(evento.clientX - p.x0),
          Math.abs(evento.clientY - p.y0),
        );
        if (recorrido <= UMBRAL_DE_ARRASTRE) return;

        /* Con el dedo, moverse antes de que venza la pulsación larga significa
           «estoy desplazando la pantalla». Se abandona el gesto entero. */
        if (p.esTactil) {
          limpiar();
          return;
        }
        activar();
        return;
      }

      /* Con el gesto ya en marcha hay que impedir el desplazamiento nativo del
         dedo, y `touch-action` no sirve: solo se lee al empezar el gesto, y
         entonces todavía no sabíamos que iba a ser un arrastre. */
      if (evento.cancelable) evento.preventDefault();
      pedirFotograma();
    }

    function alLevantar(evento: PointerEvent) {
      const p = pendiente.current;
      if (!p || evento.pointerId !== p.puntero) return;
      if (enCurso.current) soltar();
      else limpiar();
    }

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape' || !enCurso.current) return;
      /* Escape **cancela**: el hueco desaparece y la tarjeta se queda donde
         estaba. Es la salida que la gente busca cuando se arrepiente a mitad. */
      evento.stopPropagation();
      limpiar();
    }

    window.addEventListener('pointermove', alMover, { passive: false });
    window.addEventListener('pointerup', alLevantar);
    window.addEventListener('pointercancel', alLevantar);
    window.addEventListener('keydown', alTeclear, true);

    return () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alLevantar);
      window.removeEventListener('pointercancel', alLevantar);
      window.removeEventListener('keydown', alTeclear, true);
    };
  }, [activar, limpiar, soltar, pedirFotograma]);

  // Si el componente se va con un arrastre en marcha, la clase del `body` no se queda.
  useEffect(() => () => document.body.classList.remove('arrastrando-en-tablero'), []);

  const empezar = useCallback(
    (
      evento: React.PointerEvent,
      descriptor: { tipo: 'tarea' | 'columna'; id: string; columnaOrigen?: string },
    ) => {
      if (!activo) return;
      if (evento.button !== 0) return;
      if (enCurso.current || pendiente.current) return;

      const elemento = evento.currentTarget as HTMLElement;
      const caja = elemento.getBoundingClientRect();
      const esTactil = evento.pointerType !== 'mouse';

      const nuevo: Pendiente = {
        tipo: descriptor.tipo,
        id: descriptor.id,
        columnaOrigen: descriptor.columnaOrigen ?? '',
        elemento,
        x0: evento.clientX,
        y0: evento.clientY,
        agarreX: evento.clientX - caja.left,
        agarreY: evento.clientY - caja.top,
        ancho: caja.width,
        alto: caja.height,
        puntero: evento.pointerId,
        esTactil,
        temporizador: null,
      };

      puntero.current = { x: evento.clientX, y: evento.clientY };
      pendiente.current = nuevo;

      if (esTactil) nuevo.temporizador = setTimeout(activar, PULSACION_LARGA_MS);
    },
    [activo, activar],
  );

  return {
    arrastre,
    destinoTarea,
    destinoColumna,
    fantasmaRef,
    empezar,
    cancelar: limpiar,
    registrarPista,
    registrarColumna,
    registrarLista,
    registrarTarjeta,
  };
}
