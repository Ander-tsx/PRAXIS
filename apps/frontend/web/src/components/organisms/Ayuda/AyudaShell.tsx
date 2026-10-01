import { ARTICULOS, CATEGORIAS } from '@/content/ayuda/articulos';
import type { Bloque } from '@/content/ayuda/tipos';
import type { ReactNode } from 'react';
import { type EntradaDeIndice, IndiceDeAyuda } from './IndiceDeAyuda';

/** El texto de un bloque, sin marcas, para que el buscador mire dentro de los artículos. */
function textoDe(bloque: Bloque): string {
  switch (bloque.tipo) {
    case 'h2':
    case 'p':
    case 'consejo':
    case 'aviso':
      return bloque.texto;
    case 'lista':
    case 'pasos':
      return bloque.items.join(' ');
    case 'tabla':
      return [...bloque.cabecera, ...bloque.filas.flat()].join(' ');
  }
}

const ENTRADAS: EntradaDeIndice[] = ARTICULOS.map((a) => ({
  slug: a.slug,
  titulo: a.titulo,
  resumen: a.resumen,
  categoria: a.categoria,
  texto: a.bloques
    .map(textoDe)
    .join(' ')
    .replace(/[*`]|\]\([^)]*\)|\[/g, ''),
}));

/**
 * El marco de la ayuda: índice a la izquierda y el contenido a la derecha.
 *
 * En pantallas estrechas el índice se pliega en un desplegable encima del
 * contenido, que es donde se espera encontrarlo sin ocupar media pantalla.
 */
export function AyudaShell({ activo, children }: { activo?: string; children: ReactNode }) {
  const indice = (
    <IndiceDeAyuda
      entradas={ENTRADAS}
      categorias={CATEGORIAS.map((c) => c.nombre)}
      activo={activo}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <details className="rounded-xl border border-border bg-white/[0.03] p-3 lg:hidden">
        <summary className="cursor-pointer font-sans text-[13px] font-semibold text-white">
          Índice de la ayuda
        </summary>
        <div className="mt-3">{indice}</div>
      </details>

      <aside className="hidden lg:block">
        <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto scrollbar-none pr-2">
          {indice}
        </div>
      </aside>

      <div className="min-w-0 max-w-3xl">{children}</div>
    </div>
  );
}
