'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex flex-col">
      {/* ── MAIN NAV BAR ─────────────────────────────────────── */}
      <div
        className="transition-all duration-300"
        style={
          scrolled
            ? {
                margin: '8px 16px 0',
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(14,15,24,0.88)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(18px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }
            : {
                background: '#0E0F18',
                border: '1px solid rgba(255,255,255,0.06)',
              }
        }
      >
        <nav
          className="h-14 flex items-center justify-between"
          style={{ padding: '0 24px' }}
          aria-label="Navegación principal"
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-0 select-none">
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

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a href="/auth/login">
              <span
                className="font-sans text-sm cursor-pointer transition-colors"
                style={{ color: 'rgba(154,160,180,0.8)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLSpanElement).style.color = '#E8EAF0';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLSpanElement).style.color = 'rgba(154,160,180,0.8)';
                }}
              >
                Iniciar sesión
              </span>
            </a>
            <a href="/auth/signup">
              <button
                type="button"
                className="font-sans text-sm font-semibold cursor-pointer transition-all duration-150"
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 9999,
                  boxShadow: '0 0 0 0 rgba(108,99,255,0)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--color-primary-hover)';
                  el.style.boxShadow = '0 0 20px rgba(108,99,255,0.45)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--color-primary)';
                  el.style.boxShadow = '0 0 0 0 rgba(108,99,255,0)';
                }}
              >
                Comenzar
              </button>
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
