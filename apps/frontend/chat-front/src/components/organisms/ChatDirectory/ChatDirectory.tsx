'use client';

import {
  Avatar,
  type ChatContact,
  type DirectConversation,
  type Directory,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  personName,
  textoPlano,
  usePresence,
} from '@praxis/commons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useConversacionesEnVivo } from './useConversacionesEnVivo';

/** Un chat de proyecto en la bandeja. */
export interface ChatDeProyecto {
  channelId: string | null;
  project: { id: string; name: string; slug: string };
  /** `deletedAt` para poder decir «Mensaje eliminado» en vez de dejar la fila
      sin resumen: al borrar, `body` se vacía. */
  ultimo: {
    body: string;
    authorId: string;
    createdAt: string;
    deletedAt?: string | null;
  } | null;
  unread: number;
  muted: boolean;
}

export interface ChatDirectoryProps {
  conversaciones: DirectConversation[];
  contactos: ChatContact[];
  proyectos: ChatDeProyecto[];
  /** Quién es quién, y si se pudo preguntar. Ver `commons/api/directory.ts`. */
  directorio: Directory;
}

type Pestana = 'directos' | 'proyectos';

/**
 * Qué conversación está abierta, leída de la ruta.
 *
 * ⚠️ **Esto llegaba por props desde el layout, y llegaba siempre `null`.** Salía
 * de `params.peerId` de `chat/layout.tsx`, y un layout solo recibe los
 * parámetros de los segmentos que tiene **por encima**: `/chat` no tiene ninguno
 * dinámico, así que ese objeto está vacío por construcción. El resultado era que
 * ninguna fila se marcaba nunca como seleccionada —el `aria-current` y el fondo
 * no se ponían jamás— y en móvil la columna no se apartaba al abrir un chat,
 * porque eso también dependía de `activo`.
 *
 * ⚠️ **`usePathname()` devuelve la ruta sin el basePath, y eso cambió al mudar
 * el chat a su propia zona (E3.3).** En dashboard-front —basePath
 * `/dashboard`— una conversación era `/chat/<id>`; aquí el basePath **es**
 * `/chat`, así que Next lo recorta y lo que llega es `/<id>` a secas.
 *
 * Dejar las expresiones de antes no habría dado ningún error: `activo` volvería
 * a ser `null` siempre, que es exactamente el fallo que estas líneas vinieron a
 * arreglar —ninguna fila marcada y, en móvil, la columna sin apartarse al abrir
 * un chat—. La misma rotura, por una causa distinta.
 */
function activoDeLaRuta(pathname: string): { tipo: Pestana; id: string } | null {
  const proyecto = /^\/proyecto\/([^/]+)/.exec(pathname);
  if (proyecto?.[1]) return { tipo: 'proyectos', id: proyecto[1] };

  const persona = /^\/([^/]+)/.exec(pathname);
  if (persona?.[1]) return { tipo: 'directos', id: persona[1] };

  return null;
}

/**
 * La columna del centro de mensajes.
 *
 * ## Los dos tipos de chat conviven aquí, y los dos se abren aquí
 *
 * El de proyecto llevaba fuera —a la pestaña «Chat» de su proyecto—, donde la
 * conversación compartía pantalla con el título, la descripción y las pestañas
 * y le quedaba un tercio del alto. Ahora se abre en esta misma zona, con la
 * pantalla entera, igual que una conversación privada; en el proyecto queda una
 * muestra con su enlace.
 *
 * Se separan en dos pestañas en vez de mezclarse en una lista porque son cosas
 * distintas: una habla con una persona y la otra con un equipo.
 *
 * El número de la pestaña es **lo no leído**, no cuántas hay: cuántos proyectos
 * tienes ya lo sabes.
 */
