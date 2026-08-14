'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, createContext, useContext, useState } from 'react';
import { Avatar } from '../../atoms/Avatar';
import { alpha, colors } from '../../tokens';
import { AvisosEnVivo } from '../AvisosEnVivo';
import { NavList } from './NavList';
import type { AppNavItem } from './navigation';

export interface AppShellUser {
  /** Nombre para mostrar. Puede venir vacío: el registro no pide nombre. */
  name: string;
  email: string;
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
  /** Pie de la barra lateral. Normalmente cerrar sesión. */
  footerSlot?: ReactNode;
  /**
   * Si la barra sale plegada, **resuelto en el servidor**.
   *
   * Lo lee el `layout.tsx` de la zona con `getSidebarPlegada()`. Va por props y
   * no se lee aquí porque este componente es de cliente y la cookie hay que
   * conocerla **antes** de pintar: si se leyera al hidratar, la barra saldría
   * desplegada y se plegaría a la vista en cada navegación.
   */
  plegadaInicial?: boolean;
  children: ReactNode;
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
const AppShellContext = createContext<{ openMenu: () => void } | null>(null);

/** Lo usa `AppHeader` para su botón de menú en móvil. */
export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell solo funciona dentro de <AppShell>');
  }
  return context;
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

export function AppShell({
  navItems,
  zonePath,
  user,
  footerSlot,
  plegadaInicial = false,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const pathname = usePathname();

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

  return (
    <AppShellContext.Provider value={{ openMenu: () => setMobileMenuOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-background font-sans text-text-primary">
        {/* ── Barra lateral (escritorio) ───────────────────────── */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex ${
            plegada ? 'w-[4.5rem]' : 'w-64'
          }`}
        >
          {/* El pliegue vive **en la cabecera, al lado de la marca**: es donde
              se busca por costumbre, y ahí no compite con «Cerrar sesión», que
              era el vecino que tenía abajo y con el que se podía confundir. */}
          <div
            className={`flex h-16 items-center border-b border-border ${
              plegada ? 'flex-col justify-center gap-1 px-0' : 'justify-between px-6'
            }`}
          >
            {plegada ? <Isotipo /> : <Wordmark />}
            <BotonDePliegue plegada={plegada} onClick={alternarPliegue} />
          </div>

          <div className={`flex-1 overflow-y-auto py-6 ${plegada ? 'px-2' : 'px-4'}`}>
            <NavList navItems={navItems} activePath={activePath} plegada={plegada} />
          </div>

          <div className={`border-t border-border ${plegada ? 'p-2' : 'p-4'}`}>
            {/* Plegada, la tarjeta de usuario se queda en el avatar: el nombre y
                el correo no caben, y el avatar ya identifica de quién es la
                sesión, que es lo que esa tarjeta viene a decir. */}
            {plegada ? (
              <div className="mb-2 flex justify-center" title={user.name.trim() || user.email}>
                <Avatar label={user.name.trim() || user.email} mine size="md" />
              </div>
            ) : (
              <UserCard user={user} />
            )}
            {footerSlot}
          </div>
        </aside>

        {/* ── Contenido ────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>

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
        <AvisosEnVivo gatewayPath={`${zonePath}/api/gateway`} />

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

            <div className="fixed inset-y-0 left-0 z-10 flex w-64 flex-col justify-between border-r border-border bg-surface p-4">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <Wordmark />
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Cerrar menú"
                    className="rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary"
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

                <NavList
                  navItems={navItems}
                  activePath={activePath}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </div>

              <div className="border-t border-border pt-4">
                <UserCard user={user} />
                {footerSlot}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShellContext.Provider>
  );
}

function UserCard({ user }: { user: AppShellUser }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      {/* El mismo círculo que las tarjetas del tablero, y con `mine` puesto: en
          la barra lateral la persona siempre eres tú, así que sale en rojo. Que
          coincida importa — es lo que enseña que el rojo significa «tuyo». */}
      <Avatar label={user.name.trim() || user.email} mine size="md" />
      <div className="min-w-0 flex-1">
        {user.name.trim() && (
          <p className="truncate font-sans text-sm font-semibold text-text-primary">{user.name}</p>
        )}
        <p className="truncate font-sans text-xs text-text-secondary">{user.email}</p>
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="select-none font-serif text-xl font-black tracking-tight text-primary">
      PRAXIS
    </span>
  );
}

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
      className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-disabled transition-colors hover:bg-surface-elevated hover:text-text-primary"
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

/**
 * La marca cuando no cabe entera.
 *
 * Una `P` y no un logotipo nuevo: es la misma tipografía, el mismo color y la
 * primera letra de lo que pone desplegada, así que se lee como la misma marca
 * encogida y no como otra cosa. `aria-label` con el nombre completo, que es lo
 * que de verdad representa.
 */
function Isotipo() {
  return (
    <span
      aria-label="PRAXIS"
      className="select-none font-serif text-xl font-black tracking-tight text-primary"
    >
      P
    </span>
  );
}
