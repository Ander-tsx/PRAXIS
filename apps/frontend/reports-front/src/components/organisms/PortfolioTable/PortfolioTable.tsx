'use client';

import type { PortfolioRow } from '@/lib/reports';
import { Badge, type DataColumn, DataTable, alpha, colors } from '@praxis/commons';
import Link from 'next/link';

/**
 * Cuántas señales rojas tiene un proyecto, para poder ordenar por «lo peor».
 *
 * ⚠️ **No es una puntuación y no se enseña.** Solo ordena. Un número que
 * resumiera «cómo va» este proyecto sería exactamente lo que el invariante 3
 * prohíbe —vencidas y paradas no se suman en un contador único, porque son un
 * problema y una advertencia— y en cuanto se pinta, alguien lo compara entre
 * equipos. Sirve para decidir qué fila va arriba y nada más.
 *
 * Las vencidas pesan más que las paradas a propósito: una vencida incumple una
 * fecha que alguien puso; una parada solo lleva tiempo sin moverse, y puede ser
 * correcto —una tarea a la espera de otra no está en problemas—.
 */
function urgencia(fila: PortfolioRow): number {
  return fila.vencidas * 3 + fila.paradas + fila.sinAsignar;
}

/** Una cifra que solo se pinta cuando hay algo que decir. Cero no es una alarma. */
function Senal({ valor, tono }: { valor: number; tono: string }) {
  if (valor === 0) {
    return <span className="font-sans text-sm tabular-nums text-text-disabled">—</span>;
  }
  return (
    <Badge
      variant="accent"
      className="tabular-nums"
      style={{ background: alpha(tono, 15), color: tono, borderRadius: 4 }}
    >
      {valor}
    </Badge>
  );
}

/**
 * El ritmo de esta semana contra la anterior.
 *
 * ⚠️ **La semana en curso está a medias**, y es la trampa que ya documenta el
 * informe semanal de un proyecto: un lunes por la mañana cualquier comparación
 * con siete días completos sale catastrófica. Aquí no hay sitio para el ritmo
 * diario de las dos, así que **no se calcula ninguna variación**: se enseñan los
 * dos números uno al lado del otro y quien lea decide. Un «−80 %» el lunes es
 * una cifra falsa dicha con seguridad.
 */
function Ritmo({ fila }: { fila: PortfolioRow }) {
  return (
    <span className="font-sans text-sm tabular-nums text-text-secondary">
      <span className="font-semibold text-text-primary">{fila.cerradasSemana}</span>
      <span className="text-text-disabled"> / {fila.cerradasSemanaAnterior}</span>
    </span>
  );
}

/**
 * La cartera: una fila por proyecto, ordenada por lo que más pide entrar.
 *
 * ## Por qué es una tabla y no seis tarjetas
 *
 * Porque la pregunta es comparativa —«¿en cuál de los cinco entro?»— y comparar
 * cifras entre tarjetas obliga a recorrerlas una a una buscando el mismo dato en
 * sitios distintos. En columnas, la comparación es vertical y ya está hecha.
 *
 * ## Los enlaces cruzan a la pantalla del proyecto **dentro de la zona**
 *
 * `next/link` con `/<slug>`, sin el `/reports`: Next lo añade solo. Es la misma
 * regla de siempre (invariante 5) y aquí no se cruza de zona.
 */
export function PortfolioTable({ filas }: { filas: PortfolioRow[] }) {
  /* Lo que arde arriba. Con el desempate por nombre para que dos proyectos
     tranquilos no se intercambien de sitio entre dos cargas. */
  const ordenadas = [...filas].sort(
    (a, b) => urgencia(b) - urgencia(a) || (a.name ?? '').localeCompare(b.name ?? ''),
  );

  const columnas: DataColumn<PortfolioRow>[] = [
    {
      key: 'name',
      header: 'Proyecto',
      track: { fr: 2 },
      mobileLabel: false,
      cell: (fila) => (
        <Link
          href={fila.slug ? `/${fila.slug}` : '/'}
          className="truncate font-sans text-sm font-semibold text-text-primary underline-offset-2 hover:text-primary hover:underline"
        >
          {fila.name ?? 'Proyecto sin nombre'}
        </Link>
      ),
    },
    {
      key: 'abiertas',
      header: 'Abiertas',
      track: { rem: 6 },
      cell: (fila) => (
        <span className="font-sans text-sm tabular-nums text-text-primary">
          {fila.abiertas}
          <span className="text-text-disabled"> / {fila.total}</span>
        </span>
      ),
    },
    {
      key: 'vencidas',
      header: 'Vencidas',
      track: { rem: 6 },
      cell: (fila) => <Senal valor={fila.vencidas} tono={colors.error} />,
    },
    {
      key: 'paradas',
      header: 'Paradas',
      track: { rem: 6 },
      cell: (fila) => <Senal valor={fila.paradas} tono={colors.warning} />,
    },
    {
      key: 'sinAsignar',
      header: 'Sin asignar',
      track: { rem: 7 },
      cell: (fila) => <Senal valor={fila.sinAsignar} tono={colors.info} />,
    },
    {
      key: 'ritmo',
      header: 'Cerradas · sem / ant',
      track: { rem: 10 },
      cell: (fila) => <Ritmo fila={fila} />,
    },
  ];

  return (
    <DataTable
      columns={columnas}
      rows={ordenadas}
      rowKey={(fila) => fila.projectId}
      ariaLabel="Tus proyectos, con las señales que piden entrar"
    />
  );
}