export function ChatDirectory({
  conversaciones: conversacionesDelServidor,
  contactos,
  proyectos: proyectosDelServidor,
  directorio,
}: ChatDirectoryProps) {
  /**
   * ⚠️ **Las dos listas se mantienen vivas, no se pintan tal cual llegan.**
   *
   * Venían del `layout.tsx` y solo cambiaban al revalidar esa ruta, cosa que no
   * hacía nadie: te llegaba un mensaje privado estando en el chat de un
   * proyecto, salía la tarjeta emergente y **el contador de «Directos» no se
   * movía** hasta cambiar de página. Ahora lo del servidor es el punto de
   * partida y a partir de ahí manda el flujo en vivo. Ver
   * `useConversacionesEnVivo`.
   */
  const { directos: conversaciones, proyectos } = useConversacionesEnVivo(
    conversacionesDelServidor,
    proyectosDelServidor,
  );

  const abierta = activoDeLaRuta(usePathname());
  const activo = abierta?.id ?? null;

  /**
   * La pestaña arranca en la del chat abierto.
   *
   * Sin esto, entrar en el chat de un equipo dejaba la columna en «Directos» y
   * la conversación abierta no se veía por ninguna parte: había que acordarse de
   * cambiar de pestaña para encontrar dónde estabas.
   *
   * Es estado y no un valor derivado a secas porque también se puede cambiar a
   * mano: quien mira los proyectos con una conversación privada abierta sigue
   * mirando los proyectos.
   */
  const [pestana, setPestana] = useState<Pestana>(abierta?.tipo ?? 'directos');
  const [busqueda, setBusqueda] = useState('');

  /**
   * Navegar a una conversación trae su pestaña consigo.
   *
   * Esta columna vive en el layout, así que **no se vuelve a montar** al cambiar
   * de conversación y el valor inicial de arriba solo sirve para la primera
   * carga. Sin esto, llegar a un chat de equipo desde un aviso emergente dejaba
   * la columna en «Directos» y la conversación abierta no aparecía en la lista.
   *
   * No pisa la elección manual: solo depende de la ruta, así que únicamente se
   * dispara cuando alguien navega de verdad.
   */
  const tipoAbierto = abierta?.tipo;
  const idAbierto = abierta?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `idAbierto` es un disparador, no un valor que se lea. Sin él, ir de una conversación a otra **del mismo tipo** —desde una tarjeta de aviso, con la pestaña cambiada a mano— no reajustaría la pestaña, y la conversación recién abierta no saldría en la lista.
  useEffect(() => {
    if (tipoAbierto) setPestana(tipoAbierto);
  }, [tipoAbierto, idAbierto]);

  /* Delega en `personName`: es quien distingue «esta cuenta ya no existe»
     de «no se pudo consultar el directorio», que antes se leían igual. */
  const nombreDe = (userId: string) => personName(directorio, userId);

  const conHilo = new Set(conversaciones.map((conversacion) => conversacion.peerId));
  const filtro = busqueda.trim().toLowerCase();
  const coincide = (texto: string) => !filtro || texto.toLowerCase().includes(filtro);

  /* Filtros directos y sin `useMemo`: son listas de decenas de elementos, no de
     miles, y memorizarlas obligaría a declarar como dependencias unas funciones
     que se recrean en cada render — más ceremonia que ahorro. */
  const directosVisibles = conversaciones.filter(
    (conversacion) => conversacion.ultimo && coincide(nombreDe(conversacion.peerId)),
  );

  const proyectosVisibles = proyectos.filter((chat) => coincide(chat.project.name));

  const sinLeerDirectos = conversaciones.reduce((total, c) => total + c.unread, 0);
  const sinLeerProyectos = proyectos.reduce((total, c) => total + c.unread, 0);

  return (
    <nav
      aria-label="Conversaciones"
      /* Con una conversación abierta, en móvil la lista **no está**: la
         conversación se lleva la pantalla y volver es el botón de arriba. En
         escritorio conviven, que es donde hay sitio para las dos. */
      className={`w-full shrink-0 flex-col gap-3 sm:flex sm:w-80 sm:border-r sm:border-border sm:pr-5 ${
        activo ? 'hidden' : 'flex'
      }`}
    >
      {/* El conmutador. Las dos pestañas llevan su contador de no leídos, que es
          lo que hace que se vea desde la otra que hay algo esperando. */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: alpha(colors.overlay, 18) }}
        role="tablist"
      >
        <Solapa
          activa={pestana === 'directos'}
          onClick={() => setPestana('directos')}
          etiqueta="Directos"
          sinLeer={sinLeerDirectos}
        />
        <Solapa
          activa={pestana === 'proyectos'}
          onClick={() => setPestana('proyectos')}
          etiqueta="Proyectos"
          sinLeer={sinLeerProyectos}
        />
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        placeholder={pestana === 'directos' ? 'Buscar persona…' : 'Buscar proyecto…'}
        aria-label="Buscar"
        className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 font-sans text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none"
      />

      {pestana === 'directos' ? (
        <div className="flex flex-col gap-4">
          {directosVisibles.length > 0 && (
            <Grupo titulo="Conversaciones">
              {directosVisibles.map((conversacion) => (
                <FilaPersona
                  key={conversacion.channelId}
                  peerId={conversacion.peerId}
                  nombre={nombreDe(conversacion.peerId)}
                  perfil={directorio.perfiles.get(conversacion.peerId)}
                  activo={activo === conversacion.peerId}
                  unread={conversacion.unread}
                  muted={conversacion.muted}
                  detalle={
                    conversacion.ultimo
                      ? `${conversacion.ultimo.authorId === conversacion.peerId ? '' : 'Tú: '}${resumenDe(conversacion.ultimo)}`
                      : null
                  }
                  cuando={conversacion.ultimo?.createdAt ?? null}
                />
              ))}
            </Grupo>
          )}

          {directosVisibles.length === 0 && (
            <Vacio
              texto={
                filtro
                  ? 'Nadie coincide con esa búsqueda.'
                  : 'Aquí aparecerá quien comparta algún proyecto contigo y con quien hayas iniciado una conversación.'
              }
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {proyectosVisibles.length === 0 ? (
            <Vacio
              texto={filtro ? 'Ningún proyecto coincide.' : 'Todavía no estás en ningún proyecto.'}
            />
          ) : (
            proyectosVisibles.map((chat) => (
              <FilaProyecto
                key={chat.project.id}
                chat={chat}
                autor={chat.ultimo ? nombreDe(chat.ultimo.authorId) : null}
                activo={activo === chat.project.id}
              />
            ))
          )}
        </div>
      )}
    </nav>
  );
}

function Solapa({
  activa,
  onClick,
  etiqueta,
  sinLeer,
}: {
  activa: boolean;
  onClick: () => void;
  etiqueta: string;
  sinLeer: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-sm transition-colors"
      style={{
        background: activa ? colors.surfaceElevated : 'transparent',
        color: activa ? colors.textPrimary : colors.textSecondary,
      }}
    >
      {etiqueta}
      {/* Una insignia que enseña un cero es una insignia que enseña nada. */}
      {sinLeer > 0 && (
        <span
          className="rounded-full px-1.5 font-sans text-[11px] tabular-nums"
          style={{ background: alpha(colors.primary, 25), color: colors.primary }}
        >
          {sinLeer}
        </span>
      )}
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-text-disabled">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="px-1 py-4 font-sans text-xs text-text-secondary">{texto}</p>;
}

/**
 * Cómo se ve la fila que está abierta.
 *
 * ## Fondo y peso de letra, sin barra lateral
 *
 * Estaba en un `background` teñido al 12 % en las personas y —peor— en
 * `surfaceElevated` en los proyectos, que es **exactamente el color del
 * `hover`**: la fila activa era indistinguible de la que tenías bajo el ratón.
 * Y como `activo` llegaba siempre `null` (ver `activoDeLaRuta`), ni siquiera se
 * llegaba a pintar.
 *
 * Ahora el fondo va teñido lo bastante para separarse del `hover` y el nombre en
 * negrita. Dos señales y no una porque el color por sí solo no llega a quien no
 * lo distingue, y el grosor de la letra se lee sin color ninguno.
 *
 * El `aria-current="page"` lo pone cada fila aparte — es lo que lo anuncia a un
 * lector de pantalla, y ninguna de estas dos señales le dice nada.
 */
const FILA_ACTIVA = 'font-semibold';

function estiloDeFila(activo: boolean): React.CSSProperties | undefined {
  if (!activo) return undefined;
  return { background: alpha(colors.primary, 16) };
}

function FilaPersona({
  peerId,
  nombre,
  perfil,
  activo,
  unread,
  muted,
  detalle,
  cuando,
}: {
  peerId: string;
  nombre: string;
  /** Para la foto y el punto de estado. Puede faltar: la fila sale igual. */
  perfil: UserProfile | undefined;
  activo: boolean;
  unread: number;
  muted: boolean;
  detalle: string | null;
  cuando: string | null;
}) {
  const presencia = usePresence(peerId, perfil?.presence);

  return (
    <li>
      <Link
        /* Ruta **interna** de la zona: Next le antepone el basePath (`/chat`).
           Con el `/chat/` de cuando esto vivía en dashboard-front saldría
           `/chat/chat/<id>`, que es un 404. */
        href={`/${peerId}`}
        aria-current={activo ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated ${
          activo ? FILA_ACTIVA : ''
        }`}
        style={estiloDeFila(activo)}
      >
        <Avatar
          label={nombre}
          size="sm"
          src={avatarHref(perfil?.avatarUrl, '/chat/api/gateway')}
          /* La del perfil es la del último render; `usePresence` la pisa si ha
             cambiado desde entonces. Ver `commons/realtime/presencia.tsx`. */
          presence={presencia}
        />

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-sans text-sm text-text-primary">{nombre}</span>
            {cuando && (
              <span className="ml-auto shrink-0 font-sans text-[10px] text-text-disabled">
                {cuandoCorto(cuando)}
              </span>
            )}
          </span>
          {detalle && (
            <span className="truncate font-sans text-xs text-text-secondary">{detalle}</span>
          )}
        </span>

        <Marcas unread={unread} muted={muted} />
      </Link>
    </li>
  );
}

/**
 * Un chat de proyecto.
 *
 * ⚠️ **Lleva fuera de esta zona**, a la pantalla del proyecto, así que es un
 * `<a>` duro y no `next/link`: `dashboard` y `projects` son apps distintas
 * (ESTADO-ACTUAL §16). La flecha de la derecha lo anuncia — quien pulsa debe
 * saber que se va a mover de sitio antes de hacerlo.
 *
 * El enlace usa el **slug**, que es lo que va en la URL. El id y el slug son los
 * dos `string` y confundirlos no da error de compilación (CLAUDE.md, trampa 10).
 */
function FilaProyecto({
  chat,
  autor,
  activo,
}: { chat: ChatDeProyecto; autor: string | null; activo: boolean }) {
  const inicial = chat.project.name.trim()[0]?.toUpperCase() ?? '·';

  return (
    /* Enlace de la propia zona: el chat de equipo ya vive aquí, al lado de los
       privados, así que pulsarlo ya no saca de la pantalla.

       ⚠️ La ruta lleva el **UUID** y no el slug: todo lo anidado bajo
       `/projects/:id` en el gateway espera el UUID (CLAUDE.md). */
    <Link
      href={`/proyecto/${chat.project.id}`}
      aria-current={activo ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated ${
        activo ? FILA_ACTIVA : ''
      }`}
      style={estiloDeFila(activo)}
    >
      {/* Cuadrado y no círculo: distingue de un vistazo un equipo de una
          persona sin tener que leer nada. */}
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-sans text-sm font-semibold"
        style={{ background: alpha(colors.accent, 18), color: colors.accent }}
      >
        {inicial}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-sans text-sm text-text-primary">{chat.project.name}</span>
          {chat.ultimo && (
            <span className="ml-auto shrink-0 font-sans text-[10px] text-text-disabled">
              {cuandoCorto(chat.ultimo.createdAt)}
            </span>
          )}
        </span>
        <span className="truncate font-sans text-xs text-text-secondary">
          {chat.ultimo
            ? `${autor ?? 'Alguien'}: ${resumenDe(chat.ultimo)}`
            : 'Sin mensajes todavía'}
        </span>
      </span>

      <Marcas unread={chat.unread} muted={chat.muted} />

      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-disabled opacity-0 transition-opacity group-hover:opacity-100"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M21 12H4" />
      </svg>
    </Link>
  );
}

function Marcas({ unread, muted }: { unread: number; muted: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {muted && (
        <svg
          className="h-3.5 w-3.5 text-text-disabled"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-label="Avisos apagados"
        >
          <title>Avisos apagados</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
          />
          <path strokeLinecap="round" d="M4 4l16 16" />
        </svg>
      )}
      {unread > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 font-sans text-[11px] tabular-nums"
          style={{ background: alpha(colors.primary, 25), color: colors.primary }}
        >
          {unread}
        </span>
      )}
    </span>
  );
}

/**
 * El resumen de un mensaje para la fila de la lista.
 *
 * Un mensaje borrado llega con el `body` vacío —el borrado es suave y vacía el
 * texto—, así que `textoPlano` daba una cadena vacía y la fila se quedaba sin
 * resumen: se leía como una conversación sin mensajes cuando en realidad el
 * último se había borrado.
 */
function resumenDe(mensaje: { body: string; deletedAt?: string | null }): string {
  return mensaje.deletedAt ? 'Mensaje eliminado' : textoPlano(mensaje.body);
}

/** «14:32» si es de hoy, «mar» esta semana, «12 ago» más atrás. */
function cuandoCorto(iso: string): string {
  const fecha = new Date(iso);
  const ahora = new Date();
  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);

  if (dias === 0) return fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (dias < 7) return fecha.toLocaleDateString('es', { weekday: 'short' });
  return fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
