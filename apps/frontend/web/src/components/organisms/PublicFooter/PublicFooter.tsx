'use client';

import { KylooWordmark, ShaderCanvas } from '@praxis/commons';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';

const NAV_ITEMS = [
  { label: 'Características', href: '#features' },
  { label: 'Automatización', href: '#automatizacion' },
  { label: 'Asistente', href: '#asistente' },
  { label: 'Cómo funciona', href: '#how-it-works' },
] as const;

const LEGAL_ITEMS = [
  { label: 'Privacidad', href: '/privacidad' },
  { label: 'Términos de uso', href: '/terminos' },
] as const;

/**
 * El año es un dato externo (depende de `Date.now()`), así que se lee con
 * `useSyncExternalStore`: la foto del servidor es 0 (renderiza vacío) y el
 * cliente rellena tras hidratar. Así `data-footer-year` nunca desajusta
 * servidor y cliente.
 */
let yearTick = 0;

function subscribeToYear(onChange: () => void) {
  yearTick = Date.now();
  onChange();
  const timer = window.setInterval(
    () => {
      yearTick = Date.now();
      onChange();
    },
    60 * 60 * 1000,
  );
  return () => window.clearInterval(timer);
}

function useCurrentYear() {
  const tick = useSyncExternalStore(
    subscribeToYear,
    () => yearTick,
    () => 0,
  );

  if (!tick) return '';
  return new Intl.DateTimeFormat('es-MX', { year: 'numeric' }).format(new Date(tick));
}

function FooterNavRow({ item }: { item: (typeof NAV_ITEMS)[number] }) {
  return (
    <li
      className="flex w-full items-center border-b border-dotted"
      style={{ borderColor: 'var(--l-border)' }}
    >
      <a
        href={item.href}
        className="group/row flex w-full items-center justify-between gap-4 py-4 no-underline"
        style={{ color: 'var(--l-fg)' }}
      >
        <span
          className="text-3xl leading-none tracking-tight transition-transform duration-300 ease-[var(--ease-transition)] group-hover/row:translate-x-2 md:text-4xl"
          style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}
        >
          {item.label}
        </span>
        <span
          aria-hidden="true"
          className="flex-none translate-x-[-10px] text-3xl leading-none opacity-0 blur-[3px] transition-[transform,opacity,filter] duration-300 ease-[var(--ease-transition)] group-hover/row:translate-x-0 group-hover/row:opacity-100 group-hover/row:blur-none md:text-4xl"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          →
        </span>
      </a>
    </li>
  );
}

export function PublicFooter() {
  const year = useCurrentYear();

  return (
    <footer className="relative block" style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}>
      <div className="flex flex-col gap-y-20 px-6 pt-24 pb-16">
        <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-16 md:flex-row md:items-start">
          {/* Navegación grande, con la flecha que entra al pasar el cursor */}
          <nav className="w-full md:w-[52%]" aria-label="Secciones de la página">
            <ul className="m-0 flex list-none flex-col pl-0">
              {NAV_ITEMS.map((item) => (
                <FooterNavRow key={item.label} item={item} />
              ))}
            </ul>
          </nav>

          {/* Sobre Praxis + legal */}
          <div className="flex w-full flex-wrap gap-x-16 gap-y-10 md:w-[40%] md:justify-end">
            <div className="flex flex-col gap-4">
              <span
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: 'var(--l-fg-muted)' }}
              >
                (Sobre Praxis)
              </span>
              <p
                className="max-w-[26ch] font-sans text-sm leading-relaxed"
                style={{ color: 'var(--l-fg-muted)' }}
              >
                Gestión de proyectos con permisos dinámicos, un asistente que propone y reglas que
                actúan solas.
              </p>
              <a
                href="https://bykyloo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit font-sans text-sm font-medium underline underline-offset-4 transition-opacity hover:opacity-70"
                style={{ color: 'var(--l-fg)' }}
              >
                Un producto de Kyloo ⤴
              </a>
            </div>

            <div className="flex flex-col gap-4">
              <span
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: 'var(--l-fg-muted)' }}
              >
                (Legal)
              </span>
              <ul className="flex flex-col gap-2.5">
                {LEGAL_ITEMS.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="font-sans text-sm transition-opacity hover:opacity-70"
                      style={{ color: 'var(--l-fg-muted)' }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Barra inferior */}
        <div
          className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 font-mono text-xs sm:grid-cols-2"
          style={{ color: 'var(--l-fg-muted)' }}
        >
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="group/top flex items-center gap-1.5 justify-self-start border-0 bg-transparent p-0 text-inherit"
          >
            <span>Volver arriba</span>
            <span className="transition-transform duration-300 ease-[var(--ease-transition)] group-hover/top:-translate-y-0.5">
              ↑
            </span>
          </button>

          <div className="justify-self-start sm:justify-self-end">
            <span>© </span>
            <span data-footer-year="" suppressHydrationWarning>
              {year}
            </span>
            <span> Praxis</span>
          </div>
        </div>
      </div>

      {/* El cierre: un campo de puntos halftone, sutil y en el tono de marca,
          detrás del nombre — técnica del sistema de motion de Kyloo
          (kyloo-design/SKILL.md §9: la variante "hero overlay", puntos tenues
          y transparentes), en el beige monocromo de la propia landing. */}
      <div
        className="relative flex h-[44svh] items-center justify-center overflow-hidden"
        style={{ background: 'var(--l-bg)' }}
      >
        <ShaderCanvas
          className="absolute inset-0 h-full w-full"
          amplitude={1.2}
          timeSpeed={0.005}
          pixelSize={4}
          gooeyness={0.15}
          contrast={1.1}
          bias={-0.1}
          invert={false}
          fg="#e8e8e3"
          transparentBg
          autoReveal
          interactive
        />

        <div className="relative z-10 flex w-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex flex-col items-start gap-2">
            {/* La misma idea que el logotipo de Kyloo (letras + marca propia,
                Navbar.tsx / icons.tsx `KylooLetters`): un nombre grande en una
                grotesca de peso alto, no en la serif de los titulares — el
                logotipo es otra voz, no un encabezado más. Khteka es de pago,
                así que "Praxis" lleva Archivo 800 — ver el comentario en
                `layout.tsx` sobre por qué el propio "By Kyloo" de abajo sí usa
                Khteka de verdad. */}
            <span
              className="text-6xl leading-none tracking-tight md:text-8xl"
              style={{ fontFamily: 'var(--font-grotesk)', fontWeight: 800, color: 'var(--l-fg)' }}
            >
              Praxis
            </span>
            <span
              className="flex items-center gap-2.5"
              style={{ color: 'var(--l-fg)' }}
              aria-label="By Kyloo"
            >
              <span
                className="font-mono text-xs uppercase tracking-[0.2em] md:text-sm"
                aria-hidden="true"
              >
                By
              </span>
              <KylooWordmark className="h-4 w-auto md:h-5" aria-hidden="true" />
            </span>
          </Link>
          <span
            className="hidden max-w-xs text-right font-serif text-lg italic md:block"
            style={{ color: 'var(--l-fg-muted)' }}
          >
            『Cuando el equipo sabe qué hacer, el software desaparece.』
          </span>
        </div>
      </div>
    </footer>
  );
}
