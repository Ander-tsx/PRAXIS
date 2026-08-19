'use client';

import { PRIORITY_LABELS, Select, SelectorDeFecha } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { PRIORITY_ORDER } from '@/lib/reports';

/** Lo que hay puesto ahora mismo, tal como llegó por la URL. */
export interface FiltrosPuestos {
  from?: string;
  to?: string;
  boardId?: string;
  assigneeId?: string;
  labelId?: string;
  priority?: string;
}

export interface AnalysisFiltersProps {
  /**
   * La ruta de este proyecto **dentro de la zona**: `/<slug>`, sin `/reports`.
   *
   * ⚠️ Next añade el `basePath` solo al navegar con `router.push`. Escribirlo
   * aquí daría `/reports/reports/mi-proyecto` (ESTADO-ACTUAL §16). Es la misma
   * trampa que documenta `FilterBar` en Administración.
   */
  basePath: string;
  puestos: FiltrosPuestos;
  tableros: { id: string; name: string }[];
  /** Los miembros, ya con nombre resuelto: aquí no se habla en UUID. */
  personas: { id: string; nombre: string }[];
  etiquetas: { id: string; nombre: string }[];
}

/** El valor de «cualquiera». No se escribe en la URL: ausente **es** ese valor. */
const TODOS = '';

/**
 * La barra de filtros de Análisis.
 *
 * ## Los filtros viven en la URL, no en estado local
 *
 * Por lo mismo que en Administración: el filtrado lo hace el backend, así que
 * «las tareas urgentes del tablero de diseño» tiene que ser un enlace que se
 * pueda pegar en un mensaje. El botón atrás deshace un filtro, la página sigue
 * siendo un Server Component que pinta datos frescos, y —lo que aquí importa
 * más— **el lienzo entero se recalcula con una sola navegación**: siete
 * agregados filtrados llegan en la misma petición que ya los traía.
 *
 * ## ⚠️ No hay botón «Aplicar», y es una decisión
 *
 * Cada control navega al cambiar. Un botón aparte habría hecho falta si cada
 * cambio costara una petición por gráfico, pero desde R4.2 los siete viajan
 * juntos: un cambio es **una** petición, la misma que ya se pagaba al entrar.
 * Con «Aplicar» hay un estado intermedio en el que la pantalla enseña unos
 * números y los controles dicen otra cosa, y eso se lee mal.
 *
 * ## ⚠️ El rango no puede pasar de 365 días
 *
 * Lo rechaza el gateway con un 400, a propósito y no recortando —un tramo
 * recortado en silencio devuelve un gráfico que se lee como la respuesta a la
 * pregunta que se hizo—. Aquí no se replica esa comprobación: duplicar una regla
 * de negocio en el cliente es garantizar que un día digan cosas distintas. Lo
 * que sí se hace es no ofrecerlo, dejando `to` deshabilitado sin `from`.
 */
export function AnalysisFilters({
  basePath,
  puestos,
  tableros,
  personas,
  etiquetas,
}: AnalysisFiltersProps) {
  const router = useRouter();

  function navegar(cambio: Partial<FiltrosPuestos>) {
    const siguiente = { ...puestos, ...cambio };
    const params = new URLSearchParams();

    for (const [clave, valor] of Object.entries(siguiente)) {
      if (valor) params.set(clave, valor);
    }

    /* Un `to` sin `from` no filtra nada —el backend lo ignora— así que tampoco
       se escribe: dejarlo en la URL sería enseñar un filtro que no está puesto. */
    if (!siguiente.from) params.delete('to');

    const qs = params.toString();
    /* `push` y no `useRefrescoAgrupado`: la URL cambia, así que el App Router ya
       vuelve a pedir el árbol de servidor con los filtros nuevos. Un `refresh()`
       encima sería la misma pantalla dos veces. */
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hayFiltros = Object.values(puestos).some(Boolean);

  const opciones = (
    todos: string,
    filas: { id: string; nombre: string }[],
  ): { value: string; label: string }[] => [
    { value: TODOS, label: todos },
    ...filas.map((fila) => ({ value: fila.id, label: fila.nombre })),
  ];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-44">
        <SelectorDeFecha
          name="from"
          label="Desde"
          defaultValue={puestos.from ?? ''}
          onValueChange={(valor) => navegar({ from: valor })}
        />
      </div>

      <div className="w-full sm:w-44">
        <SelectorDeFecha
          name="to"
          label="Hasta"
          defaultValue={puestos.to ?? ''}
          disabled={!puestos.from}
          onValueChange={(valor) => navegar({ to: valor })}
        />
      </div>

      {/* El tablero solo cuando hay más de uno: con uno, el desplegable tendría
          una opción y «todos», que es elegir entre lo mismo dos veces. */}
      {tableros.length > 1 && (
        <div className="w-full sm:w-48">
          <Select
            label="Tablero"
            fullWidth
            options={opciones(
              'Todos los tableros',
              tableros.map((tablero) => ({ id: tablero.id, nombre: tablero.name })),
            )}
            value={puestos.boardId ?? TODOS}
            onValueChange={(valor) => navegar({ boardId: valor })}
          />
        </div>
      )}

      {personas.length > 0 && (
        <div className="w-full sm:w-48">
          <Select
            label="Responsable"
            fullWidth
            options={opciones('Cualquiera', personas)}
            value={puestos.assigneeId ?? TODOS}
            onValueChange={(valor) => navegar({ assigneeId: valor })}
          />
        </div>
      )}

      {etiquetas.length > 0 && (
        <div className="w-full sm:w-48">
          <Select
            label="Etiqueta"
            fullWidth
            options={opciones('Cualquiera', etiquetas)}
            value={puestos.labelId ?? TODOS}
            onValueChange={(valor) => navegar({ labelId: valor })}
          />
        </div>
      )}

      <div className="w-full sm:w-40">
        <Select
          label="Prioridad"
          fullWidth
          options={[
            { value: TODOS, label: 'Cualquiera' },
            /* De urgente a baja, que es como se lee una prioridad. `PRIORITIES`
               de commons va al revés porque allí ordena un desplegable de
               edición, donde el defecto queda en medio. */
            ...PRIORITY_ORDER.map((prioridad) => ({
              value: prioridad,
              label: PRIORITY_LABELS[prioridad],
            })),
          ]}
          value={puestos.priority ?? TODOS}
          onValueChange={(valor) => navegar({ priority: valor })}
        />
      </div>

      {/* La salida, junto a los filtros que la hacen falta. Sin esto hay que
          poner cada desplegable en «Cualquiera» a mano, uno por uno: el mismo
          callejón sin salida que ya se arregló en la rejilla de proyectos. */}
      {hayFiltros && (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="h-10 font-sans text-xs font-semibold text-primary underline-offset-2 transition-colors hover:underline"
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}
