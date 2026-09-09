'use client';

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Techo de la espera visible de un botón.
 *
 * No es un plazo de red: la petición sigue su curso y su plazo lo pone
 * `REQUEST_TIMEOUT_MS` (`commons/api/timeout.ts`), 15 s para el gateway. Esto es
 * el tope de lo que un botón puede quedarse girando **sin que nadie le haya
 * dicho que terminó**, y por eso va por encima de aquel: si la petición fuera a
 * fallar por tiempo, ya habría fallado con su mensaje.
 */
export const TECHO_DE_ESPERA_MS = 25_000;

/**
 * `useActionState`, pero con la espera medida por nosotros.
 *
 * ## El problema que resuelve
 *
 * El `isPending` que devuelve `useActionState` **no mide tu petición**. Mide una
 * transición de React que gestiona el router de Next, y que es una sola para
 * toda la aplicación. En `next/dist/esm/client/components/use-action-queue.js`
 * el estado del App Router *es una promesa* y se lee con `use()` en la raíz del
 * árbol; en `app-router-instance.js`, cada acción del router —tu Server Action,
 * un `router.refresh()`, una navegación— hace esto al despacharse:
 *
 * ```js
 * const deferredPromise = new Promise((resolve, reject) => { resolvers = { resolve, reject } });
 * startTransition(() => { setState(deferredPromise); });
 * ```
 *
 * Si esa promesa no se resuelve, la transición no termina, y todo lo que
 * dependa de ella se queda `pending`. Y hay un camino en el que **no se resuelve
 * nunca**: cuando llega un `ACTION_NAVIGATE` o un `ACTION_RESTORE` con otra
 * acción en vuelo, la de antes se marca `discarded`, y el manejador sale por un
 * `return` que se salta el `action.resolve(nextState)`.
 *
 * El `resolve` del *payload* —el que le devuelve el resultado a este hook— sí se
 * llama, así que **la escritura llegó al backend y se guardó**; el que no se
 * llama es el de la cola. De ahí el síntoma exacto: el cambio está hecho, no hay
 * ningún error en ninguna consola, y el botón gira para siempre. Y como la
 * transición es global, gira **en todos los botones a la vez**.
 *
 * Basta con hacer clic en un enlace, o con el botón atrás del navegador,
 * mientras una acción está en vuelo. Con los avisos en vivo refrescando la ruta
 * por cada evento del flujo, la cola del router está ocupada mucho más rato del
 * que parece, y la carrera deja de ser rara.
 *
 * ## Cómo lo mide este hook
 *
 * Con dos contadores en vez de un booleano:
 *
 * | Contador | Cuándo sube | Prioridad de React |
 * |---|---|---|
 * | `lanzadas` | Al empezar la acción | La de la transición — igual que hoy |
 * | `terminadas` | En el `finally`, dentro de un `setTimeout(…, 0)` | **Normal** |
 *
 * El `setTimeout` es la pieza: React propaga el contexto de la transición a
 * través de los `await` de una acción, pero **no** al callback de un macrotask.
 * Lo que se programa ahí se actualiza por la vía normal, que la transición
 * atascada no bloquea. Apagar el aviso deja de depender de aquello que se cuelga.
 *
 * Y son contadores y no un booleano para que el orden no importe: los dos son
 * monótonos, así que si el «terminó» llegara a pintarse antes que el «empezó»
 * —prioridades distintas—, `lanzadas > terminadas` sigue dando el resultado
 * correcto en cuanto los dos han llegado. Con un booleano, ese cruce deja el
 * botón encendido para siempre, que es justo lo que veníamos a arreglar.
 *
 * `TECHO_DE_ESPERA_MS` cierra el último caso: que la propia acción no vuelva
 * nunca —se cortó la conexión a mitad de respuesta— y el `finally` no llegue a
 * ejecutarse.
 *
 * ## Cómo se usa
 *
 * Igual que `useActionState`, misma tupla y mismo orden. Es un reemplazo directo:
 *
 * ```tsx
 * const [estado, enviar, enMarcha] = useAccion(inviteMemberAction, MEMBER_INITIAL_STATE);
 * ```
 *
 * Y sirve igual **fuera de un formulario**: el despachador acepta un `FormData`
 * construido a mano, que es lo que permite gestionar las etiquetas dentro del
 * diálogo de una tarea sin anidar un `<form>` dentro de otro.
 *
 * ⚠️ **No uses `useActionState` directamente en un formulario nuevo.** Funciona
 * el 95 % de las veces, y el 5 % restante es un botón que no para de girar sobre
 * un cambio que sí se guardó. Y a mano avisa por consola, porque su despachador
 * exige transición: ver el comentario de `enviar`.
 */
