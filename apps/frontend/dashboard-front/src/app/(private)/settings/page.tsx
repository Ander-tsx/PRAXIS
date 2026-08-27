import { setThemeAction } from '@/app/(private)/settings/actions';
import { AppHeader, ThemeToggle } from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Configuración',
};

/**
 * Configuración: **cómo se comporta la aplicación**, no quién eres.
 *
 * «Tus datos» vive en la pantalla de cuenta (`/dashboard/profile`), a la que
 * se llega pulsando tu propia ficha en la barra lateral. Aquí queda lo que se
 * consulta de vez en cuando y no es quién eres.
 *
 * ⚠️ **Praxis Voice se quitó de aquí** — ya no existe en el producto (ver
 * `kyloo-design/SKILL.md`).
 *
 * ## Filas, no tarjetas
 *
 * Eran tres `PanelCard` en rejilla: caja, borde, fondo, esquinas redondeadas
 * por triplicado para tres bloques que no compiten entre sí por espacio, solo
 * se consultan uno detrás de otro. Ahora es una columna con una raya fina
 * arriba de cada fila — el mismo lenguaje editorial que ya lleva el resto del
 * sistema desde la landing (`kyloo-design/SKILL.md` §4): el contenido separa
 * el contenido, no una caja alrededor.
 *
 * Apariencia se queda sin cuerpo — el control entra por `aside`, a la derecha
 * del título — porque un interruptor no necesita una fila propia debajo.
 *
 * ⚠️ **La facturación tampoco está ya aquí**, y es de 2026-08-26. Tenía su fila
 * con el plan y los mensajes restantes, y a la vez existía una pantalla de
 * planes: el mismo dato en dos sitios que se desincronizan solos. Ahora vive en
 * `/dashboard/billing`, con entrada propia en la barra lateral — antes solo se
 * llegaba tropezando con un límite, y una tabla de precios a la que se llega
 * chocando no vende nada.
 */
export default async function SettingsPage() {
  const [, theme] = await Promise.all([loadCurrentUser(), getTheme()]);

  /* Sin `headerSlot`: el rol —y ahora también el plan— los pone el armazón en
     todas las pantallas de todas las zonas (`cuentaSlot`). Dejarlo aquí los
     pintaba dos veces. */
  return (
    <AppHeader title="Configuración">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <SettingsRow
          icon={<IconoApariencia />}
          title="Apariencia"
          description="Elige el tema para toda la interfaz de Praxis."
          aside={<ThemeToggle initialTheme={theme} onCambiar={setThemeAction} />}
        />
      </div>
    </AppHeader>
  );
}

/**
 * Una fila de Configuración: icono, título, frase, y el control a la derecha
 * o el contenido debajo — nunca los dos con un borde alrededor. `first:` le
 * quita la raya de arriba a la primera fila, que no separa nada de encima.
 */
function SettingsRow({
  icon,
  title,
  description,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-border py-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 shrink-0 text-text-secondary" aria-hidden="true">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-xl text-text-primary">{title}</h2>
            {description && (
              <p className="max-w-md font-serif text-sm italic text-text-secondary">
                {description}
              </p>
            )}
          </div>
        </div>

        {aside && <div className="shrink-0">{aside}</div>}
      </div>

      {children}
    </div>
  );
}

/* Los iconos de fila, a 18 px y con el mismo trazo que los de la barra
   lateral. Van aquí y no en un átomo nuevo porque los usa solo esta pantalla. */


function IconoApariencia() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      {/* La mitad rellena: el mismo gesto de «claro y oscuro» que el sol y la
          luna del propio interruptor, sin repetir sus dos iconos. */}
      <path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" stroke="none" />
    </svg>
  );
}
