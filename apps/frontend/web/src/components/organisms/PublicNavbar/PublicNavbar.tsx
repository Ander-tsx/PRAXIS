'use client';

import { RollCta } from '@/components/molecules/RollCta';
import { l } from '@/lib/landingColors';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface PublicNavbarProps {
  /** Lo resuelve el server component con getSession(). */
  isAuthenticated?: boolean;
}

const NAV_LINKS = [
  { href: '#features', label: 'Características' },
  { href: '#automatizacion', label: 'Automatización' },
  { href: '#asistente', label: 'Asistente' },
  { href: '#how-it-works', label: 'Cómo funciona' },
];

/**
 * Los dos juegos de color de la barra, a pelo y no por `var(--l-*)`: la barra
 * es `fixed` y flota sobre las dos zonas a la vez, así que no puede heredar de
 * la que tiene debajo — lo decide midiendo, en `useOverLightSection`.
 *
 * ⚠️ **Ya no llevan `primary`/`primaryFg`.** El botón cae en el acento de
 * marca, que es el mismo en las dos zonas, así que invertirlo aquí era
 * exactamente lo que hacía que el CTA principal cambiara de aspecto tres veces
 * bajando por la página.
 */
const DARK = { fg: '#e8e8e3', fgMuted: '#938f8a' };
const LIGHT = { fg: '#080807', fgMuted: '#6b645c' };

/**
 * Sin fondo propio: la barra flota sobre la landing, y la landing alterna
 * zonas oscuras y claras (`.landing-light`, ver globals.css). Cada sección
 * clara lleva además `data-theme-section="light"` — un marcador aparte de la
 * clase, solo para esto — y aquí se mide si alguna se solapa con la banda de
 * la barra para decidir el color del texto. La misma técnica que usa Kyloo en
 * su propio navbar (Navbar.tsx, `useOverLightSection`).
 */
function useOverLightSection() {
  const [overLight, setOverLight] = useState(false);

  useEffect(() => {
    let ticking = false;

    const measure = () => {
      ticking = false;
      const bar = document.querySelector('header[data-theme-nav]');
      if (!bar) return;
      const band = bar.getBoundingClientRect();
      const light = document.querySelectorAll('[data-theme-section="light"]');
      let overlapping = false;
      for (const section of light) {
        const rect = section.getBoundingClientRect();
        if (rect.top < band.bottom && rect.bottom > band.top) {
          overlapping = true;
          break;
        }
      }
      setOverLight(overlapping);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return overLight;
}

export function PublicNavbar({ isAuthenticated = false }: PublicNavbarProps) {
  const overLight = useOverLightSection();
  const c = overLight ? LIGHT : DARK;

  return (
    <header
      data-theme-nav=""
      className="fixed inset-x-0 top-0 z-50 bg-transparent transition-colors duration-300"
    >
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6"
        aria-label="Navegación principal"
      >
        <Link href="/" className="select-none">
          {/**
           * ⚠️ **El wordmark va en el acento y NO cambia con la zona.**
           *
           * Es lo único de esta barra que se queda quieto al cruzar de sección
           * —el resto invierte con `c`—, y es a propósito: dentro de la
           * aplicación este mismo «Praxis» es morado sobre la barra lateral
           * (`AppShell`, `Wordmark()`), con la misma familia y el mismo peso.
           * Con `c.fg` la marca era beige aquí y morada allí, o sea dos marcas.
           *
           * El morado tiene contraste suficiente contra las dos zonas —es el
           * par `#6c63ff`/`#5b52e0` que ya resuelve `--l-accent` por sección—,
           * así que quedarse fijo no cuesta legibilidad.
           */}
          <span
            className="text-xl tracking-tight"
            style={{ fontFamily: 'var(--font-grotesk)', fontWeight: 700, color: l.accent }}
          >
            Praxis
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-sans text-sm transition-colors duration-300"
              style={{ color: c.fgMuted }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = c.fg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = c.fgMuted;
              }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-5">
          {isAuthenticated ? (
            /* Sin `bgColor`: cae en el acento, igual que el del hero y el del
               cierre. Ver la nota del wordmark — el botón principal tampoco
               invierte al cruzar de zona, y por eso ya no necesita `c`. */
            <RollCta href="/projects" label="Ir al panel" />
          ) : (
            <>
              <a
                href="/auth/login"
                className="hidden font-sans text-sm transition-colors duration-300 sm:block"
                style={{ color: c.fgMuted }}
              >
                Iniciar sesión
              </a>
              <RollCta href="/auth/signup" label="Comenzar" />
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
