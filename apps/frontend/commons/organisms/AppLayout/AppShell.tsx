'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, createContext, useContext, useState } from 'react';
import { Avatar } from '../../atoms/Avatar';
import { alpha, colors } from '../../tokens';
import type { AppNavItem } from './navigation';
import { NavList } from './NavList';

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

export function AppShell({ navItems, zonePath, user, footerSlot, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  /* `/` es la raíz de la zona: su ruta pública es el prefijo a secas. */
  const activePath = pathname === '/' ? zonePath : `${zonePath}${pathname}`;

  return (
    <AppShellContext.Provider value={{ openMenu: () => setMobileMenuOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-background font-sans text-text-primary">
        {/* ── Barra lateral (escritorio) ───────────────────────── */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <div className="flex h-16 items-center border-b border-border px-6">
            <Wordmark />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6">
            <NavList navItems={navItems} activePath={activePath} />
          </div>

          <div className="border-t border-border p-4">
            <UserCard user={user} />
            {footerSlot}
          </div>
        </aside>

        {/* ── Contenido ────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>

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