export function useAccion<Estado, Carga = FormData>(
  accion: (estado: Awaited<Estado>, carga: Carga) => Estado | Promise<Estado>,
  inicial: Awaited<Estado>,
  permalink?: string,
): [estado: Awaited<Estado>, enviar: (carga: Carga) => void, enMarcha: boolean] {
  const [lanzadas, setLanzadas] = useState(0);
  const [terminadas, setTerminadas] = useState(0);

  /**
   * Si la acción redirige o cierra el diálogo, el componente se desmonta antes
   * de que corra el `setTimeout`. Actualizar entonces no rompe nada en React 19,
   * pero tampoco sirve de nada: se comprueba y se sale.
   *
   * Se reasigna a `true` en el efecto, y no solo al crear el ref, porque en modo
   * estricto React monta, desmonta y vuelve a montar: sin esto, el segundo
   * montaje empezaría dado por muerto.
   */
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const envuelta = useCallback(
    async (estado: Awaited<Estado>, carga: Carga): Promise<Awaited<Estado>> => {
      setLanzadas((cuantas) => cuantas + 1);
      try {
        return await accion(estado, carga);
      } catch (fallo) {
        /**
         * 🔴 **Una Server Action que se rompe por el camino tumbaba la pantalla
         * entera.**
         *
         * Las acciones de este repositorio ya devuelven `{ error }` en vez de
         * lanzar — están escritas así a propósito—. Pero hay fallos que ocurren
         * **antes de que su cuerpo llegue a ejecutarse**: el cuerpo de la
         * petición pasa del tope de Next (`413 Body exceeded …`), la red se
         * corta a mitad del envío, el servidor devuelve un 500 al deserializar.
         * Ahí no hay ningún `try` de la acción que pueda atrapar nada, porque la
         * acción no ha empezado.
         *
         * Sin este `catch`, esa promesa rechazada sube por `useActionState`
         * hasta el `error.tsx` más cercano, y lo que ve la persona es la página
         * de error del segmento —«No pudimos cargar esta página»— sobre un
         * formulario que estaba perfectamente vivo. Peor: el mensaje sugiere
         * cerrar sesión, que no arregla nada, y «Reintentar» «funciona» porque
         * lo único roto era el envío.
         *
         * Pasó de verdad al adjuntar un PDF de más de 1 MB — ver
         * `bodySizeLimit` en el `next.config.ts` de `web`, que era la causa—.
         *
         * ## Por qué se parte de `inicial` y no del estado que había
         *
         * Porque la acción **no llegó a hacer nada**, así que todo lo que un
         * estado usa para decir «esto salió bien» —`done`, `savedName`,
         * `createdId`— tiene que volver a su valor de partida. Con
         * `{ ...estado, error }` un envío fallido detrás de uno bueno seguiría
         * enseñando el «Guardado» del anterior junto al error del nuevo.
         *
         * ⚠️ **Y si el estado no tiene `error`, se relanza.** Este hook es
         * genérico: inventarle un campo a una forma que no lo declara sería
         * mentirle al tipo y, sobre todo, tragarse un fallo que nadie va a
         * pintar. Los 45 puntos del repositorio lo tienen; el día que alguien
         * escriba uno sin él, prefiere verlo.
         */
        if (!tieneCampoError(inicial)) throw fallo;
        return { ...inicial, error: mensajeDeFallo(fallo) } as Awaited<Estado>;
      } finally {
        /* El macrotask es lo que deja fuera de la transición este apagado. Ver
           la explicación de arriba: sin él, esta línea se cuelga con ella. */
        window.setTimeout(() => {
          if (montado.current) setTerminadas((cuantas) => cuantas + 1);
        }, 0);
      }
    },
    [accion, inicial],
  );

  const [estado, despachar] = useActionState<Awaited<Estado>, Carga>(
    envuelta,
    /* `Awaited<Awaited<T>>` y `Awaited<T>` son el mismo tipo, pero TypeScript no
       lo simplifica mientras el genérico está sin resolver: `Awaited` es
       recursivo condicional y se queda diferido. La conversión no cambia nada en
       ejecución y es la única de todo el archivo. */
    inicial as Awaited<Awaited<Estado>>,
    permalink,
  );

  const enMarcha = lanzadas > terminadas;

  /**
   * El despachador, **siempre dentro de una transición**.
   *
   * Cuando esto se pasa a `<form action={…}>` lo llama React, que ya abre la
   * transición; pero llamarlo a mano desde un `onClick` —lo que permite mandar
   * un `FormData` construido a pelo, sin `<form>`— no la abre, y React avisa por
   * consola: *«An async function with useActionState was called outside of a
   * transition»*. No es cosmético: sin transición el `isPending` interno de
   * `useActionState` no se actualiza.
   *
   * Se envuelve **aquí y no en cada punto de uso** porque son 45 y basta con
   * que a uno se le olvide. Anidar `startTransition` dentro de la que React ya
   * abrió para un formulario no tiene efecto, así que el caso normal no cambia.
   */
  const enviar = useCallback(
    (carga: Carga) => {
      startTransition(() => despachar(carga));
    },
    [despachar],
  );

  /**
   * El techo. Solo entra cuando la acción no ha vuelto **de ninguna manera**:
   * ni resuelta ni rechazada, así que el `finally` no ha corrido.
   *
   * Se igualan los contadores en vez de restar: cualquier acción anterior que se
   * hubiera quedado por el camino se da por cerrada aquí también.
   */
  useEffect(() => {
    if (!enMarcha) return;

    const temporizador = window.setTimeout(() => setTerminadas(lanzadas), TECHO_DE_ESPERA_MS);
    return () => window.clearTimeout(temporizador);
  }, [enMarcha, lanzadas]);

  return [estado, enviar, enMarcha];
}

/**
 * ¿Este estado sabe enseñar un error?
 *
 * Se mira la forma en ejecución y no el tipo: `Estado` es genérico y aquí no hay
 * nada que TypeScript pueda comprobar por nosotros.
 */
function tieneCampoError(estado: unknown): estado is { error: string | null } {
  return typeof estado === 'object' && estado !== null && 'error' in estado;
}

/**
 * Qué se le enseña a la persona cuando el envío se rompe antes de llegar.
 *
 * ⚠️ **El texto de Next no vale tal cual.** Dice «Body exceeded 1 MB limit» con
 * un enlace a su documentación de configuración: describe el problema de quien
 * escribió la aplicación, no el de quien está adjuntando un archivo. Se traduce
 * a la única frase que sirve ahí —el archivo pesa demasiado— y el resto cae en
 * un mensaje genérico que al menos dice qué hacer.
 */
function mensajeDeFallo(fallo: unknown): string {
  const texto = fallo instanceof Error ? fallo.message : String(fallo);

  if (/body exceeded/i.test(texto)) {
    return 'El archivo es demasiado grande para enviarlo. Prueba con uno más ligero.';
  }

  return 'No se pudo enviar. Puede haber sido un corte de red: vuelve a intentarlo.';
}
