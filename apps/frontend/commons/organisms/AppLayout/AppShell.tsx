'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { personLabel } from '../../api/domain';
import { avatarHref } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { ProjectMonogram } from '../../atoms/ProjectMonogram';
import { LivePresences, LiveSource, useLiveEvent, useReconnection } from '../../realtime';
import { usePresence } from '../../realtime/presence';
import { useMessageCount } from '../../realtime/useMessageCount';
import { alpha, colors } from '../../tokens';
import { KylooWordmark } from '../KylooWordmark';
import { DockColumn, DockProvider } from './DockPanel';
import { NavList } from './NavList';
import { OrgSwitcher } from './OrgSwitcher';
import { PraxProvider } from './PraxWindow';
import type { AppNavItem } from './navigation';

/**
 * Las tarjetas emergentes, **fuera de la carga inicial** (E6.5).
 *
 * ## Qué pesa y por qué
 *
 * `LiveNotices` usa `sileo` para las tarjetas, y `sileo` arrastra `motion`.
 * Medido sobre la compilación de producción de dashboard-front: el trozo que
 * lleva `motion` son **82 KB comprimidos de los 358 KB** de JavaScript de
 * cliente — un **23%**. Y entraba en las **seis** zonas privadas, porque este
 * armazón lo monta en todas.
 *
 * Eso es un cuarto del bundle de cada pantalla privada dedicado a animar unas
 * tarjetas que **solo aparecen cuando llega un evento**, y que nunca están en
 * pantalla al cargar.
 *
 * ## Lo que se pierde, dicho claro
 *
 * Diferirlo abre una ventana corta —desde que hidrata hasta que llega el
 * trozo— en la que un evento **no sacaría tarjeta**. Es asumible por una razón
 * concreta: la tarjeta no es el dato. El contador de la barra lateral, la lista
 * de conversaciones y el propio panel del chat escuchan el flujo **por su
 * cuenta**, así que un aviso en esa ventana se sigue viendo en todos los sitios
 * donde importa; lo único que no aparece es el emergente.
 *
 * `ssr: false` porque no hay nada que renderizar en el servidor: sin eventos, no
 * hay tarjetas.
 */
const LiveNotices = dynamic(() => import('../LiveNotices').then((modulo) => modulo.LiveNotices), {
  ssr: false,
});

export interface AppShellUser {
  /** Nombre para mostrar. Puede venir vacío: el registro no pide nombre. */
  name: string;
  email: string;
  /** Foto, ya con el proxy de la zona delante (`avatarHref`). */
  avatarSrc?: string | null;
  /** Presencia elegida. Pinta el punto de color sobre el avatar. */
  presence?: string | null;
}

export interface AppShellProps {
  navItems: AppNavItem[];
  /**
   * Ruta pública de la zona (`/dashboard`, `/projects`).
   *
   * ⚠️ Hace falta porque `usePathname()` devuelve la ruta **sin el basePath**:
   * dentro de dashboard-front, `/dashboard/notifications` llega como
   * `/notifications`, y los enlaces de la barra lateral son rutas del shell.
   * La zona sabe cuál es su prefijo; este componente no.
   */
  zonePath: string;
  user: AppShellUser;
  /**
   * El selector de estado, **dibujado sobre la esquina del avatar**.
   *
   * ⚠️ Este hueco fue antes el pie de la barra: primero con «Cerrar sesión»
   * —que se movió a la pantalla de cuenta— y luego con una fila que repetía el
   * estado con su etiqueta. La fila sobraba, porque el punto del avatar ya lo
   * decía; ahora ese punto **es** el botón, y esto es lo que se pinta encima.
   *
   * Lo pone la zona porque la escritura va por su propio proxy: ver
   * `PresenceFooter`.
   */
  estadoSlot?: ReactNode;
  /**
   * Si la barra sale plegada, **resuelto en el servidor**.
   *
   * Lo lee el `layout.tsx` de la zona con `getSidebarPlegada()`. Va por props y
   * no se lee aquí porque este componente es de cliente y la cookie hay que
   * conocerla **antes** de pintar: si se leyera al hidratar, la barra saldría
   * desplegada y se plegaría a la vista en cada navegación.
   */
  plegadaInicial?: boolean;
  /**
   * Las organizaciones a las que perteneces, y cuál estás mirando.
   *
   * ⚠️ **Lo resuelve el `layout.tsx` de la zona**, igual que `plegadaInicial`:
   * la organización activa vive en una cookie y hay que conocerla **antes** de
   * pintar, o la lista de proyectos sale entera y se recorta tras hidratar.
   *
   * Ausente, el selector se comporta como antes: enseña el espacio de quien
   * mira y no ofrece cambiar. Es lo que pasa en las zonas que todavía no lo
   * pasan, y no rompe nada.
   */
  organizaciones?: OrgDelSelector[];
  organizacionActivaId?: string | null;
  children: ReactNode;
}

/** Lo poco que el selector necesita saber de una organización. */
export interface OrgDelSelector {
  id: string;
  name: string | null;
  /** `PERSONAL` se dibuja distinto: es tu espacio, no un equipo. */
  kind: 'PERSONAL' | 'ENTERPRISE';
  tier: string;
  soyDueno: boolean;
  /**
   * Identidad visual, del modal de configuración. `null` = monograma de letras.
   * `iconKey` es un icono de `lucide-react` de la lista curada; `color`, un
   * `#rrggbb`.
   */
  iconKey?: string | null;
  color?: string | null;
}

/**
 * Armazón del área privada: barra lateral, cajón móvil y columna de contenido.
 *
 * **Va en el `layout.tsx` de la zona, no en cada page**, y ese es todo el
 * motivo por el que existe separado de la cabecera. Cuando el armazón vivía
 * dentro de cada página, navegar entre pantallas de la misma zona lo desmontaba
 * y el `loading.tsx` pintaba una barra lateral de esqueletos: parpadeaban los
 * enlaces, el nombre y el correo de quien ya estaba identificado y hasta el
 * botón de cerrar sesión. Nada de eso cambia entre pantallas.
 *
 * En el layout, Next lo conserva entre navegaciones del mismo segmento: la barra
 * lateral no se vuelve a renderizar ni se vuelve a pedir su contador, y el
 * `loading.tsx` solo cubre lo que de verdad está cargando.
 *
 * El botón del menú móvil vive en la cabecera, que es otro componente y otra
 * parte del árbol, así que la apertura del cajón viaja por contexto. Es la única
 * pieza de estado que cruza esa frontera.
 */
