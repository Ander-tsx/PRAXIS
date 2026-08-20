'use client';

import { Desplegable } from '@/components/molecules/Desplegable';
import { PRIORITY_ORDER, fechaCorta } from '@/lib/reports';
import { PRIORITY_LABELS, Select, SelectorDeFecha, alpha, colors } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

/** Una etiqueta puesta, ya legible, con la clave que la quita. */
interface Aplicado {
  clave: keyof FiltrosPuestos;
  texto: string;
}

/**
 * La barra de filtros de Análisis.
 *
 * ## Los filtros viven en la URL, no en estado local
 *
 * Por lo mismo que en Administración: el filtrado lo hace el backend, así que
 * «las urgentes del tablero de diseño» tiene que ser un enlace que se pueda
 * pegar en un mensaje. El botón atrás deshace un filtro, la página sigue siendo
 * un Server Component que pinta datos frescos, y —lo que aquí importa más— **el
 * lienzo entero se recalcula con una sola navegación**: siete agregados
 * filtrados llegan en la misma petición que ya los traía.
 *
 * ## 🔴 La barra es pegajosa, y eso no es un adorno
 *
 * Con un filtro puesto, **los siete gráficos enseñan números filtrados**. El
 * lienzo crece con cada gráfico añadido, así que a media pantalla de scroll los
 * controles quedan fuera de vista y lo que se está mirando son cifras acotadas
 * sin nada que lo diga. Ese es exactamente el fallo que esta sección más teme:
 * un gráfico plausible y equivocado.
 *
 * `sticky top-0` lo resuelve porque el que desplaza es el `<main>` del armazón
 * —lleva `overflow-y-auto`— y no la ventana. Y la barra **cambia de color**
 * cuando hay algo puesto: verla no basta si se ve igual filtrada que sin
 * filtrar.
 *
 * ⚠️ El `-mx-4 px-4` del fondo no es un capricho de maquetación: el contenedor
 * del armazón lleva su propio `p-4`, y sin sacar el fondo hasta el borde, el
 * contenido se ve pasar por el hueco de los lados al desplazarse.
 *
 * ## Colapsada por defecto, con lo puesto siempre a la vista
 *
 * Siete controles desplegados permanentemente son, en un móvil, siete bloques a
 * pantalla completa entre la cabecera y el primer gráfico: hay que hacer scroll
 * para llegar a lo que se viene a ver. Colapsados, lo que ocupa sitio es solo lo
 * que está puesto, y en forma de etiquetas que **se quitan una a una** — que es
 * el gesto que falta cuando has acotado de más y solo quieres deshacer lo
 * último.
 *
 * Se despliega **en la propia página y no en un modal**, por el mismo motivo que
 * el catálogo: filtrar es una decisión que se toma mirando lo que ya tienes
 * puesto, y un modal tapa exactamente eso.
 *
 * ## ⚠️ No hay botón «Aplicar»
 *
 * Cada control navega al cambiar. Un botón aparte habría hecho falta si cada
 * cambio costara una petición por gráfico, pero desde R4.2 los siete viajan
 * juntos: un cambio es **una** petición, la misma que ya se pagaba al entrar.
 * Con «Aplicar» hay un estado intermedio en el que la pantalla enseña unos
 * números y los controles dicen otra cosa, y eso se lee mal.
 *
 * ## ⚠️ El rango no puede pasar de 365 días
 *
 * Lo rechaza el gateway con un 400, a propósito y no recortando. Aquí no se
 * replica esa comprobación —duplicar una regla de negocio en el cliente es
 * garantizar que un día digan cosas distintas— pero sí se evita ofrecerlo:
 * `Hasta` está deshabilitado mientras no haya un `Desde`.
 */
