'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface PublicNavbarProps {
  /** Lo resuelve el server component con getSession(). */
  isAuthenticated?: boolean;
}

const NAV_LINKS = [
  { href: '#features', label: 'Características' },
  { href: '#how-it-works', label: 'Cómo funciona' },
];

export function PublicNavbar({ isAuthenticated = false }: PublicNavbarProps) {
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
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(14,15,24,0.88)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }
            : {
                background: '#0E0F18',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
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
                textShadow: '0 0 24px rgba(108,99,255,0.6)',
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
                  boxShadow: '0 4px 20px rgba(108,99,255,0.35)',
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
                    boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
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
