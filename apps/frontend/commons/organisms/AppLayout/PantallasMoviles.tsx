'use client';

import { ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import type { DirectConversation, ProjectChatSummary, UserProfile } from '../../api/domain';
import { personLabel } from '../../api/domain';
import { avatarHref } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { ProjectMonogram } from '../../atoms/ProjectMonogram';
import { SelectorDeTema } from '../../molecules/SelectorDeTema';
import { usePresence } from '../../realtime/presence';
import { SidebarInboxList, cuandoCorto, resumenDe, useDatosDeTu } from './AppShell';
import { useDirectorioDeChats } from './DirectorioDeChats';
import { OrgSwitcher } from './OrgSwitcher';
import { BuscadorDeBarra, normalizarBusqueda } from './SidebarPrimitives';

/**
 * Las pantallas de las pestañas de móvil que no son de una sola sección: la
 * lista de chats, Avisos y Tú (M8 de `docs/PLAN-MOVIL.md`).
 *
 * Viven en `commons` porque reutilizan lo que el armazón ya tiene vivo —el
 * directorio de conversaciones, la bandeja, el perfil y las organizaciones— y
 * así no vuelven a pedirlo al servidor.
 */

const GATEWAY_PATH = '/api/gateway';

type Filtro = 'todos' | 'equipos' | 'privados';

type Entrada =
  | { tipo: 'equipo'; clave: string; cuando: number; chat: ProjectChatSummary }
  | { tipo: 'privado'; clave: string; cuando: number; conversacion: DirectConversation };

/**
 * Todas tus conversaciones, **en una sola lista ordenada por la última**, como
 * cualquier app de mensajes. En escritorio son dos grupos plegables en la
 * barra; aquí un teléfono no tiene barra y dos grupos obligaban a buscar en
 * dos sitios. Se filtra con tres píldoras en vez de plegar.
 *
 * Los datos son los del `DirectorioDeChatsProvider`: vivos —un mensaje que
 * llega sube su fila y su insignia— y ya cargados, porque el armazón los pide
 * para la barra lateral aunque no se vea.
 *
 * El buscador es el mismo de Inicio y cae en el mismo sitio (`movil` de
 * `BuscadorDeBarra`): cambiar de pestaña no lo mueve.
 */
export function ListaDeChatsMovil() {
  const { directas, deProyecto, directorio, cargando } = useDirectorioDeChats();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const termino = normalizarBusqueda(busqueda);

  const entradas: Entrada[] = [
    ...deProyecto.map(
      (chat): Entrada => ({
        tipo: 'equipo',
        clave: `p:${chat.project.id}`,
        cuando: chat.ultimo ? Date.parse(chat.ultimo.createdAt) : 0,
        chat,
      }),
    ),
    ...directas.map(
      (conversacion): Entrada => ({
        tipo: 'privado',
        clave: `d:${conversacion.peerId}`,
        cuando: conversacion.ultimo ? Date.parse(conversacion.ultimo.createdAt) : 0,
        conversacion,
      }),
    ),
  ];

  const nombreDe = (e: Entrada) =>
    e.tipo === 'equipo'
      ? e.chat.project.name
      : (() => {
          const peer = directorio.get(e.conversacion.peerId);
          return peer ? personLabel(peer) : 'Alguien';
        })();

  const visibles = entradas
    .filter((e) =>
      filtro === 'todos' ? true : filtro === 'equipos' ? e.tipo === 'equipo' : e.tipo === 'privado',
    )
    .filter((e) => !termino || normalizarBusqueda(nombreDe(e)).includes(termino))
    /* Lo más reciente arriba; lo que nunca tuvo un mensaje, al final y por nombre. */
    .sort((a, b) => b.cuando - a.cuando || nombreDe(a).localeCompare(nombreDe(b)));

  return (
    <div className="flex flex-col">
      <BuscadorDeBarra
        valor={busqueda}
        onCambiar={setBusqueda}
        placeholder="Buscar"
        etiqueta="Buscar conversaciones"
        movil
      >
        <div role="tablist" aria-label="Qué conversaciones" className="flex gap-2">
          {(
            [
              ['todos', 'Todos'],
              ['equipos', 'Equipos'],
              ['privados', 'Privados'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={`min-h-8 rounded-full px-3.5 font-sans text-[13px] font-medium transition-[background-color,color,transform] active:scale-95 ${
                filtro === valor
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-text-secondary active:bg-white/10'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </BuscadorDeBarra>

      {cargando ? (
        <div className="flex flex-col gap-1 pt-2" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="h-11 w-11 shrink-0 animate-presione rounded-full bg-white/5" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3 w-1/3 animate-presione rounded bg-white/5" />
                <div className="h-3 w-2/3 animate-presione rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <p className="px-6 py-16 text-center font-sans text-[14px] leading-relaxed text-text-secondary">
          {termino
            ? `Ninguna conversación coincide con «${busqueda.trim()}».`
            : filtro === 'privados'
              ? 'Todavía no tienes conversaciones privadas. Escríbele a alguien de tu equipo desde su perfil.'
              : filtro === 'equipos'
                ? 'Ninguno de tus proyectos tiene chat todavía.'
                : 'Todavía no tienes ninguna conversación.'}
        </p>
      ) : (
        <ul className="flex flex-col pt-1">
          {visibles.map((e) => (
            <li key={e.clave}>
              {e.tipo === 'equipo' ? (
                <FilaDeEquipo
                  chat={e.chat}
                  autor={
                    e.chat.ultimo?.authorId ? directorio.get(e.chat.ultimo.authorId) : undefined
                  }
                />
              ) : (
                <FilaPrivada
                  conversacion={e.conversacion}
                  peer={directorio.get(e.conversacion.peerId)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** El cuerpo común de una fila: avatar, nombre y hora, resumen e insignia. */
function FilaDeChat({
  href,
  avatar,
  nombre,
  cuando,
  resumen,
  sinLeer,
}: {
  href: string;
  avatar: ReactNode;
  nombre: string;
  cuando: string | null;
  resumen: string;
  sinLeer: number;
}) {
  const hay = sinLeer > 0;
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-[background-color,transform] active:scale-[0.99] active:bg-white/[0.06]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center [&>*]:shrink-0">
        {avatar}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={`truncate font-sans text-[15px] ${
              hay ? 'font-semibold text-white' : 'font-medium text-text-primary'
            }`}
          >
            {nombre}
          </span>
          {cuando && (
            <span
              className={`ml-auto shrink-0 font-sans text-[12px] ${
                hay ? 'font-medium text-white' : 'text-text-secondary'
              }`}
            >
              {cuando}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate font-sans text-[13px] ${
              hay ? 'text-text-primary' : 'text-text-secondary'
            }`}
          >
            {resumen}
          </span>
          {hay && (
            <span
              aria-label={`${sinLeer} sin leer`}
              className="insignia-entra min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center font-sans text-[11px] font-semibold leading-5 text-primary-foreground"
            >
              {sinLeer > 99 ? '99+' : sinLeer}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

function FilaDeEquipo({ chat, autor }: { chat: ProjectChatSummary; autor?: UserProfile }) {
  return (
    <FilaDeChat
      href={`/chat/proyecto/${chat.project.id}`}
      avatar={
        <ProjectMonogram
          id={chat.project.id}
          name={chat.project.name}
          iconKey={chat.project.iconKey}
          imageUrl={chat.project.imageUrl}
          color={chat.project.color}
          size="md"
        />
      }
      nombre={chat.project.name}
      cuando={chat.ultimo ? cuandoCorto(chat.ultimo.createdAt) : null}
      resumen={
        chat.ultimo
          ? `${autor ? personLabel(autor) : 'Alguien'}: ${resumenDe(chat.ultimo)}`
          : 'Chat del equipo · sin mensajes'
      }
      sinLeer={chat.unread}
    />
  );
}

function FilaPrivada({
  conversacion,
  peer,
}: {
  conversacion: DirectConversation;
  peer?: UserProfile;
}) {
  const nombre = peer ? personLabel(peer) : 'Alguien';
  const presencia = usePresence(conversacion.peerId, peer?.presence);
  return (
    <FilaDeChat
      href={`/chat/${conversacion.peerId}`}
      avatar={
        <Avatar
          label={nombre}
          size="md"
          src={avatarHref(peer?.avatarUrl, GATEWAY_PATH)}
          presence={presencia}
        />
      }
      nombre={nombre}
      cuando={conversacion.ultimo ? cuandoCorto(conversacion.ultimo.createdAt) : null}
      resumen={conversacion.ultimo ? resumenDe(conversacion.ultimo) : 'Iniciar conversación'}
      sinLeer={conversacion.unread}
    />
  );
}

/**
 * La pestaña «Avisos»: la bandeja como pantalla, no como hoja (M8). Es la misma
 * lista de la campana de escritorio, viva y con «Sin leer / Todos».
 */
export function BandejaMovil() {
  return <SidebarInboxList zonePath="" plegada={false} movil />;
}

/**
 * La pestaña «Tú», como una pantalla de ajustes de app (M8): todo a la vista y
 * sin nada que desplegar.
 *
 * 1. Tu perfil y tu estado (`perfilSlot`, que compone el `layout.tsx`).
 * 2. La organización: cuál miras, sus acciones y a cuál cambiar.
 * 3. Los ajustes —equipo, facturación, integraciones…—, como filas con flecha.
 * 4. Cerrar sesión, al final, que es donde se busca.
 */
export function PantallaTu() {
  const datos = useDatosDeTu();
  const [saliendo, setSaliendo] = useState(false);
  if (!datos) return null;
  const { user, perfilSlot, organizaciones, navItems, organizacionActivaId } = datos;

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await fetch('/auth/api/logout', { method: 'POST' });
    } catch {
      /* Aunque falle, se sale igual: las cookies caducan solas. */
    }
    window.location.assign('/');
  }

  /* Los ajustes, agrupados por su sección y sin plegar. */
  const grupos: Array<{ seccion: string; items: typeof navItems }> = [];
  for (const item of navItems) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.seccion === item.section) ultimo.items.push(item);
    else grupos.push({ seccion: item.section, items: [item] });
  }

  return (
    <div className="flex flex-col gap-8 pb-6">
      {perfilSlot}

      <section aria-label="Organización" className="flex flex-col gap-2">
        <h3 className="px-4 font-sans text-[13px] font-medium text-text-secondary">Organización</h3>
        <OrgSwitcher
          name={user.name}
          plegada={false}
          organizaciones={organizaciones}
          activaId={organizacionActivaId}
          zonePath=""
          estatico
        />
      </section>

      {grupos.map((grupo) => (
        <section key={grupo.seccion} aria-label={grupo.seccion} className="flex flex-col gap-2">
          <h3 className="px-4 font-sans text-[13px] font-medium text-text-secondary">
            {grupo.seccion}
          </h3>
          <nav
            aria-label={grupo.seccion}
            className="flex flex-col overflow-hidden rounded-2xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
          >
            {grupo.items.map((item) =>
              item.disabled ? (
                <span
                  key={item.href}
                  aria-disabled="true"
                  className="flex min-h-12 items-center gap-3 px-4 font-sans text-[15px] text-text-secondary opacity-60 [&_svg]:h-5 [&_svg]:w-5"
                >
                  <span className="flex shrink-0">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <span className="font-sans text-[11px] uppercase tracking-wider">Pronto</span>
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-12 items-center gap-3 px-4 font-sans text-[15px] text-text-primary transition-colors active:bg-white/10 [&_svg]:h-5 [&_svg]:w-5"
                >
                  <span className="flex shrink-0 text-text-secondary">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="text-text-secondary" aria-hidden="true" />
                </Link>
              ),
            )}
          </nav>
        </section>
      ))}

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          disabled={saliendo}
          className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-white/[0.04] px-4 font-sans text-[15px] font-medium text-error transition-colors active:bg-white/10 disabled:opacity-60"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate">{saliendo ? 'Saliendo…' : 'Cerrar sesión'}</span>
        </button>
        <SelectorDeTema className="min-h-12 rounded-2xl px-1" />
      </div>
    </div>
  );
}
