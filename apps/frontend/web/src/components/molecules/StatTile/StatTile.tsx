import { alpha, colors } from '@praxis/commons';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface StatTileProps {
  value: number;
  /**
   * Lo que se escribe, cuando no es exactamente `value`.
   *
   * Existe por un caso concreto: `GET /me/tasks` con `excludeDone` no puede
   * decir cuántas hay de verdad si se llena el tope, así que ahí se escribe
   * `100+`. `value` sigue siendo el número —de él sale si la tarjeta está
   * apagada— y esto solo cambia el texto.
   */
  display?: string;
  /** El nombre de la cifra. Corto: cabe en una línea o no cabe. */
  label: string;
  /** Qué significa, en una frase. Cambia con el valor cuando eso ayuda. */
  hint: string;
  /** El color del asunto. Ver la nota sobre el cero. */
  tone: string;
  icon: ReactNode;
  /** A dónde lleva. Ver `sameZone`. */
  href: string;
  /**
   * ¿El destino está en esta misma zona?
   *
   * `true` → `next/link` sin el basePath, que Next añade solo. `false` → `<a>`
   * duro, porque cruzar de zona es una navegación entre apps del multi-zone
   * (§16). Por defecto `false`, que es el valor seguro: un `<a>` de más cuesta
   * una carga completa; un `next/link` de más cuesta un 404 con el prefijo
   * repetido, y **eso no lo ve el compilador**.
   */
  sameZone?: boolean;
}

/**
 * Una cifra del panel, y **es un enlace**.
 *
 * ## El problema que resuelve
 *
 * Las tres métricas que había antes —proyectos, espacios, miembros— eran de
 * inventario: decían el tamaño de tus cosas y ninguna cambiaba lo que ibas a
 * hacer en los cinco minutos siguientes. Y ninguna llevaba a ninguna parte, así
 * que enterarte de que tienes cuatro tareas vencidas y **poder ir a verlas** eran
 * dos gestos separados por un viaje a la barra lateral.
 *
 * Una cifra en un panel es una pregunta a medias. Si no se puede pulsar, la otra
 * mitad se la come el usuario.
 *
 * ## ⚠️ Un cero no es una alarma
 *
 * Con `value === 0` el color del asunto se apaga y el mosaico se pinta en gris,
 * aunque el tono sea rojo. Cuatro tarjetas de colores encendidos con ceros
 * dentro es un panel que grita sin decir nada, y —peor— entrena a no mirar el
 * rojo. El rojo tiene que significar que hay algo rojo.
 *
 * Se apaga el color, **no se esconde la tarjeta**: «no tienes nada vencido» es
 * justo la información que se busca al abrir el panel, y una tarjeta que aparece
 * y desaparece obliga a releer la fila entera cada vez.
 */
export function StatTile({
  value,
  display,
  label,
  hint,
  tone,
  icon,
  href,
  sameZone = false,
}: StatTileProps) {
  const vacia = value === 0;
  const color = vacia ? colors.textSecondary : tone;

  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-sans text-xs font-semibold uppercase tracking-wider text-white">
          {label}
        </span>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
          style={{ background: alpha(color, vacia ? 8 : 14), color }}
        >
          {icon}
        </span>
      </div>

      <span
        className="font-display text-[2.75rem] leading-none tabular-nums transition-colors"
        style={{ color: vacia ? colors.textDisabled : color }}
      >
        {display ?? value}
      </span>

      {/* ⚠️ **Sin flecha de «esto se pulsa».** La llevó y se quitó: cuatro
          mosaicos en fila con su flechita cada uno son cuatro veces el mismo
          aviso, y una flecha de texto sobre una tarjeta se lee como un carácter
          suelto, no como un icono. Que se puede pulsar ya lo dicen el cursor, el
          realce del borde y el pequeño levantamiento al apuntar. */}
      <span className="font-sans text-xs text-white">{hint}</span>
    </>
  );

  const clase =
    'group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return sameZone ? (
    <Link href={href} className={clase}>
      {contenido}
    </Link>
  ) : (
    <a href={href} className={clase}>
      {contenido}
    </a>
  );
}
