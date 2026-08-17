'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { type EventoDe, type EventoEnVivo, type TipoDeEvento, esEventoConocido } from './tipos';

/**
 * Cada cuánto manda el servidor un latido. Espejo de `LATIDO_MS` en
 * `my-notifications.controller.ts`: si allí sube, el vigilante de aquí tiene que
 * subir con él o empezará a reconectar sin motivo.
 */
const LATIDO_MS = 25_000;

/**
 * Cuánto silencio se tolera antes de dar la conexión por muerta.
 *
 * Dos latidos y un margen. Con uno solo, un latido que se retrase por congestión
 * de red provocaría una reconexión innecesaria —y con ella una resincronización
 * y su petición— cada vez que la red hipara.
 */
const SIN_SENAL_MS = 2 * LATIDO_MS + 10_000;

type Manejador<T extends TipoDeEvento> = (evento: EventoDe<T>) => void;

interface Fuente {
  /**
   * Escucha un tipo de evento. Devuelve la función para dejar de escuchar.
   *
   * ⚠️ El manejador se guarda en un `Set` **fuera del estado de React**, así que
   * suscribirse no vuelve a renderizar a nadie y un evento que llega no repinta
   * más que lo que su manejador decida cambiar.
   */
  suscribir<T extends TipoDeEvento>(tipo: T, manejador: Manejador<T>): () => void;
  /**
   * Escucha las **reconexiones**, para volver a sincronizar.
   *
   * Es un canal aparte porque no es un evento del servidor sino un hecho del
   * transporte: «el flujo estuvo caído y ha vuelto». Quien lo escucha sabe qué
   * tiene que volver a pedir —la conversación abierta pide lo posterior a su
   * último mensaje, la lista de chats se vuelve a pedir entera— y eso no se
   * puede resolver aquí, que no sabe qué hay en pantalla.
   */
  alReconectar(manejador: () => void): () => void;
}

const Contexto = createContext<Fuente | null>(null);

export interface FuenteEnVivoProps {
  /**
   * Proxy de la zona, sin barra final: `/dashboard/api/gateway`.
   *
   * Tiene que ser el de la zona actual. El token vive en una cookie httpOnly y
   * `EventSource` no puede mandar cabeceras, así que la petición **debe** cruzar
   * el proxy para que le añada el `Authorization`.
   */
  gatewayPath: string;
  children: ReactNode;
}

/**
 * La conexión en vivo de la pestaña: **una sola**, para toda la aplicación.
 *
 * ## Por qué un proveedor y no una conexión por componente
 *
 * El chat, la lista de conversaciones, los hilos y las tarjetas emergentes
 * quieren enterarse de lo mismo. Con un `EventSource` por componente serían
 * cuatro conexiones abiertas por pestaña, cuatro suscripciones en el gateway y
 * cuatro reconexiones cada vez que la red hipara — para repartir exactamente los
 * mismos bytes. Aquí se abre una y se reparte en memoria, que es la misma
 * decisión que ya toma el gateway con `psubscribe`.
 *
 * ## El reparto no pasa por el estado de React
 *
 * Los manejadores viven en un `Map` de `Set`s dentro de un `ref`. Un evento
 * entra, se busca su tipo y se llama a quien lo escuche: **cero renders** por el
 * hecho de recibirlo. Lo que se repinta es lo que cada manejador cambie, y nada
 * más. Guardarlos en estado haría que suscribirse o desuscribirse volviera a
 * renderizar el árbol entero, que es justo lo que este módulo viene a quitar.
 *
 * ## Reconectar no es recuperar
 *
 * `EventSource` reconecta solo, pero **lo publicado mientras estuvo caído se
 * pierde**: no hay reenvío. Por eso hay un canal `alReconectar` separado, para
 * que cada superficie pida lo suyo. La conversación abierta pide lo posterior a
 * su último mensaje (`?after=`), que es una petición pequeña y exacta; antes
 * esto era un `router.refresh()`, es decir, volver a renderizar la página
 * completa en el servidor por un hipo de red.
 *
 * ⚠️ **Y hay un vigilante de latidos.** `EventSource` no detecta un flujo que se
 * queda mudo: si el gateway muere sin cerrar el socket —o un intermediario lo
 * congela— la conexión sigue «abierta» para el navegador y no llega nada. Sin
 * esto, un chat podía quedarse callado indefinidamente sin un solo error.
 */
