'use client';

import { MiniGrafo } from '@/components/molecules/MiniGrafo';
import {
  type EspecificacionGrafico,
  FORMAS,
  type FormaGrafico,
  METRICAS,
  type Metrica,
  etiquetaDelRango,
  validarGrafico,
} from '@/lib/widgets';
import { Button, Input, Select, alpha, colors } from '@praxis/commons';
import { useState } from 'react';

const METRICAS_ORDENADAS = Object.keys(METRICAS) as Metrica[];

/** El rango por defecto cuando la métrica lo acepta. */
const DIAS_POR_DEFECTO = 60;
/** Y el umbral de parón, que se llama igual y significa otra cosa. */
const DIAS_DE_PARON = 7;

/**
 * El constructor de grafos a medida.
 *
 * ## Por qué existe, teniendo ya a PRAX
 *
 * Porque pedírselo hablando **depende de saber pedirlo y de tener cuota**. El
 * catálogo de diez métricas por cinco formas estaba entero detrás de una
 * conversación: quien no sabía que existía «tareas paradas por columna» no tenía
 * forma de descubrirlo, y quien gastara la cuota del día se quedaba sin ninguno.
 * Los dos caminos se quedan —es la decisión 1 del plan— y este es el que
 * funciona sin modelo, sin cuota y sin acertar con las palabras.
 *
 * ## Y produce exactamente lo mismo que la propuesta del asistente
 *
 * El mismo `EspecificacionGrafico`, validado por el mismo `validarGrafico`, y
 * guardado por la misma ruta. No hay un camino «de la pantalla» y otro «del
 * modelo»: hay una parametrización y dos formas de escribirla. Si divergieran,
 * un grafo hecho a mano y otro pedido hablando podrían dibujar cosas distintas
 * con el mismo título.
 *
 * ## ⚠️ La forma se elige por su dibujo, no en un desplegable
 *
 * Y es el cambio que más se nota. «Área apilada» dentro de una lista desplegable
 * obliga a saber qué significan esas dos palabras **antes** de poder elegir; en
 * una fila de miniaturas se reconoce la que hace falta sin leer ninguna. Además
 * las inválidas no aparecen: las formas salen de `METRICAS[metrica].formas`, así
 * que la fila cambia al cambiar de métrica y nunca ofrece lo que el backend
 * rechazaría.
 *
 * La métrica sí es un desplegable, porque diez opciones que solo se distinguen
 * por su nombre no se representan mejor con dibujos: las diez saldrían iguales.
 *
 * ## Los desplegables no ofrecen lo imposible
 *
 * El rango, el top N y «solo vencidas» solo aparecen si esa métrica los acepta.
 * Es la otra mitad de un conjunto cerrado: uno que deja componer combinaciones
 * inválidas y luego las rechaza no es un conjunto cerrado, es un formulario con
 * trampas.
 *
 * `validarGrafico` sigue corriendo antes de añadir, porque el catálogo puede
 * quedarse corto —el título, por ejemplo, no lo acota ningún desplegable— y
 * porque es la misma comprobación que hará el backend.
 */