const AppShellContext = createContext<{
  openMenu: () => void;
  plegada: boolean;
} | null>(null);

/** Lo usa `AppHeader` para su botón de menú en móvil. */
export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell solo funciona dentro de <AppShell>');
  }
  return context;
}

/**
 * Si la barra está plegada, para lo que se pinta **dentro** de ella.
 *
 * Existe para el pie —hoy «Cerrar sesión»—, que llega como slot desde el
 * `layout.tsx` de cada zona: el armazón no puede recortarle el texto sin saber
 * qué hay dentro, y pasarle una prop obligaría a que las cuatro zonas se
 * enteraran de un detalle que no es suyo. Por contexto se entera solo quien lo
 * necesita.
 *
 * Devuelve `false` fuera del armazón en vez de reventar: un botón usado suelto
 * en otra pantalla se pinta entero, que es lo correcto ahí.
 */
export function useSidebarPlegada(): boolean {
  return useContext(AppShellContext)?.plegada ?? false;
}

/**
 * La cookie que recuerda el pliegue. Espejo de `commons/theme/sidebar.ts`.
 *
 * ⚠️ Se repite el nombre aquí en vez de importarlo porque aquel es un **módulo
 * de servidor** —usa `next/headers`— y este componente es de cliente. Importarlo
 * arrastraría `next/headers` al navegador, que es el error que documenta el
 * índice de `theme/`. Si cambia allí, cambia aquí.
 */
const SIDEBAR_COOKIE = 'praxis_sidebar';
const UN_ANO = 60 * 60 * 24 * 365;

/**
 * Dónde vive la pantalla de la cuenta.
 *
 * Ruta **absoluta y con el prefijo de zona**: la pantalla la sirve `dashboard`
 * y esta barra la pintan las seis zonas, así que desde `projects` o `reports`
 * hay que salir de la zona. Por eso es un `<a>` y no un `next/link`, que
 * prefijaría con el basePath de la zona actual (ESTADO-ACTUAL §16).
 */
const CUENTA_HREF = '/main/profile';

/**
 * Dónde vive el centro de mensajes.
 *
 * Espejo de `CHAT_HREF` en `commons/auth/nav.ts`. Se repite en vez de
 * importarse porque aquel es un módulo de **servidor** —usa `next/headers`— y
 * esto es un componente de cliente; importarlo arrastraría `next/headers` al
 * navegador. Mismo caso que `SIDEBAR_COOKIE`, arriba.
 */
const HREF_DE_MENSAJES = '/chat';

/**
 * El armazón, con las dos fuentes de tiempo real montadas por encima.
 *
 * ⚠️ **La separación en dos componentes no es estética: sin ella, los hooks del
 * propio armazón no ven el contexto.**
 *
 * `LiveSource` y `LivePresences` son proveedores, y un componente que
 * *renderiza* un proveedor está **por encima** de él en el árbol: su
 * `useContext` devuelve el valor por defecto, no el del proveedor. Con todo
 * junto en una sola función, `useMessageCount` —que vive aquí, para la
 * insignia de la barra lateral— se suscribía a una fuente que desde su punto de
 * vista **no existía**.
 *
 * Y no daba ningún error, porque `useLiveEvent` está escrito para no lanzar
 * cuando no encuentra la fuente: quedarse sin tiempo real es una degradación
 * aceptable en una pantalla suelta. Esa tolerancia, pensada para otro caso,
 * convirtió esto en un fallo mudo — la insignia sencillamente no se movía.
 *
 * Partiéndolo, todo lo que necesite escuchar el flujo vive en `ArmazonInterno`,
 * que sí es descendiente.
 */
export function AppShell(props: AppShellProps) {
  return (
    <LiveSource gatewayPath={`${props.zonePath}/api/gateway`}>
      {/* Por encima de todo lo que pinte un avatar: el punto de estado de
          cualquier persona se corrige solo desde aquí. */}
      <LivePresences>
        {/* El cajón lateral, por encima del armazón: la columna la pinta él y
            el contenido lo proyecta la página, así que el proveedor tiene que
            envolver a los dos. Ver `DockPanel`. */}
        <DockProvider>
          {/* PRAX global: el lanzador de la cabecera y el minichat (flotante o
              acoplado). Dentro de `DockProvider` porque el modo acoplado usa su
              columna. Ver `PraxWindow`. */}
          <PraxProvider
            zonePath={props.zonePath}
            organizacionActivaId={props.organizacionActivaId ?? null}
          >
            <ArmazonInterno {...props} />
          </PraxProvider>
        </DockProvider>
      </LivePresences>
    </LiveSource>
  );
}