export function AnalysisFilters({
  basePath,
  puestos,
  tableros,
  personas,
  etiquetas,
}: AnalysisFiltersProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

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
    /* `push` y no un `refresh` encima: la URL cambia, así que el App Router ya
       vuelve a pedir el árbol de servidor con los filtros nuevos. */
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const nombreDe = (filas: { id: string; nombre: string }[], id?: string) =>
    filas.find((fila) => fila.id === id)?.nombre;

  const tablerosComoFilas = tableros.map((tablero) => ({
    id: tablero.id,
    nombre: tablero.name,
  }));

  /**
   * Lo puesto, en palabras.
   *
   * ⚠️ **Cae al id cuando no se encuentra el nombre**, en vez de omitir la
   * etiqueta. Un filtro por una persona que ya salió del proyecto seguiría
   * acotando los gráficos, y no pintarlo dejaría la pantalla filtrada sin decir
   * por qué — que es peor que enseñar un UUID feo.
   */
  const aplicados: Aplicado[] = [
    puestos.from && { clave: 'from' as const, texto: `Desde ${fechaCorta(puestos.from)}` },
    puestos.to && { clave: 'to' as const, texto: `Hasta ${fechaCorta(puestos.to)}` },
    puestos.boardId && {
      clave: 'boardId' as const,
      texto: `Tablero: ${nombreDe(tablerosComoFilas, puestos.boardId) ?? puestos.boardId}`,
    },
    puestos.assigneeId && {
      clave: 'assigneeId' as const,
      texto: `Responsable: ${nombreDe(personas, puestos.assigneeId) ?? puestos.assigneeId}`,
    },
    puestos.labelId && {
      clave: 'labelId' as const,
      texto: `Etiqueta: ${nombreDe(etiquetas, puestos.labelId) ?? puestos.labelId}`,
    },
    puestos.priority && {
      clave: 'priority' as const,
      texto: `Prioridad: ${PRIORITY_LABELS[puestos.priority as keyof typeof PRIORITY_LABELS] ?? puestos.priority}`,
    },
  ].filter(Boolean) as Aplicado[];

  const hayFiltros = aplicados.length > 0;

  const opciones = (
    todos: string,
    filas: { id: string; nombre: string }[],
  ): { value: string; label: string }[] => [
    { value: TODOS, label: todos },
    ...filas.map((fila) => ({ value: fila.id, label: fila.nombre })),
  ];

  return (
    /**
     * 🔴 **Un fragmento, y NO un `<div>` envolviendo a los dos.**
     *
     * Es la trampa clásica de `position: sticky`, y se comió una iteración
     * entera: un elemento pegajoso solo puede desplazarse **dentro de su
     * padre**. Envueltos en un `<div className="flex flex-col">`, ese padre mide
     * lo mismo que la barra —el panel está cerrado casi siempre— así que el
     * recorrido disponible era de cero píxeles: la barra se iba con el scroll
     * como cualquier otra cosa, sin un solo error y con el CSS «bien puesto».
     *
     * Sueltos en el fragmento, los dos pasan a ser hijos del `flex flex-col` de
     * la página, que mide lo que mide el lienzo entero. Ahí sí hay recorrido.
     *
     * Se descubrió comparando dos capturas de un móvil: en la de después de
     * desplazar, la barra no estaba. Compilaba, se pintaba y era exactamente el
     * fallo que la barra existe para evitar.
     */
    <>
      <div
        className="-mx-4 flex flex-wrap items-center gap-2 px-4 py-3 sm:-mx-6 sm:px-6"
        style={{
          /* Opaco de verdad: el lienzo pasa por debajo al desplazarse. */
          background: colors.background,
          borderBottom: `1px solid ${hayFiltros ? alpha(colors.primary, 35) : alpha(colors.border, 60)}`,
        }}
      >
        <button
          type="button"
          onClick={() => setAbierto((estaba) => !estaba)}
          aria-expanded={abierto}
          className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 font-sans text-sm font-semibold transition-colors"
          style={{
            borderColor: hayFiltros ? alpha(colors.primary, 45) : colors.border,
            background: hayFiltros ? alpha(colors.primary, 10) : colors.surface,
            color: hayFiltros ? colors.primary : colors.textPrimary,
          }}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 5h18l-7 8v5l-4 2v-7z" />
          </svg>
          Filtrar
          {/* La cifra y no un punto: «3 filtros» dice cuánto has acotado; un
              punto solo dice que sí, y con tres puestos eso no basta. */}
          {hayFiltros && <span className="tabular-nums font-bold">{aplicados.length}</span>}
        </button>

        {/**
         * Lo puesto, quitable de una en una.
         *
         * Sin esto, deshacer el último filtro obliga a abrir el panel y poner ese
         * desplegable en «Cualquiera» — o a quitarlos todos y empezar de nuevo.
         */}
        {aplicados.map((aplicado) => (
          <button
            key={aplicado.clave}
            type="button"
            onClick={() => navegar({ [aplicado.clave]: undefined })}
            aria-label={`Quitar el filtro ${aplicado.texto}`}
            className="flex max-w-full items-center gap-1.5 rounded-full py-1 pl-3 pr-2 font-sans text-xs transition-opacity hover:opacity-75"
            style={{ background: alpha(colors.primary, 12), color: colors.primary }}
          >
            <span className="truncate">{aplicado.texto}</span>
            <span aria-hidden="true" className="text-sm leading-none">
              ×
            </span>
          </button>
        ))}

        {/* Desde dos: con uno, su propia aspa ya lo quita y este botón haría lo
            mismo con otro nombre. */}
        {aplicados.length > 1 && (
          <button
            type="button"
            onClick={() => router.push(basePath)}
            className="font-sans text-xs font-semibold text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline"
          >
            Quitar todo
          </button>
        )}

        {!hayFiltros && (
          <span className="font-sans text-xs text-text-disabled">Todo el proyecto, sin acotar</span>
        )}
      </div>

      {/* `-mt-3` porque es hijo directo del `gap-6` de la página, y esos 24 px lo
          separaban de la barra como si fueran dos cosas distintas. El `pb-1` deja
          respirar al último campo dentro del recorte del desplegable. */}
      <div className="-mt-3">
        <Desplegable abierto={abierto}>
          <div className="grid grid-cols-1 gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* ⚠️ La `key` con el valor puesto: sin ella, «Quitar todo» limpia la
              URL y el campo sigue enseñando la fecha —lleva su valor por dentro y
              en una navegación suave no se desmonta—. Aquí y no en el organismo
              entero, que es donde estaba y cerraba el panel en cada cambio. */}
            <SelectorDeFecha
              key={`from-${puestos.from ?? ''}`}
              name="from"
              label="Desde"
              defaultValue={puestos.from ?? ''}
              placeholder="Cualquier fecha"
              onValueChange={(valor) => navegar({ from: valor })}
            />

            <SelectorDeFecha
              key={`to-${puestos.to ?? ''}`}
              name="to"
              label="Hasta"
              defaultValue={puestos.to ?? ''}
              placeholder="Cualquier fecha"
              disabled={!puestos.from}
              onValueChange={(valor) => navegar({ to: valor })}
            />

            {/* El tablero solo cuando hay más de uno: con uno, el desplegable
              tendría una opción y «todos», que es elegir entre lo mismo. */}
            {tableros.length > 1 && (
              <Select
                label="Tablero"
                fullWidth
                options={opciones('Todos los tableros', tablerosComoFilas)}
                value={puestos.boardId ?? TODOS}
                onValueChange={(valor) => navegar({ boardId: valor })}
              />
            )}

            {personas.length > 0 && (
              <Select
                label="Responsable"
                fullWidth
                options={opciones('Cualquiera', personas)}
                value={puestos.assigneeId ?? TODOS}
                onValueChange={(valor) => navegar({ assigneeId: valor })}
              />
            )}

            {etiquetas.length > 0 && (
              <Select
                label="Etiqueta"
                fullWidth
                options={opciones('Cualquiera', etiquetas)}
                value={puestos.labelId ?? TODOS}
                onValueChange={(valor) => navegar({ labelId: valor })}
              />
            )}

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
        </Desplegable>
      </div>
    </>
  );
}
