'use client';

import { ThemeSwitchPublico } from '@/components/molecules/ThemeSwitchPublico';
import { alpha, colors } from '@praxis/commons';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface PublicNavbarProps {
  /**
   * El tema con el que se sirvió la página, para que el switch nazca en la
   * posición correcta.
   *
   * Lo resuelve el layout desde la cookie. Sin él, el control saldría siempre en
   * «oscuro» y daría un salto al hidratar en cuanto alguien tuviera el claro
   * elegido — el mismo parpadeo que la cookie existe para evitar.
   */
  initialTheme?: 'dark' | 'light';
  /** Lo resuelve el server component con getSession(). */
  isAuthenticated?: boolean;
}

const NAV_LINKS = [
  { href: '#features', label: 'Características' },
  { href: '#how-it-works', label: 'Cómo funciona' },
];

export function PublicNavbar({
  isAuthenticated = false,
  initialTheme = 'dark',
}: PublicNavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className="transition-all duration-300"
        style={
          scrolled
            ? {
                margin: '8px 16px 0',
                borderRadius: 18,
                border: `1px solid ${alpha(colors.textPrimary, 8)}`,
                background: alpha(colors.surface, 88),
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                boxShadow: `0 8px 32px ${alpha(colors.overlay, 40)}`,
              }
            : {
                background: colors.surface,
                borderBottom: `1px solid ${alpha(colors.textPrimary, 6)}`,
              }
        }
      >
        <nav
          className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6"
          aria-label="Navegación principal"
        >
          <Link href="/" className="select-none">
            <span
              className="font-serif text-2xl font-black tracking-tight"
              style={{
                color: 'var(--color-primary)',
                textShadow: `0 0 24px ${alpha(colors.primary, 60)}`,
                letterSpacing: '-0.02em',
              }}
            >
              PRAXIS
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Antes que las acciones de sesión: es una preferencia de la
                pantalla, no un paso del recorrido, y ponerlo junto a «Comenzar»
                lo hacía competir con la llamada a la acción. */}
            <ThemeSwitchPublico initialTheme={initialTheme} />

            {isAuthenticated ? (
              /**
               * Enlace normal, no next/link: el dashboard lo servirá otra zona
               * del multi-zone y el router del shell no conoce esa ruta.
               */
              <a
                href="/dashboard"
                className="rounded-full px-5 py-2 font-sans text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
                style={{
                  background: 'var(--color-primary)',
                  boxShadow: `0 4px 20px ${alpha(colors.primary, 35)}`,
                }}
              >
                Ir al panel
              </a>
            ) : (
              <>
                <a
                  href="/auth/login"
                  className="hidden font-sans text-sm text-text-secondary transition-colors hover:text-text-primary sm:block"
                >
                  Iniciar sesión
                </a>
                <a
                  href="/auth/signup"
                  className="rounded-full px-5 py-2 font-sans text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
                  style={{
                    background: 'var(--color-primary)',
                    boxShadow: `0 4px 20px ${alpha(colors.primary, 30)}`,
                  }}
                >
                  Comenzar
                </a>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