export function FuenteEnVivo({ gatewayPath, children }: FuenteEnVivoProps) {
  const manejadores = useRef(new Map<TipoDeEvento, Set<(evento: EventoEnVivo) => void>>());
  const reconexiones = useRef(new Set<() => void>());

  const suscribir = useCallback(<T extends TipoDeEvento>(tipo: T, manejador: Manejador<T>) => {
    const oyentes = manejadores.current.get(tipo) ?? new Set();
    const envoltorio = manejador as (evento: EventoEnVivo) => void;
    oyentes.add(envoltorio);
    manejadores.current.set(tipo, oyentes);

    return () => {
      oyentes.delete(envoltorio);
      /* Sin oyentes no se deja la entrada vacía: sería una fuga lenta, una
         clave por cada tipo que alguien haya escuchado alguna vez. */
      if (oyentes.size === 0) manejadores.current.delete(tipo);
    };
  }, []);

  const alReconectar = useCallback((manejador: () => void) => {
    reconexiones.current.add(manejador);
    return () => {
      reconexiones.current.delete(manejador);
    };
  }, []);

  useEffect(() => {
    let fuente: EventSource | null = null;
    /* La primera apertura no es una reconexión: no hay hueco que rellenar
       porque la página acaba de pedir sus datos al servidor. */
    let primeraConexion = true;
    let ultimaSenal = Date.now();
    let cerrado = false;

    function marcarVivo() {
      ultimaSenal = Date.now();
    }

    function alLlegar(evento: MessageEvent<string>) {
      marcarVivo();

      let datos: unknown;
      try {
        datos = JSON.parse(evento.data);
      } catch {
        return;
      }

      /* Se valida en el borde. Lo que entra es JSON de la red, y un evento de un
         servidor más nuevo que este navegador —un despliegue a medias— se
         descarta aquí en vez de llegar a un manejador que no lo espera. */
      if (!esEventoConocido(datos)) return;

      const oyentes = manejadores.current.get(datos.tipo);
      if (!oyentes) return;

      /* Se itera sobre una copia: un manejador puede darse de baja a sí mismo
         al recibir —el panel de un hilo que se cierra, por ejemplo— y mutar el
         `Set` mientras se recorre se salta al siguiente. */
      for (const oyente of [...oyentes]) {
        try {
          oyente(datos);
        } catch {
          /* Un manejador que falla no puede llevarse por delante a los demás:
             son superficies independientes de la pantalla. */
        }
      }
    }

    function abrir() {
      if (cerrado) return;

      const nueva = new EventSource(`${gatewayPath}/me/notifications/stream`);
      fuente = nueva;

      nueva.addEventListener('evento', alLlegar as EventListener);
      nueva.addEventListener('latido', marcarVivo as EventListener);

      /* El `onerror` no cierra nada: `EventSource` reconecta por su cuenta y
         cerrarlo aquí desactivaría esa reconexión. */
      nueva.onopen = () => {
        marcarVivo();
        if (!primeraConexion) {
          for (const manejador of [...reconexiones.current]) {
            try {
              manejador();
            } catch {
              /* Ídem: una resincronización que falla no impide las demás. */
            }
          }
        }
        primeraConexion = false;
      };
    }

    abrir();

    const vigilante = window.setInterval(() => {
      if (Date.now() - ultimaSenal > SIN_SENAL_MS) {
        fuente?.close();
        /* Se marca como caída para que la próxima apertura cuente como
           reconexión y dispare la resincronización. */
        primeraConexion = false;
        marcarVivo();
        abrir();
      }
    }, LATIDO_MS / 2);

    return () => {
      cerrado = true;
      window.clearInterval(vigilante);
      fuente?.removeEventListener('evento', alLlegar as EventListener);
      fuente?.removeEventListener('latido', marcarVivo as EventListener);
      fuente?.close();
    };
  }, [gatewayPath]);

  const valor = useMemo<Fuente>(() => ({ suscribir, alReconectar }), [suscribir, alReconectar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Escucha un tipo de evento mientras el componente esté montado.
 *
 * ⚠️ **El manejador se guarda en un `ref` y no se vuelve a suscribir cuando
 * cambia.** Es lo que permite escribirlo en línea —con las variables del render
 * dentro— sin dar de baja y de alta la suscripción en cada render, que es el
 * error clásico de este patrón y el que deja huecos por los que se pierden
 * eventos.
 *
 * Fuera de un `FuenteEnVivo` no hace nada, en vez de lanzar: hay pantallas que
 * montan componentes de chat fuera del armazón privado, y quedarse sin tiempo
 * real es una degradación, no un fallo.
 */
export function useEventoEnVivo<T extends TipoDeEvento>(tipo: T, manejador: Manejador<T>): void {
  const fuente = useContext(Contexto);
  const ultimo = useRef(manejador);
  ultimo.current = manejador;

  useEffect(() => {
    if (!fuente) return;
    return fuente.suscribir(tipo, ((evento: EventoDe<T>) =>
      ultimo.current(evento)) as Manejador<T>);
  }, [fuente, tipo]);
}

/**
 * Ejecuta algo cuando el flujo se recupera de un corte.
 *
 * Es donde va la resincronización: pedir lo que se perdió mientras no había
 * conexión. Mismo trato del `ref` que `useEventoEnVivo`, y por lo mismo.
 */
export function useReconexion(manejador: () => void): void {
  const fuente = useContext(Contexto);
  const ultimo = useRef(manejador);
  ultimo.current = manejador;

  useEffect(() => {
    if (!fuente) return;
    return fuente.alReconectar(() => ultimo.current());
  }, [fuente]);
}