function ArmazonInterno({
  navItems,
  zonePath,
  user,
  estadoSlot,
  plegadaInicial = false,
  organizaciones,
  organizacionActivaId,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const browserPath = zonePath + (pathname === '/' ? '' : pathname);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'inbox'>(() => {
    const isChat = zonePath === '/chat' || browserPath.startsWith('/chat');
    if (isChat) return 'chat';

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('praxis:sidebarTab');
      if (stored === 'chat' || stored === 'inbox') return stored;
    }
    return 'home';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('praxis:sidebarTab', activeTab);
    }
  }, [activeTab]);
  /**
   * ⚠️ **El estado nace de la cookie que ya leyó el servidor**, no de un efecto.
   *
   * Estaba en `localStorage` y se leía tras hidratar, así que el servidor
   * siempre servía la barra desplegada y el cliente la plegaba un instante
   * después. En Multi-Zones **cada cambio de zona es una carga completa**, así
   * que ese parpadeo salía en cada navegación. Con la cookie, el HTML ya viene
   * con el ancho correcto y no hay nada que corregir.
   */
  const [plegada, setPlegada] = useState(plegadaInicial);

  function alternarPliegue() {
    const siguiente = !plegada;
    setPlegada(siguiente);
    /* Se escribe desde el cliente: no hace falta una Server Action para una
       preferencia de tamaño, y así el cambio es inmediato. `path=/` para que
       las cinco zonas la vean — sin eso, plegarla aquí no la pliega allí. */
    document.cookie = `${SIDEBAR_COOKIE}=${siguiente ? '1' : '0'}; path=/; max-age=${UN_ANO}; samesite=lax`;
  }

  /* `/` es la raíz de la zona: su ruta pública es el prefijo a secas. */
  const activePath = pathname === '/' ? zonePath : `${zonePath}${pathname}`;

  /**
   * ¿Estás en tu cuenta?
   *
   * ⚠️ **Sin esto, la barra marcaba «Panel».** `activeHrefOf` resuelve por
   * prefijo, y `/dashboard/profile` empieza por `/dashboard`, que es el href de
   * Panel: la sección más específica gana, pero la cuenta **no es una sección**
   * y no tiene entrada propia con la que competir. Se resuelve dejando la lista
   * sin nada activo y marcando la ficha de usuario, que es de donde se viene.
   */
  const enCuenta = activePath === CUENTA_HREF || activePath.startsWith(`${CUENTA_HREF}/`);
  const activePathDeSecciones = enCuenta ? '' : activePath;

  /**
   * La insignia de Mensajes, **viva**.
   *
   * ⚠️ El número llega del servidor dentro de `navItems`, y solo cambiaba al
   * recargar: lo que lo actualizaba era el `router.refresh()` por evento de
   * chat, que se quitó al desatascar la cola del App Router. Se quedó sin
   * fuente — sonaba el aviso y el número no se movía. Ahora escucha el flujo
   * como el resto; ver `useMessageCount`.
   *
   * Se sustituye **solo esa entrada**: las demás insignias las sigue
   * calculando el servidor porque cambian con cosas que no viajan por el flujo
   * de chat.
   */
  const mensajesSinLeer = useMessageCount(
    navItems.find((item) => item.href === HREF_DE_MENSAJES)?.badge ?? 0,
    `${zonePath}/api/gateway`,
  );

  const navItemsVivos = navItems.map((item) =>
    item.href === HREF_DE_MENSAJES ? { ...item, badge: mensajesSinLeer } : item,
  );

  return (
    <AppShellContext.Provider value={{ openMenu: () => setMobileMenuOpen(true), plegada }}>
      <div className="flex h-screen overflow-hidden bg-[#191919] font-sans text-text-primary">
        {/* ── Barra lateral (escritorio) ───────────────────────── */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-border bg-[#202020] transition-[width] duration-200 md:flex ${
            plegada ? 'w-[4.5rem]' : 'w-80'
          }`}
        >
          {/* El pliegue vive **en la cabecera, al lado de la marca**: es donde
              se busca por costumbre, y ahí no compite con «Cerrar sesión», que
              era el vecino que tenía abajo y con el que se podía confundir. */}
          {/**
           * Plegada, la marca **no está**: no se encoge a una inicial.
           *
           * Estuvo como una «P» suelta y no funcionaba — una letra sola en una
           * columna de iconos se lee como un icono más, no como la marca, y
           * encima competía por el sitio con el botón. Quien está dentro de la
           * aplicación ya sabe en qué aplicación está; el logotipo es para la
           * landing y para la pantalla de entrada.
           *
           * Lo que queda es el botón, centrado, que es lo único accionable de
           * esta franja cuando está plegada.
           */}
          <div
            className={`flex items-center border-b border-border ${
              plegada ? 'h-16 justify-center px-0' : 'h-16 justify-between px-6'
            }`}
          >
            {!plegada && (
              <div className="flex items-center gap-2">
                <Wordmark />
                <ByKyloo />
              </div>
            )}
            <BotonDePliegue plegada={plegada} onClick={alternarPliegue} />
          </div>

          <div
            className={`scrollbar-none flex-1 overflow-y-auto py-6 ${plegada ? 'px-2' : 'px-4'}`}
          >
            <div className="mb-4">
              <OrgSwitcher
                name={user.name}
                plegada={plegada}
                organizaciones={organizaciones}
                activaId={organizacionActivaId ?? null}
                zonePath={zonePath}
              />
            </div>

            {!plegada && (
              <div className="mb-4 flex items-center gap-1.5 px-1 overflow-x-auto whitespace-nowrap scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveTab('home')}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                    activeTab === 'home'
                      ? 'bg-white/10 text-white'
                      : 'text-white hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  Inicio
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                    activeTab === 'chat'
                      ? 'bg-white/10 text-white'
                      : 'text-white hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('inbox')}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                    activeTab === 'inbox'
                      ? 'bg-white/10 text-white'
                      : 'text-white hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                  Bandeja de entrada
                </button>
              </div>
            )}
            {activeTab === 'home' && (
              <div className="flex flex-col gap-4">
                <SidebarProjectsTree
                  zonePath={zonePath}
                  plegada={plegada}
                  activePath={activePathDeSecciones}
                  organizacionActivaId={organizacionActivaId ?? null}
                />
                <NavList
                  navItems={navItemsVivos.filter((i) => i.href !== '/projects')}
                  activePath={activePathDeSecciones}
                  plegada={plegada}
                />
              </div>
            )}
            {activeTab === 'chat' && (
              <SidebarChatList
                zonePath={zonePath}
                plegada={plegada}
                organizacionActivaId={organizacionActivaId ?? null}
              />
            )}
            {activeTab === 'inbox' && <SidebarInboxList zonePath={zonePath} plegada={plegada} />}
          </div>

          <div className={`border-t border-border ${plegada ? 'p-2' : 'p-4'}`}>
            {/* Plegada, la tarjeta de usuario se queda en el avatar: el nombre y
                el correo no caben, y el avatar ya identifica de quién es la
                sesión, que es lo que esa tarjeta viene a decir. */}
            {plegada ? (
              /* Plegada, el enlace y el selector siguen siendo hermanos por lo
                 mismo que desplegada: un botón dentro de un `<a>` no vale. */
              <div
                className={`mb-2 flex justify-center rounded-full p-1 transition-colors hover:bg-white/5 ${
                  enCuenta ? 'bg-white/5' : ''
                }`}
              >
                <span className="relative">
                  <a
                    href={CUENTA_HREF}
                    aria-current={enCuenta ? 'page' : undefined}
                    className="block"
                    title={`${user.name.trim() || user.email} — tu cuenta`}
                  >
                    {/* Sin `presence`: el punto lo pinta `estadoSlot`, que
                        además se puede pulsar. Ver el aviso de esa prop. */}
                    <Avatar
                      label={user.name.trim() || user.email}
                      mine
                      size="md"
                      src={user.avatarSrc ?? null}
                    />
                  </a>
                  {estadoSlot && <span className="absolute bottom-0 right-0">{estadoSlot}</span>}
                </span>
              </div>
            ) : (
              <UserCard user={user} activa={enCuenta} estadoSlot={estadoSlot} />
            )}
          </div>
        </aside>

        {/* ── Contenido ────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>

        {/**
         * El cajón lateral, **hermano del contenido y no encima de él**.
         *
         * Al ser una columna más de esta misma fila flex, abrirlo recoloca lo de
         * al lado porque es lo que hace un `flex` — no porque nadie le haya
         * sumado un margen al `body`. Cerrado mide cero y **conserva dentro lo
         * que hubiera montado**, que es lo que permite cerrar el panel de PRAX,
         * mirar un gráfico y volver sin perder la conversación.
         *
         * Va después del contenido en el DOM y no antes: el orden de lectura de
         * un lector de pantalla es el del documento, y un panel accesorio se lee
         * después de aquello a lo que acompaña.
         */}
        <DockColumn />

        {/**
         * Los avisos en vivo se enganchan aquí, en el armazón, y no en cada
         * zona: el armazón vive en el `layout.tsx`, así que la conexión se abre
         * una vez y **sobrevive a navegar** entre pantallas de la zona. Puesto
         * en una page, cada navegación la cerraría y volvería a abrir.
         *
         * La ruta del proxy sale de `zonePath`, que la zona ya nos da: en
         * projects-front es `/projects/api/gateway`, y ahí es donde esa zona
         * monta su `createGatewayProxy()`.
         */}
        <LiveNotices />

        {/* ── Cajón lateral (móvil) ────────────────────────────── */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 backdrop-blur-sm"
              style={{ background: alpha(colors.overlay, 80) }}
            />

            <div className="fixed inset-y-0 left-0 z-10 flex w-64 flex-col justify-between border-r border-border bg-[#202020] p-4">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-2 mt-1">
                  <Wordmark />
                  <ByKyloo />
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="rounded-md p-1 text-white transition-colors hover:text-text-primary"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-6 flex-1 overflow-y-auto scrollbar-none mb-6">
                <OrgSwitcher
                  name={user.name}
                  plegada={false}
                  organizaciones={organizaciones}
                  activaId={organizacionActivaId ?? null}
                  zonePath={zonePath}
                />

                <NavList
                  navItems={navItemsVivos}
                  activePath={activePathDeSecciones}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </div>

              <div className="border-t border-border pt-4">
                <UserCard user={user} activa={enCuenta} estadoSlot={estadoSlot} />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShellContext.Provider>
  );
}

/**
 * La ficha de usuario del pie: ahora es **la puerta a tu cuenta**.
 *
 * Antes era un rótulo y debajo iba «Cerrar sesión». Pulsar tu propia cara es
 * el gesto que ya se intenta en cualquier otra herramienta, así que ahí es
 * donde se ha puesto lo tuyo: nombre, foto, presencia, cerrar sesión y borrar
 * la cuenta.
 */
function UserCard({
  user,
  activa = false,
  estadoSlot,
}: { user: AppShellUser; activa?: boolean; estadoSlot?: ReactNode }) {
  return (
    <div
      title="Tu cuenta"
      aria-current={activa ? 'page' : undefined}
      /* Resaltada cuando estás dentro: es la única «entrada» de la barra que no
         vive en la lista de secciones, así que si no se marcara aquí, estando
         en tu cuenta no habría nada marcado en ninguna parte. */
      className={`mb-3 flex items-center gap-3 rounded-full p-1 transition-colors hover:bg-white/5 ${
        activa ? 'bg-white/5' : ''
      }`}
    >
      {/* El mismo círculo que las tarjetas del tablero, y con `mine` puesto: en
          la barra lateral la persona siempre eres tú, así que sale en rojo. Que
          coincida importa — es lo que enseña que el rojo significa «tuyo». */}
      {/**
       * El avatar y su punto **no van dentro del enlace**: el punto es un botón
       * y un botón dentro de un `<a>` es HTML inválido —y en la práctica, un
       * clic que navega en vez de abrir el menú—. Por eso la ficha es una fila
       * con dos cosas: un enlace que ocupa el texto y el avatar, y el selector
       * de estado encima, fuera de él.
       */}
      <span className="relative shrink-0">
        <a href={CUENTA_HREF} className="block" title="Tu cuenta">
          <Avatar
            label={user.name.trim() || user.email}
            mine
            size="md"
            src={user.avatarSrc ?? null}
          />
        </a>
        {estadoSlot && <span className="absolute bottom-0 right-0">{estadoSlot}</span>}
      </span>
      {/* El texto sí es el enlace a tu cuenta. */}
      <a href={CUENTA_HREF} className="min-w-0 flex-1">
        {user.name.trim() && (
          <p className="truncate font-sans text-sm font-semibold text-white">{user.name}</p>
        )}
        <p className="truncate font-sans text-xs text-white">{user.email}</p>
      </a>
    </div>
  );
}

/**
 * El mismo logotipo que navbar/footer de la landing — `var(--font-grotesk)`
 * (Archivo 800), no `font-display` (Redaction 50, la voz del resto de la
 * app): el nombre de Praxis es una marca, no un titular, y las dos zonas
 * donde aparece tienen que decir lo mismo. Morado (`text-primary`) porque
 * aquí, a diferencia de la landing, la aplicación sí tiene color de marca.
 */
function Wordmark() {
  return (
    <span
      className="select-none text-lg font-extrabold tracking-tight text-primary"
      style={{ fontFamily: 'var(--font-grotesk)' }}
    >
      Praxis
    </span>
  );
}

/**
 * "By Kyloo" — el mismo lettermark real que el cierre del footer de la
 * landing y `AuthPanel` (`kyloo-design/SKILL.md` §8, §12), a escala de
 * esquina de barra lateral. Cada zona que monta `AppShell` tiene que cargar
 * Archivo y Khteka en su propio `layout.tsx` — sin la variable, el texto cae
 * a su *fallback* en silencio, no revienta.
 */
function ByKyloo() {
  return (
    <span className="flex items-center gap-1.5 text-white">
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em]">By</span>
      <KylooWordmark className="h-2.5 w-auto" />
    </span>
  );
}

/**
 * El selector de organización.
 *
 * ## Dejó de ser un dibujo
 *
 * Nació **solo visual** —icono, «Plan gratuito», un nombre inventado y un
 * chevron sin `onClick`— porque las organizaciones no existían en el backend, y
 * un desplegable que se abre y no lleva a ninguna parte era peor que no
 * tenerlo. Desde 2026-08-26 existen, todo el mundo tiene al menos la suya, y
 * **es donde viven los proyectos**: ahora abre.
 *
 * ## Qué hace al elegir una
 *
 * Escribe la cookie `praxis_org` y recarga. No es una llave: el servidor la usa
 * como **filtro sobre lo que ya puedes ver**, nunca como permiso. Poner ahí la
 * organización de otro devuelve cero proyectos, no los suyos. Ver
 * `commons/theme/organizacion.ts`.
 *
 * ## 🔴 Y ya no hay forma de no elegir ninguna
 *
 * Hasta 2026-08-28 la primera fila del desplegable era «Todas tus
 * organizaciones» y era el estado por defecto. Se retiró: mientras existía,
 * Suscripción y Roles y permisos tenían que volver a preguntar en cuál
 * trabajar, y elegirla dos veces para la misma sesión era el roce que esta
 * etapa vino a quitar. Ahora siempre hay una activa, resuelta en el servidor
 * antes de pintar.
 *
 * ⚠️ **Recarga dura y no `router.refresh()`.** La cookie la leen los siete
 * `layout.tsx` en el servidor, y un refresco del App Router no vuelve a
 * ejecutar el layout de una zona que ya está montada: el sidebar se quedaría
 * marcando la organización vieja mientras la lista de abajo enseña la nueva.
 */

/**
 * El botón de plegar: **un icono, sin texto**.
 *
 * Vive en la cabecera junto a la marca. Es un icono de paneles —no una flecha
 * suelta— porque una flecha en un borde se lee como «atrás»; dos rectángulos con
 * uno estrecho dicen de qué va sin necesidad de leer nada.
 *
 * El `aria-label` sí es texto completo y cambia con el estado: lo que se pierde
 * al quitar la palabra es para el ratón, no para quien navega con lector.
 */
function BotonDePliegue({ plegada, onClick }: { plegada: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!plegada}
      aria-label={plegada ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'}
      title={plegada ? 'Desplegar' : 'Plegar'}
      className="shrink-0 cursor-pointer rounded-md p-1.5 text-white transition-colors hover:bg-white/5 hover:text-text-primary"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        {/* La divisoria se mueve de lado según el estado: plegada queda a la
            izquierda —el panel estrecho— y desplegada a la derecha. Es la misma
            forma diciendo dos cosas, en vez de dos iconos distintos. */}
        <path strokeLinecap="round" d={plegada ? 'M9 4v16' : 'M15 4v16'} />
      </svg>
    </button>
  );
}

// ─── Árbol jerárquico de proyectos ──────────────────────────────────────────

function ChevronIcon({ open, className = 'h-3 w-3' }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

function WorkspaceLeafIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="14" width="7" height="6" rx="1.5" />
      <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
    </svg>
  );
}

interface SidebarProject {
  id: string;
  name: string;
  slug: string;
  iconKey: string | null;
  color: string | null;
  workspaces: Array<{ id: string; name: string }>;
}

async function fetchProjectsTree(
  zonePath: string,
  organizacionActivaId: string | null,
): Promise<SidebarProject[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (organizacionActivaId) {
    params.set('organizationId', organizacionActivaId);
  }

  const listBody = await fetch(`${zonePath}/api/gateway/projects?${params.toString()}`, {
    cache: 'no-store',
  })
    .then((r) => r.json())
    .catch(() => null);

  // El backend devuelve { data: { items: [...] } } o { data: [...] }
  const items: any[] =
    listBody?.data?.items ?? (Array.isArray(listBody?.data) ? listBody.data : []);
  if (items.length === 0) return [];

  const resolved = [];
  for (const p of items) {
    const detail = await fetch(`${zonePath}/api/gateway/projects/${p.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => null);
    const workspaces: Array<{ id: string; name: string }> = (detail?.data?.workspaces ?? []).map(
      (w: any) => ({ id: w.id, name: w.name }),
    );
    resolved.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      /* `GET /projects` ya trae la identidad visual; el detalle también, y es
         lo que gana si difieren. */
      iconKey: detail?.data?.iconKey ?? p.iconKey ?? null,
      color: detail?.data?.color ?? p.color ?? null,
      workspaces,
    });
  }
  return resolved;
}

