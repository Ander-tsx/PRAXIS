'use client';

import { useState } from 'react';
import { TEMPLATE_BRIEF_MAX, TEMPLATE_BRIEF_MIN, TEMPLATE_TWEAK_MAX, projectHref } from '../../api';
import type {
  ProjectPermission,
  ProjectTemplate,
  TemplateColumn,
  TemplateQuota,
  TemplateResult,
} from '../../api/domain';
import { PERMISSION_LABELS, PROJECT_PERMISSIONS } from '../../api/domain';
import { Button, Input, Textarea } from '../../atoms';
import { alpha, colors } from '../../tokens';
import { Aviso, TemplatePlanReview, TemplateResultSummary, podar } from '../TemplatePlanReview';
import type { AplicarPlantillaAction, TemplateDraftAction } from './project-form';
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX } from './project-form';

/**
 * Crear un proyecto contándoselo al asistente.
 *
 * ## Tres pasos, y el de en medio es el que importa
 *
 * `contar` → `revisar` → `hecho`. El del medio no es una cortesía: es **la
 * regla de §26.1 puesta en pantalla**. La IA propone y no ejecuta; lo que crea
 * el proyecto son N llamadas a los endpoints de siempre, y esas no salen hasta
 * que alguien ha visto lo que se va a crear y ha quitado lo que no quiere.
 *
 * Un botón que dijera «crear con IA» y montara veinte cosas de golpe sería la
 * misma capacidad con la revisión quitada, que es justo lo que este producto
 * decidió no hacer.
 *
 * ## Qué se puede editar, y qué no
 *
 * El nombre y la descripción se escriben; **todo lo demás se incluye o se
 * quita**. Un editor completo de cada columna y cada permiso sería rehacer aquí
 * las cuatro pantallas que ya existen para eso — y existen: en cuanto el
 * proyecto está creado, cada cosa se edita donde vive. Lo que hace falta antes
 * de crear es poder decir «esto no», que es lo que se ofrece.
 *
 * ⚠️ **Quitar un espacio se lleva sus tableros, y un tablero sus columnas.** No
 * se marcan uno a uno: al aplicar se poda el subárbol. Enseñar los hijos
 * tachados de un padre excluido solo sirve para que alguien crea que se van a
 * crear igual.
 */

type Paso = 'contar' | 'revisar' | 'hecho';

export interface AssistedTemplateProps {
  borradorAction: TemplateDraftAction;
  aplicarAction: AplicarPlantillaAction;
  /** Para volver al modo manual desde el estado inicial. */
  onCancelar: () => void;
}

