import { alpha, colors } from '@praxis/commons';

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
 * ## Lo que faltaba
 *
 * Las tres pantallas empezaban igual: pestañas, barra de filtros, tabla,
 * paginación. Todo del mismo peso y sin una sola cifra sobre el estado de la
 * plataforma, aunque **cada listado ya devolvía su `total`**. Quien administra
 * abre esto para responder «¿hay algo mal?», y la pantalla no lo decía en ningún
 * sitio: había que filtrar por «Suspendidas» y leer el contador.
 *
 * Ahora la sección se presenta —qué es y qué se puede hacer aquí— y enseña las
 * cifras que importan antes de la tabla.
 *
 * ⚠️ **Ya no lleva sus propias pestañas.** Las tenía —Cuentas / Proyectos /
 * Actividad— duplicando exactamente lo que ahora ya resuelve la barra
 * lateral (§12 del `kyloo-design/SKILL.md`): con las tres pantallas como
 * entradas propias del grupo «Administración», una segunda navegación aquí
 * dentro solo repetía la primera con otro dibujo.
 *
 * ## ⚠️ `null` se pinta «—», nunca cero
 *
 * Las cifras salen de consultas que pueden fallar por su cuenta, y **cero
 * cuentas suspendidas y «no lo pude contar» son cosas muy distintas** en un panel
 * de administración: la primera dice que todo está bien, la segunda no dice nada.
 * Confundirlas es afirmar que no hay problemas porque no se pudo preguntar.
 */
export function AdminHeader({ titulo, descripcion, cifras = [] }: AdminHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-3xl text-text-primary">{titulo}</h2>
        <p className="max-w-2xl font-serif text-base italic text-text-secondary">{descripcion}</p>
      </div>

      {cifras.length > 0 && (
        <dl className="flex flex-wrap gap-3">
          {cifras.map((cifra) => (
            <div
              key={cifra.etiqueta}
              className="flex min-w-32 flex-col gap-0.5 rounded-xl border px-4 py-3"
              style={{
                borderColor: alpha(cifra.tono, 25),
                background: alpha(cifra.tono, 7),
              }}
            >
              <dt className="font-sans text-xs uppercase tracking-wider text-text-secondary">
                {cifra.etiqueta}
              </dt>
              <dd
                className="font-display text-2xl leading-none tabular-nums"
                style={{ color: cifra.valor === null ? colors.textDisabled : cifra.tono }}
              >
                {cifra.valor === null ? '—' : cifra.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