export function ChartBuilder({
  onAnadir,
  onCancelar,
}: {
  onAnadir: (grafico: EspecificacionGrafico) => void;
  onCancelar: () => void;
}) {
  const [metrica, setMetrica] = useState<Metrica>('tareas_por_columna');
  const [forma, setForma] = useState<FormaGrafico>('barras');
  const [dias, setDias] = useState(String(DIAS_POR_DEFECTO));
  const [topN, setTopN] = useState('');
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [titulo, setTitulo] = useState(METRICAS.tareas_por_columna.etiqueta);
  const [error, setError] = useState<string | null>(null);

  const spec = METRICAS[metrica];

  /**
   * Cambiar de métrica **rehace la forma y el título**.
   *
   * ⚠️ Sin esto se puede quedar puesta una forma que la métrica nueva no acepta
   * —de «tareas por columna» en dona a «cierres por semana», que no admite
   * dona— y el error solo aparecería al pulsar «Añadir». El título arrastrado es
   * peor todavía: un grafo de cierres semanales rotulado «Tareas por columna» se
   * lee mal y nadie lo revisa.
   *
   * El título solo se pisa si es el que puso este mismo desplegable. Lo que haya
   * escrito una persona no se toca.
   */
  function elegirMetrica(siguiente: Metrica) {
    const nueva = METRICAS[siguiente];
    setMetrica(siguiente);
    if (!nueva.formas.includes(forma)) setForma(nueva.formas[0] as FormaGrafico);
    if (Object.values(METRICAS).some((m) => m.etiqueta === titulo)) setTitulo(nueva.etiqueta);
    if (siguiente === 'paradas_por_columna') setDias(String(DIAS_DE_PARON));
    else if (metrica === 'paradas_por_columna') setDias(String(DIAS_POR_DEFECTO));
    if (!nueva.aceptaSoloVencidas) setSoloVencidas(false);
    if (!nueva.aceptaTopN) setTopN('');
    setError(null);
  }

  function anadir() {
    const grafico: EspecificacionGrafico = {
      metrica,
      forma,
      titulo: titulo.trim(),
      /* Los tres opcionales solo viajan si la métrica los admite **y** hay algo
         que mandar: el backend rechaza un campo que su métrica no acepta, así
         que un `dias` arrastrado de la métrica anterior sería un 400. */
      ...(spec.aceptaRango && dias ? { dias: Number(dias) } : {}),
      ...(spec.aceptaTopN && topN ? { topN: Number(topN) } : {}),
      ...(spec.aceptaSoloVencidas && soloVencidas ? { soloVencidas: true } : {}),
    };

    const motivo = validarGrafico(grafico);
    if (motivo) {
      setError(motivo);
      return;
    }
    onAnadir(grafico);
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Qué medir"
            fullWidth
            options={METRICAS_ORDENADAS.map((clave) => ({
              value: clave,
              label: METRICAS[clave].etiqueta,
            }))}
            value={metrica}
            onValueChange={(valor) => elegirMetrica(valor as Metrica)}
          />

          <Input
            label="Título"
            maxLength={80}
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
          />
        </div>

        {/* La fila de formas. Solo las que esta métrica admite. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-sans text-sm font-medium text-text-primary">
            Cómo dibujarlo
          </legend>
          <div className="flex flex-wrap gap-2">
            {spec.formas.map((clave) => {
              const elegida = clave === forma;
              return (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setForma(clave)}
                  aria-pressed={elegida}
                  title={FORMAS[clave]}
                  className="flex flex-col items-center gap-1 rounded-xl border p-2 transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: elegida ? colors.primary : colors.border,
                    background: elegida ? alpha(colors.primary, 10) : 'transparent',
                  }}
                >
                  <MiniGrafo vista={clave} tono={elegida ? colors.primary : colors.textSecondary} />
                  {/* El nombre debajo y no solo el `title`: un dibujo sin
                      palabra no se puede nombrar en voz alta ni buscar en la
                      documentación, y el `title` no existe para el teclado. */}
                  <span
                    className="font-sans text-[11px]"
                    style={{ color: elegida ? colors.primary : colors.textSecondary }}
                  >
                    {FORMAS[clave]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {(spec.aceptaRango || spec.aceptaTopN || spec.aceptaSoloVencidas) && (
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            {spec.aceptaRango && (
              <Input
                type="number"
                min={1}
                max={365}
                label={etiquetaDelRango(metrica)}
                value={dias}
                onChange={(evento) => setDias(evento.target.value)}
              />
            )}

            {spec.aceptaTopN && (
              <Input
                type="number"
                min={2}
                max={20}
                label="Quedarse con las N mayores"
                placeholder="todas"
                value={topN}
                onChange={(evento) => setTopN(evento.target.value)}
              />
            )}

            {spec.aceptaSoloVencidas && (
              <label className="flex h-10 w-max cursor-pointer items-center gap-2 font-sans text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={soloVencidas}
                  onChange={(evento) => setSoloVencidas(evento.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Solo las vencidas
              </label>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="font-sans text-sm text-error">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={anadir}>Añadir al lienzo</Button>
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>

      {/**
       * La vista previa: qué vas a añadir, antes de añadirlo.
       *
       * ⚠️ **Enseña la forma y el rótulo, nunca datos.** Pintar aquí una muestra
       * del proyecto obligaría a pedir el agregado en cada pulsación de tecla, y
       * —peor— en un proyecto sin historial saldría plana: una previsualización a
       * cero se lee como «este grafo no sirve» cuando lo que pasa es que aún no
       * hay nada que enseñar. Lo que esta tarjeta promete es **el marco**, que es
       * lo único que se puede prometer sin mentir.
       */}
      <aside className="w-full shrink-0 lg:w-64">
        <p className="mb-2 font-sans text-xs uppercase tracking-wider text-text-disabled">
          Así entrará en el lienzo
        </p>
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
          <p className="truncate font-display text-base text-text-primary" title={titulo}>
            {titulo || 'Sin título'}
          </p>
          <p className="font-sans text-xs leading-relaxed text-text-disabled">{spec.descripcion}</p>
          <div
            className="flex items-center justify-center rounded-xl py-4"
            style={{ background: alpha(colors.primary, 6) }}
          >
            <MiniGrafo vista={forma} />
          </div>
          <p className="font-sans text-xs text-text-secondary">
            {FORMAS[forma]} · {spec.etiqueta}
            {spec.aceptaRango && dias ? ` · ${dias} días` : ''}
            {spec.aceptaTopN && topN ? ` · top ${topN}` : ''}
            {spec.aceptaSoloVencidas && soloVencidas ? ' · solo vencidas' : ''}
          </p>
        </div>
      </aside>
    </div>
  );
}
