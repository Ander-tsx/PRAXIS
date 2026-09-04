'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createApiClient } from '../../api/client';
import type { DirectConversation, ProjectChatSummary, UserProfile } from '../../api/domain';
import type { Paginated } from '../../api/envelope';
import { useLiveEvent, useReconnection } from '../../realtime';

/**
 * Cuánto se espera antes de volver a pedir las conversaciones.
 *
 * ## 🔴 Sin esto eran seis peticiones por mensaje
 *
 * Pedir está atado a `chat.mensaje` y a `chat.leido`, y el segundo se dispara
 * con **cada** mensaje que llega mientras tienes la conversación abierta: un
 * chat de equipo animado disparaba las tres peticiones dos veces por mensaje.
 *
 * Es el mismo goteo que `useMessageCount` resolvió con la misma ventana y por el
 * mismo motivo.
 */
const ESPERA_MS = 700;

interface DirectorioDeChats {
  directas: DirectConversation[];
  deProyecto: ProjectChatSummary[];
  /** Los perfiles de los interlocutores y de quien escribió lo último. */
  directorio: Map<string, UserProfile>;
  /** Solo la **primera** carga. Ver el aviso del proveedor. */
  cargando: boolean;
}

const VACIO: DirectorioDeChats = {
  directas: [],
  deProyecto: [],
  directorio: new Map(),
  cargando: true,
};

const Contexto = createContext<DirectorioDeChats>(VACIO);

/**
 * Las conversaciones, **pedidas una sola vez para toda la aplicación**.
 *
 * ## 🔴 Por qué es un proveedor y no estado del componente
 *
 * Porque la barra lateral se pinta **dos veces**: el `<aside>` de escritorio y
 * el cajón móvil. Y el `<aside>` es `hidden … md:flex`, que es `display: none` —
 * o sea que en un teléfono **sigue montado**, invisible pero vivo.
 *
 * Con el estado dentro del componente, eso significaba dos instancias:
 *
 * - las dos pidiendo `/me/chats`, `/me/chats/projects` y `/users?ids=…`, o sea
 *   el doble de peticiones en móvil, para siempre;
 * - las dos suscritas al flujo por separado;
 * - y la del cajón **montándose de cero cada vez que se abría**, con su
 *   esqueleto de carga. Que es exactamente el síntoma reportado: en escritorio
 *   se cambiaba de pestaña sin ver un loader, y en móvil salía siempre.
 *
 * Con el proveedor arriba, las dos vistas leen el mismo estado: una sola tanda
 * de peticiones, una sola suscripción, y abrir el cajón es instantáneo porque no
 * hay nada que volver a pedir.
 *
 * ⚠️ **Va dentro de `LiveSource`.** Un componente que *renderiza* un proveedor
 * está por encima de él, así que sus `useContext` devuelven el valor por
 * defecto; y `useLiveEvent` está escrito para no lanzar cuando no encuentra la
 * fuente, de modo que quedarse fuera no daría ningún error — solo un directorio
 * que no se entera de nada. Es la misma trampa que documenta `AppShell`.
 */
export function DirectorioDeChatsProvider({
  gatewayPath,
  children,
}: {
  /** El proxy de la zona, sin barra final: `/projects/api/gateway`. */
  gatewayPath: string;
  children: ReactNode;
}) {
  const [directas, setDirectas] = useState<DirectConversation[]>([]);
  const [deProyecto, setDeProyecto] = useState<ProjectChatSummary[]>([]);
  const [directorio, setDirectorio] = useState<Map<string, UserProfile>>(new Map());
  const [cargando, setCargando] = useState(true);

  const api = useMemo(() => createApiClient({ gatewayPath }), [gatewayPath]);

  const pedir = useCallback(() => {
    /* Las dos en paralelo: no dependen una de la otra, y cada una degrada por su
       cuenta — que falle la de equipo no debe borrar las privadas. */
    Promise.all([
      api.get<DirectConversation[]>('/me/chats').catch(() => null),
      api.get<ProjectChatSummary[]>('/me/chats/projects').catch(() => null),
    ])
      .then(async ([privadas, equipos]) => {
        if (privadas) setDirectas(privadas);
        if (equipos) setDeProyecto(equipos);

        const ids = [
          ...new Set([
            ...(privadas ?? []).map((c) => c.peerId),
            ...(equipos ?? []).map((c) => c.ultimo?.authorId).filter((id): id is string => !!id),
          ]),
        ];
        if (ids.length === 0) return;

        /* Los nombres son decoración: si el directorio falla, las filas salen
           con «Alguien» y la lista se lee igual. */
        const perfiles = await api
          .get<Paginated<UserProfile>>(`/users?ids=${ids.join(',')}`)
          .catch(() => null);
        if (perfiles) {
          setDirectorio(new Map(perfiles.items.map((u: UserProfile) => [u.id, u])));
        }
      })
      /* ⚠️ **Solo apaga el esqueleto, nunca lo vuelve a encender.** Las
         recargas por evento son invisibles a propósito: parpadear a esqueleto
         cada vez que llega un mensaje sería peor que el retraso que evita. */
      .finally(() => setCargando(false));
  }, [api]);

  const temporizador = useRef<number | null>(null);
  const pedirAgrupado = useCallback(() => {
    if (temporizador.current !== null) return;
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      pedir();
    }, ESPERA_MS);
  }, [pedir]);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  useEffect(() => {
    pedir();
  }, [pedir]);

  useLiveEvent('chat.mensaje', pedirAgrupado);
  useLiveEvent('chat.leido', pedirAgrupado);
  /* Tras un corte se pide entero y sin esperar: hay un hueco real que rellenar. */
  useReconnection(pedir);

  const valor = useMemo<DirectorioDeChats>(
    () => ({ directas, deProyecto, directorio, cargando }),
    [directas, deProyecto, directorio, cargando],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Las conversaciones tal y como están ahora.
 *
 * Fuera del proveedor devuelve el vacío en lugar de lanzar, por lo mismo que
 * `useLiveEvent`: hay pantallas que montan trozos de la barra fuera del armazón,
 * y quedarse sin lista es una degradación, no un fallo.
 */
export function useDirectorioDeChats(): DirectorioDeChats {
  return useContext(Contexto);
}
