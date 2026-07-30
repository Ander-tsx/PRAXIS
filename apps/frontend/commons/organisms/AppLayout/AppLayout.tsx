'use client';

import { type ReactNode, useState } from 'react';
import { alpha, colors } from '../../tokens';
import type { AppNavItem } from './navigation';

/**
 * AppLayout — armazón del área privada: barra lateral, cabecera y contenido.
 *
 * Es un organismo **tonto**: no busca datos ni decide si hay sesión. Recibe
 * todo por props y los huecos variables por slots, siguiendo el patrón de
 * `AuthForm`. Quien protege la ruta es `proxy.ts`; quien trae los datos es la
 * page.
 *
 * Es cliente solo por el cajón lateral del móvil.
 *
 * ⚠️ El resaltado del ítem activo llega en `activePath`, **no** sale de
 * `usePathname()`. Cada zona tiene su propio `basePath`, así que dentro de
 * projects-front `usePathname()` devolvería `/projects/algo` mientras que en el
 * shell la misma pantalla es `/projects/algo` sin prefijo: los enlaces de la
 * barra lateral son rutas del shell y no casarían. La zona sabe cuál es su
 * ruta pública; este componente no.
 */

export interface AppLayoutUser {
  /** Nombre para mostrar. Puede venir vacío: el registro no pide nombre. */
  name: string;
  email: string;
}

export interface AppLayoutProps {
  navItems: AppNavItem[];
  /** Ruta pública actual, tal como la ve el navegador (sin basePath de zona). */
  activePath: string;
  /** Título de la pantalla, en la cabecera. */
  title: string;
  user: AppLayoutUser;
  /** Zona derecha de la cabecera. Normalmente el rol global como Badge. */
  headerSlot?: ReactNode;
  /** Pie de la barra lateral, bajo los datos del usuario. Normalmente cerrar sesión. */
  footerSlot?: ReactNode;
  children: ReactNode;
}

function isActive(activePath: string, href: string): boolean {
  return activePath === href || activePath.startsWith(`${href}/`);
}

/** Inicial del avatar: del nombre si lo hay, si no del email. */
function initialOf({ name, email }: AppLayoutUser): string {
  const source = name.trim() || email.trim();
  return source ? source[0].toUpperCase() : '?';
}

function NavList({
  navItems,
  activePath,
  onNavigate,
}: {
  navItems: AppNavItem[];
  activePath: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1.5" aria-label="Secciones">
      {navItems.map((item) => {
        const active = !item.disabled && isActive(activePath, item.href);

        if (item.disabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Disponible próximamente"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 font-sans text-sm font-medium text-text-disabled"
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              <span className="font-sans text-[10px] uppercase tracking-wider text-text-disabled">
                Pronto
              </span>
            </span>
          );
        }

        return (
          /**
           * `<a>` y no `next/link`: estos destinos los sirven otras zonas del
           * multi-zone, y el router prefijaría la ruta con el basePath de la
           * zona actual. Ver ESTADO-ACTUAL §16.
           */
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-3 rounded-lg px-4 py-3 font-sans text-sm transition-all duration-150',
              active
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
            ].join(' ')}
            style={active ? { boxShadow: `0 8px 24px ${alpha(colors.primary, 20)}` } : undefined}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {/* Sin no leídos no hay insignia: un cero no informa de nada. */}
            {item.badge !== undefined && item.badge > 0 && (
              <span
                aria-label={`${item.badge} sin leer`}
                className="min-w-5 rounded-full px-1.5 py-0.5 text-center font-sans text-[11px] font-semibold tabular-nums"
                style={
                  active
                    ? { background: alpha(colors.overlay, 30), color: colors.primaryForeground }
                    : { background: colors.primary, color: colors.primaryForeground }
                }
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

function UserCard({ user }: { user: AppLayoutUser }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-sans font-bold text-primary"
        style={{
          background: alpha(colors.primary, 18),
          border: `1px solid ${alpha(colors.primary, 45)}`,
        }}
      >
        {initialOf(user)}
      </div>
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

export function AppLayout({
  navItems,
  activePath,
  title,
  user,
  headerSlot,
  footerSlot,
  children,
}: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              className="rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <h1 className="truncate font-display text-lg text-text-primary">{title}</h1>
          </div>

          {headerSlot && <div className="flex shrink-0 items-center gap-3">{headerSlot}</div>}
        </header>

        <main className="relative flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">{children}</div>
        </main>
      </div>

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
                  className="rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
  );
}