function SidebarProjectsTree({
  zonePath,
  plegada,
  activePath,
  organizacionActivaId,
}: {
  zonePath: string;
  plegada: boolean;
  activePath: string;
  organizacionActivaId: string | null;
}) {
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const guardado = localStorage.getItem('praxis_sidebar_projects_expanded');
      if (guardado) {
        setExpanded(new Set(JSON.parse(guardado)));
      }
    } catch (e) {}
  }, []);

  const load = (esInicial = false) => {
    fetchProjectsTree(zonePath, organizacionActivaId)
      .then((resolved) => {
        setProjects((prev) => {
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(resolved);
          if (prevStr === nextStr) return prev;

          setExpanded((e) => {
            const next = new Set(e);
            resolved.forEach((p) => {
              if (esInicial) {
                // Solo si no habia nada guardado, expandimos por defecto
                if (!localStorage.getItem('praxis_sidebar_projects_expanded')) {
                  next.add(p.id);
                }
              } else if (!prev.find((pp) => pp.id === p.id)) {
                // Es un proyecto nuevo recien creado, lo expandimos
                next.add(p.id);
              }
            });
            try {
              localStorage.setItem('praxis_sidebar_projects_expanded', JSON.stringify([...next]));
            } catch (err) {}
            return next;
          });
          return resolved;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(true);

    // Polling ligero: refresca cada 30 s para capturar proyectos nuevos
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [zonePath]);

  // Refresca al volver el foco a la ventana (usuario crea proyecto en otra pestaña)
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [zonePath]);

  function toggleProject(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('praxis_sidebar_projects_expanded', JSON.stringify([...next]));
      } catch (err) {}
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-1 px-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (projects.length === 0 && !plegada) {
    return (
      <div className="px-3 py-1">
        <div className="-mx-3 mb-1.5 border-t border-border" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white select-none block mb-1">
          Proyectos
        </span>
        <a
          href="/projects"
          className="flex items-center gap-2 text-white hover:text-white text-[12px] py-1 transition-colors"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Crear primer proyecto
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Raya fina encima de la sección, igual que las de `NavList`. */}
      <div
        className={`${plegada ? 'mx-1' : ''} mb-1.5 border-t border-border`}
        aria-hidden="true"
      />
      {!plegada && (
        <div className="flex items-center justify-between px-3 mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white select-none">
            Proyectos
          </span>
          <a
            href="/projects"
            title="Ver todos los proyectos"
            className="rounded p-0.5 text-white hover:text-white transition-colors"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
          </a>
        </div>
      )}

      <nav aria-label="Proyectos" className="flex flex-col gap-0.5">
        {projects.map((project) => {
          const isOpen = expanded.has(project.id);
          // Las URLs de proyecto usan el SLUG, no el id
          const projectHref = `/projects/${project.slug}`;
          const isActiveProject =
            activePath === projectHref ||
            activePath.startsWith(`${projectHref}?`) ||
            activePath.startsWith(`${projectHref}/`);

          if (plegada) {
            return (
              <a
                key={project.id}
                href={projectHref}
                title={project.name}
                aria-current={isActiveProject ? 'page' : undefined}
                className={`flex justify-center py-2 rounded-lg transition-colors hover:bg-white/[0.06] ${isActiveProject ? 'bg-white/10' : ''}`}
              >
                <ProjectMonogram
                  id={project.id}
                  name={project.name}
                  iconKey={project.iconKey}
                  color={project.color}
                />
              </a>
            );
          }

          return (
            <div key={project.id} className="flex flex-col">
              <div
                className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.06] ${isActiveProject ? 'bg-white/10' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Colapsar ${project.name}` : `Expandir ${project.name}`}
                  className="flex shrink-0 items-center justify-center w-4 h-4 rounded text-white hover:text-white transition-colors"
                >
                  <ChevronIcon open={isOpen} />
                </button>

                <span className="shrink-0 scale-[0.72] origin-center -mx-0.5">
                  <ProjectMonogram
                    id={project.id}
                    name={project.name}
                    iconKey={project.iconKey}
                    color={project.color}
                  />
                </span>

                <a
                  href={projectHref}
                  className={`flex-1 min-w-0 truncate text-[13px] transition-colors ${
                    isActiveProject
                      ? 'text-white font-semibold'
                      : 'text-white font-medium opacity-75 hover:opacity-100'
                  }`}
                >
                  {project.name}
                </a>
              </div>

              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,0.85,0.28,1)]"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div
                  className="min-h-0 overflow-hidden"
                  style={{ opacity: isOpen ? 1 : 0, transition: 'opacity 200ms' }}
                >
                  <div className="flex flex-col gap-0.5 pl-6 pb-1 pt-0.5">
                    {project.workspaces.length === 0 ? (
                      <span className="px-2 py-1 text-[12px] text-white italic select-none">
                        Sin espacios
                      </span>
                    ) : (
                      project.workspaces.map((ws) => {
                        // URL correcta: /projects/{slug}?tab=espacios&ws={wsId}
                        const wsHref = `/projects/${project.slug}?tab=espacios&ws=${ws.id}`;
                        const isActiveWs = activePath.includes(`ws=${ws.id}`);
                        return (
                          <a
                            key={ws.id}
                            href={wsHref}
                            aria-current={isActiveWs ? 'page' : undefined}
                            className={`flex items-center gap-2 rounded-md px-2 py-[5px] text-[12px] transition-colors ${
                              isActiveWs
                                ? 'bg-white/10 text-white font-medium'
                                : 'text-white hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            <WorkspaceLeafIcon />
                            <span className="truncate">{ws.name}</span>
                          </a>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarChatList({
  zonePath,
  plegada,
  organizacionActivaId,
}: {
  zonePath: string;
  plegada: boolean;
  organizacionActivaId: string | null;
}) {
  const pathname = usePathname();
  const browserPath = zonePath + (pathname === '/' ? '' : pathname);
  const [directs, setDirects] = useState<any[]>([]);
  const [projectsCrudos, setProjectsCrudos] = useState<any[]>([]);
  /**
   * Los chats de proyecto **de la organización activa**. Un chat de proyecto es
   * 1:1 con un proyecto, y un proyecto pertenece a una sola organización, así que
   * el directorio se recorta igual que el árbol del sidebar y la lista de
   * proyectos. Los privados **no** se filtran: un DM no es de ninguna
   * organización (ver la conversación de diseño).
   */
  const projects = organizacionActivaId
    ? projectsCrudos.filter((c: any) => c?.project?.organizationId === organizacionActivaId)
    : projectsCrudos;
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');

  const fetchChats = useCallback(() => {
    const fetchDirects = async () => {
      try {
        const res = await fetch(`${zonePath}/api/gateway/me/chats`);
        return await res.json();
      } catch {
        return { data: [] };
      }
    };

    const fetchProjects = async () => {
      try {
        const res = await fetch(`${zonePath}/api/gateway/me/chats/projects`);
        return await res.json();
      } catch {
        return { data: [] };
      }
    };

    const run = async () => {
      const d = await fetchDirects();
      const p = await fetchProjects();
      const listD = Array.isArray(d?.data) ? d.data : [];
      const listP = Array.isArray(p?.data) ? p.data : [];
      setDirects(listD);
      setProjectsCrudos(listP);

      const ids = new Set<string>();
      listD.forEach((c: any) => c.peerId && ids.add(c.peerId));
      listP.forEach((c: any) => c.ultimo?.authorId && ids.add(c.ultimo.authorId));

      if (ids.size > 0) {
        fetch(`${zonePath}/api/gateway/users?ids=${Array.from(ids).join(',')}`)
          .then((r) => r.json())
          .then((ubody) => {
            const uMap: Record<string, any> = {};
            (ubody?.data?.items || ubody?.data || []).forEach((u: any) => (uMap[u.id] = u));
            setUsersMap(uMap);
          })
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    };
    run();
  }, [zonePath]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useLiveEvent('chat.mensaje', () => fetchChats());
  useLiveEvent('chat.leido', () => fetchChats());
  useReconnection(fetchChats);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  function resumenDe(mensaje: { body: string; deletedAt?: string | null }): string {
    if (mensaje.deletedAt) return 'Mensaje eliminado';
    return (
      mensaje.body.replace(/<[^>]*>?/gm, '').substring(0, 50) +
      (mensaje.body.length > 50 ? '...' : '')
    );
  }

  function cuandoCorto(iso: string) {
    const d = new Date(iso);
    const ahora = new Date();
    if (
      d.getDate() === ahora.getDate() &&
      d.getMonth() === ahora.getMonth() &&
      d.getFullYear() === ahora.getFullYear()
    ) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  }

  const PersonRow = ({ c, peer }: any) => {
    const presencia = usePresence(c.peerId, peer?.presence);
    const nombre = peer ? personLabel(peer) : 'Alguien';
    const link = `/chat/${c.peerId}`;
    const activo = browserPath === link;

    // filter by search
    if (search && !nombre.toLowerCase().includes(search.toLowerCase())) return null;

    return (
      <a
        key={c.peerId || c.channelId}
        href={link}
        aria-current={activo ? 'page' : undefined}
        className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/10 ${plegada ? 'justify-center px-0' : ''} ${activo ? 'bg-white/10' : ''}`}
      >
        <div className="shrink-0">
          <Avatar
            label={nombre}
            size="sm"
            src={avatarHref(peer?.avatarUrl, `${zonePath}/api/gateway`)}
            presence={presencia}
          />
        </div>
        {!plegada && (
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className={`truncate font-sans text-[13px] font-medium ${activo ? 'text-white' : 'text-white'}`}
              >
                {nombre}
              </span>
              {c.ultimo && (
                <span className="ml-auto shrink-0 font-sans text-[10px] text-white">
                  {cuandoCorto(c.ultimo.createdAt)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span
                className={`truncate font-sans text-[11px] ${!c.ultimo && !activo ? 'text-white' : 'text-white'}`}
              >
                {c.ultimo ? resumenDe(c.ultimo) : 'Iniciar conversación'}
              </span>
              {c.unread > 0 && (
                <span className="min-w-[18px] rounded-full bg-primary px-1.5 py-0.5 text-center font-sans text-[9px] font-semibold text-primary-foreground shrink-0">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </div>
          </div>
        )}
      </a>
    );
  };

  const ProjectRow = ({ c, autor }: any) => {
    const link = `/chat/proyecto/${c.project.id}`;
    const activo = browserPath === link;

    // filter by search
    if (search && !c.project.name.toLowerCase().includes(search.toLowerCase())) return null;

    return (
      <a
        key={c.project.id}
        href={link}
        aria-current={activo ? 'page' : undefined}
        className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/10 ${plegada ? 'justify-center px-0' : ''} ${activo ? 'bg-white/10' : ''}`}
      >
        <div className="shrink-0 flex items-center justify-center scale-90 origin-center">
          <ProjectMonogram
            id={c.project.id}
            name={c.project.name}
            iconKey={c.project.iconKey}
            color={c.project.color}
          />
        </div>
        {!plegada && (
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className={`truncate font-sans text-[13px] font-medium ${activo ? 'text-white' : 'text-white'}`}
              >
                {c.project.name}
              </span>
              {c.ultimo && (
                <span className="ml-auto shrink-0 font-sans text-[10px] text-white">
                  {cuandoCorto(c.ultimo.createdAt)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span
                className={`truncate font-sans text-[11px] ${!c.ultimo && !activo ? 'text-white' : 'text-white'}`}
              >
                {c.ultimo
                  ? `${autor ? personLabel(autor) : 'Alguien'}: ${resumenDe(c.ultimo)}`
                  : 'Sin mensajes'}
              </span>
              {c.unread > 0 && (
                <span className="min-w-[18px] rounded-full bg-primary px-1.5 py-0.5 text-center font-sans text-[9px] font-semibold text-primary-foreground shrink-0">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </div>
          </div>
        )}
      </a>
    );
  };

  return (
    <div className="flex flex-col gap-4 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-none pb-4 px-1">
      {/* Search input */}
      <div className="px-2">
        <input
          type="text"
          placeholder="Buscar chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md bg-white/5 px-2 py-1 text-sm text-white placeholder-white/60 focus:outline-none"
        />
      </div>
      {projects.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {!plegada && (
            <span className="mx-1 px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
              Proyectos
            </span>
          )}
          {projects.map((c: any) => (
            <ProjectRow
              key={c.project.id}
              c={c}
              autor={c.ultimo?.authorId ? usersMap[c.ultimo.authorId] : null}
            />
          ))}
        </div>
      )}

      {directs.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {!plegada && (
            <span className="mx-1 px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
              Privados
            </span>
          )}
          {directs.map((c: any) => (
            <PersonRow key={c.peerId} c={c} peer={usersMap[c.peerId]} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarInboxList({ zonePath, plegada }: { zonePath: string; plegada: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unreadParam = mostrarTodos ? '' : '&unread=true';
    fetch(`${zonePath}/api/gateway/me/notifications?limit=30${unreadParam}`)
      .then((res) => res.json())
      .then((body) => {
        const list = body?.data?.items || [];
        setItems(list);

        const ids = [...new Set(list.map((i: any) => i.actorId).filter((id: any) => !!id))];
        if (ids.length > 0) {
          fetch(`${zonePath}/api/gateway/users?ids=${ids.join(',')}`)
            .then((r) => r.json())
            .then((ubody) => {
              const uMap: Record<string, any> = {};
              (ubody?.data?.items || ubody?.data || []).forEach((u: any) => (uMap[u.id] = u));
              setUsersMap(uMap);
            })
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [zonePath, mostrarTodos]);

  const loader = (
    <div className="flex flex-col gap-2 px-1 py-2">
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
    </div>
  );

  function getTitle(n: any) {
    const who = n.actorId ? usersMap[n.actorId]?.name?.split(' ')[0] || 'Alguien' : 'El sistema';
    const project = n.projectName ?? 'un proyecto';
    const task = n.taskTitle ?? 'una tarea';

    switch (n.type) {
      case 'INVITATION_RECEIVED':
        return `${who} te invitó a ${project}`;
      case 'INVITATION_ACCEPTED':
        return `${who} aceptó tu invitación a ${project}`;
      case 'INVITATION_REJECTED':
        return `${who} rechazó tu invitación a ${project}`;
      case 'MEMBER_LEFT':
        return `${who} salió de ${project}`;
      case 'MEMBER_REMOVED':
        return `${who} te sacó de ${project}`;
      case 'TASK_ASSIGNED':
        return `${who} te asignó ${task} en ${project}`;
      case 'TASK_UNASSIGNED':
        return `${who} te quitó de ${task} en ${project}`;
      case 'AUTOMATION_TASK_DUE_SOON':
        return `${task} vencerá pronto en ${project}`;
      case 'AUTOMATION_TASK_STALE':
        return `${task} lleva días sin movimiento en ${project}`;
      case 'AUTOMATION_TASK_OVERDUE':
        return `${task} ha vencido en ${project}`;
      case 'AUTOMATION_TASK_UNASSIGNED':
        return `${task} sigue sin encargado en ${project}`;
      case 'AUTOMATION_TASK_CREATED':
        return `Se creó ${task} en ${project}`;
      case 'AUTOMATION_TASK_MOVED':
        return `${task} cambió de columna en ${project}`;
      case 'AUTOMATION_TASK_COMPLETED':
        return `${task} se terminó en ${project}`;
      case 'AUTOMATION_TASK_REOPENED':
        return `${task} se reabrió en ${project}`;
      case 'AUTOMATION_TASK_ASSIGNEES_CHANGED':
        return `Cambiaron los encargados de ${task}`;
      case 'AUTOMATION_TASK_DUE_DATE_CHANGED':
        return `Cambió el vencimiento de ${task}`;
      default:
        return 'Nueva notificación';
    }
  }

  function getHref(n: any) {
    if (!n.projectId || n.type === 'MEMBER_REMOVED') return '/projects';
    if (n.taskId) return `/projects/${n.projectId}?task=${n.taskId}`;
    return `/projects/${n.projectId}`;
  }

  return (
    <div className="flex flex-col max-h-[calc(100vh-200px)]">
      {!plegada && (
        <div className="flex bg-white/5 rounded-lg p-0.5 mx-3 mb-3 shrink-0">
          <button
            onClick={() => setMostrarTodos(false)}
            className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors ${!mostrarTodos ? 'bg-white/15 text-white shadow-sm' : 'text-white hover:text-white hover:bg-white/5'}`}
          >
            Sin leer
          </button>
          <button
            onClick={() => setMostrarTodos(true)}
            className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors ${mostrarTodos ? 'bg-white/15 text-white shadow-sm' : 'text-white hover:text-white hover:bg-white/5'}`}
          >
            Todos
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1 overflow-y-auto scrollbar-none px-1 pb-4 flex-1 min-h-0">
        {loading ? (
          loader
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center text-white text-[13px] font-sans">
            Nada nuevo por aquí.
          </div>
        ) : (
          items.map((n: any) => {
            const actor = n.actorId ? usersMap[n.actorId] : null;
            return (
              <a
                key={n.id}
                href={getHref(n)}
                className={`relative flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/5 ${
                  !n.readAt ? 'bg-white/[0.04]' : ''
                }`}
              >
                {!plegada && (
                  <div className="w-8 h-8 shrink-0 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                    {actor?.avatarUrl ? (
                      <img
                        src={`${zonePath}/api/gateway${actor.avatarUrl}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-[11px] font-bold">
                        {(actor?.name || 'S').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                <div className={`flex flex-col min-w-0 flex-1 ${plegada ? 'hidden' : ''}`}>
                  <p
                    className={`font-sans text-[12px] leading-snug line-clamp-2 ${!n.readAt ? 'text-white font-medium' : 'text-white'}`}
                  >
                    {getTitle(n)}
                  </p>
                  <span className="font-sans text-[10px] text-white mt-1">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {!n.readAt && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 shrink-0" />
                )}
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
