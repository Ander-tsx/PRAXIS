import { colors } from '@praxis/commons';

export interface AdminStat {
  etiqueta: string;
  /** `null` cuando no se pudo contar. Se pinta como «—», no como cero. */
  valor: number | null;
  tono: string;
}

export interface AdminHeaderProps {
  titulo: string;
  descripcion: string;
  /** Las cifras de la sección. Vacío en las que no tienen ninguna. */
  cifras?: AdminStat[];
}

/**
 * La cabecera de una sección del panel.
 *
 * ## El dibujo lo marca la pantalla de Equipo
 *
 * Título grande sin serifa, entradilla en gris, una raya fina debajo que separa
 * la presentación de la sección del contenido. Es el mismo encabezado que abre
 * `team/page.tsx`, para que Administración y el portal de organización se lean
 * como partes del mismo producto.
 *
 * ⚠️ **Ya no lleva sus propias pestañas.** Las tenía —Cuentas / Proyectos /
 * Actividad— duplicando lo que ya resuelve la barra lateral (§12 del
 * `kyloo-design/SKILL.md`).
 *
 * ## Las cifras van en una fila, no en cajas
 *
 * Eran rectángulos con borde y fondo tintado, uno por número: una tarjeta por
 * dato, que es justo lo que el lenguaje de la aplicación evita. Ahora es una
 * sola fila —cifra grande arriba, rótulo pequeño debajo— separada por rayas
 * verticales finas. El color solo tiñe el número, y solo cuando significa algo
 * (suspendidas, de baja); el total va en blanco.
 *
 * ## ⚠️ `null` se pinta «—», nunca cero
 *
 * Las cifras salen de consultas que pueden fallar por su cuenta, y **cero
 * cuentas suspendidas y «no lo pude contar» son cosas muy distintas** en un
 * panel de administración: la primera dice que todo está bien, la segunda no
 * dice nada.
 */
export function AdminHeader({ titulo, descripcion, cifras = [] }: AdminHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl font-semibold tracking-tight text-white">{titulo}</h1>
        <p className="max-w-2xl font-sans text-sm text-white/70">{descripcion}</p>
      </div>

      {cifras.length > 0 && (
        <dl className="flex flex-wrap items-stretch gap-y-4">
          {cifras.map((cifra, indice) => (
            <div
              key={cifra.etiqueta}
              className={`flex flex-col gap-1 pr-7 ${
                indice > 0 ? 'ml-7 border-l border-white/10 pl-7' : ''
              }`}
            >
              <dd
                className="font-sans text-2xl font-semibold leading-none tabular-nums"
                style={{ color: cifra.valor === null ? colors.textDisabled : cifra.tono }}
              >
                {cifra.valor === null ? '—' : cifra.valor}
              </dd>
              <dt className="font-sans text-xs uppercase tracking-wider text-white/40">
                {cifra.etiqueta}
              </dt>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
