'use client';

import { RollCta } from '@/components/molecules/RollCta';
import { l } from '@/lib/landingColors';
import { KylooWordmark } from '@praxis/commons';
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
        /* Las mismas medidas que la rejilla del hero (`max-w-[96rem]` y el
           mismo escalón de padding): la barra flota encima, así que si no
           comparten canalón el wordmark no cae a plomo sobre el titular y se
           lee como un descuadre. */
        className="mx-auto flex h-[4.5rem] max-w-[96rem] items-center justify-between px-6 sm:px-8 lg:px-10 xl:px-16"
        aria-label="Navegación principal"
      >
        {/**
         * El bloque de marca completo — «Praxis by Kyloo», el mismo que monta
         * `AppShell` en la esquina de la barra lateral (`Wordmark` + `ByKyloo`).
         *
         * ⚠️ **La landing tenía solo «Praxis», y era la única pantalla que lo
         * decía a medias.** Quien entra ve el lockup entero en cada pantalla
         * privada; la puerta de casa no puede firmar distinto que el salón.
         *
         * ⚠️ **Pero «Praxis» va en Fraunces, no en Archivo.** Dentro de la
         * aplicación el logotipo es grotesca (`--font-grotesk`) porque compite
         * con una interfaz densa; aquí compite con el titular del hero, que es
         * Fraunces, y una grotesca al lado de esa serif variable se lee como
         * dos marcas en la misma pantalla. La familia la decide el vecino.
         *
         * 🔴 **Son DOS enlaces hermanos, no uno dentro de otro.** «Praxis»
         * lleva a la raíz y el lettermark a kyloo.com.mx, y un `<a>` anidado
         * dentro de otro es HTML inválido: el navegador cierra el primero al
         * abrir el segundo, así que el árbol que queda no es el que se
         * escribió y **cuál de los dos destinos gana depende del navegador**.
         * No da ningún error — solo un logotipo que a veces lleva donde no
         * debe. Por eso el contenedor es un `<div>` y cada marca pone su
         * propio enlace.
         */}
        <div className="flex select-none items-baseline gap-2">
          {/**
           * ⚠️ **El wordmark va en el acento y NO cambia con la zona.**
           *
           * Es lo único de esta barra que se queda quieto al cruzar de sección
           * —el resto invierte con `c`—, y es a propósito: dentro de la
           * aplicación este mismo «Praxis» es morado sobre la barra lateral
           * (`AppShell`, `Wordmark()`). Con `c.fg` la marca era beige aquí y
           * morada allí, o sea dos marcas.
           *
           * El morado tiene contraste suficiente contra las dos zonas —es el
           * par `#6c63ff`/`#5b52e0` que ya resuelve `--l-accent` por sección—,
           * así que quedarse fijo no cuesta legibilidad.
           */}
          <Link
            href="/"
            className="text-2xl leading-none tracking-tight no-underline"
            style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 600, color: l.accent }}
          >
            Praxis
          </Link>
          {/**
           * «by» + el lettermark real de Kyloo, a escala de barra. A
           * diferencia del de `AppShell`, aquí SÍ invierte con la zona: la
           * barra flota sobre tramos oscuros y claros, y un lettermark en
           * `currentColor` fijo desaparecería sobre uno de los dos.
           *
           * **El lettermark lleva a kyloo.com.mx, y solo él**: «by» se queda
           * fuera del enlace porque es la preposición de la frase, no parte de
           * la marca. Misma regla que `ByKyloo` en `AppShell`.
           *
           * ⚠️ `noopener` no es opcional: sin él la página que se abre recibe
           * un `window.opener` con el que puede redirigir la nuestra.
           *
           * Es un `<a>` y no un `Link` de Next a propósito: sale de la
           * aplicación, así que no hay nada que prefetchear.
           *
           * El `translate-y` compensa que el SVG trae su propio interlineado
           * dentro del `viewBox`: alineado por línea base a secas, la palabra
           * «Kyloo» flota por encima del «by».
           */}
          <span
            className="flex items-baseline gap-1.5 transition-colors duration-300"
            style={{ color: c.fgMuted }}
          >
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.18em]">by</span>
            <a
              href="https://kyloo.com.mx"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kyloo — abre kyloo.com.mx en una pestaña nueva"
              title="kyloo.com.mx"
              className="inline-flex rounded-sm transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2"
              style={{ outlineColor: l.accent }}
            >
              <KylooWordmark className="h-[0.8125rem] w-auto translate-y-[2px]" />
            </a>
          </span>
        </div>

        <div className="hidden items-center gap-9 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              /* ⚠️ **Más cuerpo y más peso que el texto corriente, a
                 propósito.** A `text-sm` en peso normal la navegación se leía
                 como una nota al pie sobre un titular de 68 px: existía, pero
                 no invitaba a pulsarla. El salto a `text-[0.9375rem]` con
                 `font-medium` es el mínimo que la devuelve al primer plano
                 sin que compita con el botón. */
              className="font-sans text-[0.9375rem] font-medium transition-colors duration-300"
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
                className="hidden font-sans text-[0.9375rem] font-medium transition-colors duration-300 sm:block"
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
