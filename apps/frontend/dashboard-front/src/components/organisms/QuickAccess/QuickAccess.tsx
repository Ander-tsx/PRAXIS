import {
  IconAdmin,
  IconAnalysis,
  IconChat,
  IconProjects,
  IconSettings,
} from '@/components/atoms/icons';
import { alpha, colors, hasAdminRole } from '@praxis/commons';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface QuickAccessProps {
  /** Roles globales, para decidir si sale la entrada de administración. */
  roles: string[];
  /** Cuántos proyectos tienes, para que la fila diga algo además de su nombre. */
  proyectos: number;
  /** Espacios de trabajo sumados de todos tus proyectos. */
  espacios: number;
  /** Personas sumadas de todos tus proyectos. */
  miembros: number;
}

/**
 * A dónde ir desde aquí.
 *
 * ## El agujero que tapa
 *
 * El panel enseñaba tus proyectos, tus avisos y tus tareas, y para hacer
 * cualquier cosa con ellos había que **volver a la barra lateral**. Es un gesto
 * pequeño y se repite en cada visita: la pantalla que te cuenta cómo va todo era
 * justo la que no dejaba ir a ninguna parte.
 *
 * ## Por qué duplica la barra lateral, y por qué está bien
 *
 * Sí, estas cinco entradas ya están a la izquierda. La diferencia es que aquí
 * **llevan un dato encima**: cuántos proyectos tienes, cuántos espacios suman,
 * cuánta gente hay dentro. La barra lateral responde «¿dónde está Proyectos?»;
 * esto responde «¿qué hay en Proyectos?», que es otra pregunta.
 *
 * Y en móvil la barra lateral es un cajón que hay que abrir, así que aquí deja
 * de ser una duplicación y pasa a ser el único acceso visible.
 *
 * ## ⚠️ Lo que NO lleva: los mensajes sin leer
 *
 * Era lo primero que pedía la fila de «Mensajes», y se quitó a propósito. Ese
 * número ya lo pinta la barra lateral **en todas las pantallas**, y sacarlo aquí
 * costaba dos peticiones (`/me/chats` y `/me/chats/projects`) que
 * `loadPrivateChrome` **ya hace en el layout para esta misma carga**. Serían dos
 * viajes de red para repetir un dato que está tres centímetros a la izquierda.
 *
 * Si algún día el panel necesita ese contador para otra cosa, el sitio de donde
 * sacarlo es el layout, bajándolo por props — no una tercera y cuarta petición.
 *
 * ## ⚠️ Cuatro entradas con `<a>` y una con `next/link`
 *
 * Proyectos, Análisis, Mensajes y Administración **cruzan de zona**: son apps
 * Next distintas del multi-zone, así que van con `<a>` duro. Un `next/link` les
 * pondría delante el basePath del panel y daría `/dashboard/projects`, que es un
 * 404 — y no lo ve el compilador, porque las dos rutas son `string`.
 *
 * Configuración es la excepción: `/dashboard/settings` **es de esta zona**, así
 * que va con `next/link` y **sin** el prefijo, que Next añade solo. Con `<a>`
 * funcionaría igual, pagando una carga completa de la aplicación para ir a la
 * pantalla de al lado.
 *
 * Es la misma trampa de §16, y aquí conviven las dos formas en la misma lista.
 */
export function QuickAccess({ roles, proyectos, espacios, miembros }: QuickAccessProps) {
  const administra = hasAdminRole(roles);

  return (
    <section
      className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-5"
      aria-labelledby="titulo-accesos"
    >
      <h2 id="titulo-accesos" className="font-display text-xl text-text-primary">
        Ir a
      </h2>

      <ul className="flex flex-col gap-1">
        <Acceso
          href="/projects"
          icon={<IconProjects className="h-[18px] w-[18px]" />}
          tone={colors.primary}
          label="Proyectos"
          detalle={
            proyectos === 0
              ? 'Crea el primero'
              : `${proyectos} ${proyectos === 1 ? 'proyecto' : 'proyectos'} · ${espacios} ${
                  espacios === 1 ? 'espacio' : 'espacios'
                }`
          }
        />

        <Acceso
          href="/reports"
          icon={<IconAnalysis className="h-[18px] w-[18px]" />}
          tone={colors.info}
          label="Análisis"
          detalle="Cómo va el trabajo, con datos"
        />

        <Acceso
          href="/chat"
          icon={<IconChat className="h-[18px] w-[18px]" />}
          tone={colors.accent}
          label="Mensajes"
          detalle={`${miembros} ${miembros === 1 ? 'persona' : 'personas'} en tus proyectos`}
        />

        {administra && (
          <Acceso
            href="/admin"
            icon={<IconAdmin className="h-[18px] w-[18px]" />}
            tone={colors.warning}
            label="Administración"
            detalle="Cuentas, proyectos y actividad"
          />
        )}

        {/* Misma zona: ruta sin el prefijo y `next/link`. Ver la nota de arriba. */}
        <Acceso
          href="/settings"
          sameZone
          icon={<IconSettings className="h-[18px] w-[18px]" />}
          tone={colors.textSecondary}
          label="Configuración"
          detalle="Tu cuenta, apariencia y plan"
        />
      </ul>
    </section>
  );
}

function Acceso({
  href,
  icon,
  tone,
  label,
  detalle,
  sameZone = false,
}: {
  href: string;
  icon: ReactNode;
  tone: string;
  label: string;
  detalle: string;
  /** `true` → `next/link` sin prefijo. `false` → `<a>` duro. Ver la nota de arriba. */
  sameZone?: boolean;
}) {
  const clase =
    'group flex items-center gap-3 rounded-sm px-2.5 py-2.5 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  const contenido = (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm"
        style={{ background: alpha(tone, 12), color: tone }}
      >
        {icon}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-sans text-sm font-semibold text-text-primary">{label}</span>
        <span className="truncate font-sans text-xs text-text-secondary">{detalle}</span>
      </span>
    </>
  );

  return (
    <li>
      {sameZone ? (
        <Link href={href} className={clase}>
          {contenido}
        </Link>
      ) : (
        <a href={href} className={clase}>
          {contenido}
        </a>
      )}
    </li>
  );
}
