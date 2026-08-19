'use client';

import {
  type EspecificacionGrafico,
  FORMAS,
  type FormaGrafico,
  METRICAS,
  type Metrica,
  etiquetaDelRango,
  validarGrafico,
} from '@/lib/widgets';
import { Button, Input, Select } from '@praxis/commons';
import { useState } from 'react';

const METRICAS_ORDENADAS = Object.keys(METRICAS) as Metrica[];

/** El rango por defecto cuando la métrica lo acepta. */
const DIAS_POR_DEFECTO = 60;
/** Y el umbral de parón, que se llama igual y significa otra cosa. */
const DIAS_DE_PARON = 7;

/**
 * El constructor de gráficos a medida.
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
 * un gráfico hecho a mano y otro pedido hablando podrían dibujar cosas distintas
 * con el mismo título.
 *
 * ## Los desplegables no ofrecen lo imposible
 *
 * Las formas salen de `METRICAS[metrica].formas`, y el rango, el top N y «solo
 * vencidas» solo aparecen si esa métrica los acepta. Es la otra mitad de un
 * conjunto cerrado: uno que deja componer combinaciones inválidas y luego las
 * rechaza no es un conjunto cerrado, es un formulario con trampas.
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
   * peor todavía: un gráfico de cierres semanales rotulado «Tareas por columna»
   * se lee mal y nadie lo revisa.
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
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg text-text-primary">Uno a medida</h3>
        <p className="font-sans text-sm text-text-secondary">
          Elige qué medir y cómo dibujarlo. Sale de los mismos datos que el resto del lienzo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* Solo las formas que esta métrica admite. Ver el bloque de arriba. */}
        <Select
          label="Cómo dibujarlo"
          fullWidth
          options={spec.formas.map((clave) => ({ value: clave, label: FORMAS[clave] }))}
          value={forma}
          onValueChange={(valor) => setForma(valor as FormaGrafico)}
        />

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

        <Input
          label="Título"
          maxLength={80}
          value={titulo}
          onChange={(evento) => setTitulo(evento.target.value)}
        />
      </div>

      {spec.aceptaSoloVencidas && (
        <label className="flex w-max cursor-pointer items-center gap-2 font-sans text-sm text-text-primary">
          <input
            type="checkbox"
            checked={soloVencidas}
            onChange={(evento) => setSoloVencidas(evento.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Solo las vencidas
        </label>
      )}

      <p className="font-sans text-xs leading-relaxed text-text-secondary">{spec.descripcion}</p>

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
  );
}