export function AssistedTemplate({
  borradorAction,
  aplicarAction,
  onCancelar,
}: AssistedTemplateProps) {
  const [paso, setPaso] = useState<Paso>('contar');
  const [brief, setBrief] = useState('');
  const [plantilla, setPlantilla] = useState<ProjectTemplate | null>(null);
  const [cuota, setCuota] = useState<TemplateQuota | null>(null);
  const [resultado, setResultado] = useState<TemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinCuota, setSinCuota] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  /** Lo que se ha quitado del plan, por clave. Ver el aviso de arriba. */
  const [excluido, setExcluido] = useState<Set<string>>(new Set());

  function alternar(clave: string) {
    setExcluido((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(clave)) ahora.delete(clave);
      else ahora.add(clave);
      return ahora;
    });
  }

  /**
   * Pide un plan, o retoca el que ya hay.
   *
   * Con `ajuste` se le manda al modelo el plan anterior **y** lo que hay que
   * cambiar, así que es un segundo turno de la misma conversación. Sin él
   * genera de cero. Cuesta una consulta de cuota en los dos casos: es una
   * llamada a Gemini igual.
   */
  async function pedir(ajuste?: string) {
    setTrabajando(true);
    setError(null);
    setSinCuota(false);

    const respuesta =
      ajuste && plantilla
        ? await borradorAction(brief, { texto: ajuste, previa: plantilla })
        : await borradorAction(brief);

    setTrabajando(false);

    if (!respuesta.resultado) {
      setError(respuesta.error);
      setSinCuota(respuesta.sinCuota);
      return;
    }

    setPlantilla(respuesta.resultado.plantilla);
    setCuota(respuesta.resultado.cuota);
    /**
     * ⚠️ **Las exclusiones se reinician con cada plan nuevo, y tiene que ser
     * así.** Son posiciones (`w1b0c2`), no identidades: conservarlas sobre una
     * estructura recién generada quitaría lo que hubiera caído en esa posición,
     * que casi nunca es lo mismo. Perder dos clics es infinitamente mejor que
     * crear un proyecto al que le falta algo que nadie quitó.
     */
    setExcluido(new Set());
    setPaso('revisar');
  }

  async function crear() {
    if (!plantilla) return;

    setTrabajando(true);
    setError(null);

    const respuesta = await aplicarAction(podar(plantilla, excluido));

    setTrabajando(false);
    setResultado(respuesta);

    /* Con proyecto se pasa al resumen aunque haya fallos: el proyecto existe y
       esconderlo detrás de un error sería mentir sobre lo que hay creado. */
    if (respuesta.proyecto) setPaso('hecho');
    else setError(respuesta.error);
  }

  const restantes = cuota ? Math.max(0, cuota.limite - cuota.usados) : null;

  if (paso === 'hecho' && resultado?.proyecto) {
    return <TemplateResultSummary resultado={resultado} />;
  }

  if (paso === 'revisar' && plantilla) {
    return (
      <div className="flex flex-col gap-4">
        <TemplatePlanReview
          plantilla={plantilla}
          excluido={excluido}
          onAlternar={alternar}
          onCambiarNombre={(nombre) => setPlantilla({ ...plantilla, nombre })}
          onCambiarDescripcion={(descripcion) => setPlantilla({ ...plantilla, descripcion })}
        />

        <Ajuste onPedir={pedir} trabajando={trabajando} restantes={restantes} />

        {error && <Aviso texto={error} />}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="mr-auto font-sans text-xs text-text-secondary">
            Nada de esto existe todavía.
          </span>
          <Button type="button" variant="ghost" onClick={() => setPaso('contar')}>
            Volver
          </Button>
          <Button type="button" onClick={crear} isLoading={trabajando}>
            Crear proyecto
          </Button>
        </div>
      </div>
    );
  }

  const largo = brief.trim().length;
  const listo = largo >= TEMPLATE_BRIEF_MIN && !trabajando;

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        label="Cuéntale de qué va tu proyecto"
        placeholder={
          'A qué se dedica tu equipo, cuántos sois y quién hace qué, cómo trabajáis hoy ' +
          'y qué necesitas tener organizado desde el primer día. Cuanto más concreto, ' +
          'mejor sale la plantilla.'
        }
        value={brief}
        onChange={(evento) => setBrief(evento.target.value)}
        maxLength={TEMPLATE_BRIEF_MAX}
        rows={7}
        showCount
        fullWidth
      />

      <p className="font-sans text-xs text-text-secondary">
        El asistente <strong>propone</strong>: verás la estructura completa y podrás quitar lo que
        no quieras antes de que se cree nada.
      </p>

      {error && <Aviso texto={error} accion={sinCuota ? null : 'Vuelve a intentarlo.'} />}

      <div className="mt-2 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        {/* `() => pedir()` y no `pedir`: como `ajuste` es opcional, pasarlo
            directo le colaba el `MouseEvent` como texto del ajuste. */}
        <Button type="button" onClick={() => pedir()} isLoading={trabajando} disabled={!listo}>
          Proponer plantilla
        </Button>
      </div>
    </div>
  );
}

/**
 * Seguir hablando con el asistente sobre el plan que ya propuso.
 *
 * ## Por qué es una caja de texto y no un chat con burbujas
 *
 * Lo que se está revisando **es** la respuesta: el árbol de arriba se
 * reemplaza entero con cada ajuste. Un hilo de mensajes obligaría a leer la
 * conversación para saber qué versión estás mirando, cuando la versión la
 * tienes delante. Aquí solo hace falta el turno siguiente.
 *
 * ⚠️ **Gasta una consulta de cuota**, igual que la primera: es una llamada a
 * Gemini como cualquier otra. Se dice al lado del botón, y no después de
 * pulsarlo.
 */
function Ajuste({
  onPedir,
  trabajando,
  restantes,
}: {
  onPedir: (ajuste: string) => void;
  trabajando: boolean;
  restantes: number | null;
}) {
  const [texto, setTexto] = useState('');

  const listo = texto.trim().length > 0 && !trabajando && restantes !== 0;

  function enviar() {
    if (!listo) return;
    onPedir(texto.trim());
    setTexto('');
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <label className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
        ¿Le cambiarías algo?
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <span className="min-w-56 flex-1">
          <Input
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Añade un tablero para el equipo de diseño, y quita el rol de becario"
            maxLength={TEMPLATE_TWEAK_MAX}
            fullWidth
            onKeyDown={(evento) => {
              if (evento.key !== 'Enter') return;
              evento.preventDefault();
              enviar();
            }}
          />
        </span>

        <Button type="button" variant="secondary" onClick={enviar} disabled={!listo}>
          Ajustar
        </Button>
      </div>

      <p className="font-sans text-xs text-text-secondary">
        {restantes === 0
          ? 'Se te han acabado las consultas de este mes. Puedes crear el proyecto tal y como está.'
          : `Rehace la propuesta con tu cambio. Gasta una consulta${
              restantes === null ? '' : `; te quedan ${restantes}`
            }.`}
      </p>
    </div>
  );
}
