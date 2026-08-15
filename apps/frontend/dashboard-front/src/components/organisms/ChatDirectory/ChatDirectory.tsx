'use client';

import {
  Avatar,
  type ChatContact,
  type DirectConversation,
  type UserProfile,
  alpha,
  colors,
  personLabel,
  textoPlano,
} from '@praxis/commons';
import Link from 'next/link';
import { useState } from 'react';

/** Un chat de proyecto en la bandeja. */
export interface ChatDeProyecto {
  channelId: string | null;
  project: { id: string; name: string; slug: string };
  ultimo: { body: string; authorId: string; createdAt: string } | null;
  unread: number;
  muted: boolean;
}

export interface ChatDirectoryProps {
  conversaciones: DirectConversation[];
  contactos: ChatContact[];
  proyectos: ChatDeProyecto[];
  usersById: Map<string, UserProfile>;
  /** Con quién se está hablando ahora, si es que hay alguien. */
  activo: string | null;
}

type Pestana = 'directos' | 'proyectos';

/**
 * La columna del centro de mensajes.
 *
 * ## Los dos tipos de chat conviven aquí, y el de proyecto **sale de la zona**
 *
 * Un chat de proyecto vive en la pantalla de su proyecto, con el tablero al
 * lado, que es donde tiene sentido leerlo. Pero **enterarte** de que hay algo
 * nuevo no debería obligarte a recorrer proyecto por proyecto: por eso aparecen
 * aquí, con su contador, y al pulsarlos te llevan a su sitio.
 *
 * Se separan en dos pestañas en vez de mezclarse en una lista: son cosas
 * distintas —una habla con una persona, la otra con un equipo— y **una lleva
 * fuera de esta pantalla y la otra no**. Mezclarlas haría que pulsar dos filas
 * seguidas diera resultados que se sienten inconsistentes.
 *
 * El número de la pestaña es **lo no leído**, no cuántas hay: cuántos proyectos
 * tienes ya lo sabes.
 */
export function ChatDirectory({
  conversaciones,
  contactos,
  proyectos,
  usersById,
  activo,
}: ChatDirectoryProps) {
  const [pestana, setPestana] = useState<Pestana>('directos');
  const [busqueda, setBusqueda] = useState('');

  const nombreDe = (userId: string) => {
    const perfil = usersById.get(userId);
    return perfil ? personLabel(perfil) : 'Alguien que ya no está';
  };

  const conHilo = new Set(conversaciones.map((conversacion) => conversacion.peerId));
  const filtro = busqueda.trim().toLowerCase();
  const coincide = (texto: string) => !filtro || texto.toLowerCase().includes(filtro);

  /* Filtros directos y sin `useMemo`: son listas de decenas de elementos, no de
     miles, y memorizarlas obligaría a declarar como dependencias unas funciones
     que se recrean en cada render — más ceremonia que ahorro. */
  const directosVisibles = conversaciones.filter((conversacion) =>
    coincide(nombreDe(conversacion.peerId)),
  );

  const nuevosVisibles = contactos
    .filter((contacto) => !conHilo.has(contacto.userId))
    .filter((contacto) => coincide(nombreDe(contacto.userId)));

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
                  activo={activo === conversacion.peerId}
                  unread={conversacion.unread}
                  muted={conversacion.muted}
                  detalle={
                    conversacion.ultimo
                      ? `${conversacion.ultimo.authorId === conversacion.peerId ? '' : 'Tú: '}${textoPlano(conversacion.ultimo.body)}`
                      : null
                  }
                  cuando={conversacion.ultimo?.createdAt ?? null}
                />
              ))}
            </Grupo>
          )}

          {nuevosVisibles.length > 0 && (
            <Grupo titulo="De tus proyectos">
              {nuevosVisibles.map((contacto) => (
                <FilaPersona
                  key={contacto.userId}
                  peerId={contacto.userId}
                  nombre={nombreDe(contacto.userId)}
                  activo={activo === contacto.userId}
                  unread={0}
                  muted={false}
                  detalle={describirProyectos(contacto)}
                  cuando={null}
                />
              ))}
            </Grupo>
          )}

          {directosVisibles.length === 0 && nuevosVisibles.length === 0 && (
            <Vacio
              texto={
                filtro
                  ? 'Nadie coincide con esa búsqueda.'
                  : 'Aquí aparecerá quien comparta algún proyecto contigo.'
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
 * Dónde coincidís y qué es esa persona allí.
 *
 * ⚠️ El rol es **por proyecto**, no global: la misma persona puede administrar
 * uno y solo mirar en otro. Enseñar un rol suelto sería inventarse una jerarquía
 * que no existe, así que va siempre pegado a su proyecto.
 */
function describirProyectos(contacto: ChatContact): string {
  const [primero, ...resto] = contacto.proyectos;
  if (!primero) return '';

  const base = `${primero.rol} en ${primero.name}`;
  return resto.length > 0 ? `${base} · +${resto.length}` : base;
}

function FilaPersona({
  peerId,
  nombre,
  activo,
  unread,
  muted,
  detalle,
  cuando,
}: {
  peerId: string;
  nombre: string;
  activo: boolean;
  unread: number;
  muted: boolean;
  detalle: string | null;
  cuando: string | null;
}) {
  return (
    <li>
      <Link
        /* Sin el basePath: dentro de dashboard-front, Next lo añade solo. */
        href={`/chat/${peerId}`}
        aria-current={activo ? 'page' : undefined}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated"
        style={activo ? { background: alpha(colors.primary, 12) } : undefined}
      >
        <Avatar label={nombre} size="sm" />

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
function FilaProyecto({ chat, autor }: { chat: ChatDeProyecto; autor: string | null }) {
  const inicial = chat.project.name.trim()[0]?.toUpperCase() ?? '·';

  return (
    <a
      href={`/projects/${chat.project.slug}?tab=chat`}
      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated"
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
            ? `${autor ?? 'Alguien'}: ${textoPlano(chat.ultimo.body)}`
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
    </a>
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

/** «14:32» si es de hoy, «mar» esta semana, «12 ago» más atrás. */
function cuandoCorto(iso: string): string {
  const fecha = new Date(iso);
  const ahora = new Date();
  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);

  if (dias === 0) return fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (dias < 7) return fecha.toLocaleDateString('es', { weekday: 'short' });
  return fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
