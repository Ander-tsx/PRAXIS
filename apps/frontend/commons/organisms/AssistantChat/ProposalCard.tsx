'use client';

import { useRouter } from 'next/navigation';
import { Fragment, createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  AssignmentProposal,
  AutomationProposal,
  AutomationStateProposal,
  BoardProposal,
  CheckStepsProposal,
  ChecklistProposal,
  CommentProposal,
  DeleteProposal,
  DocumentProposal,
  DocumentRevisionProposal,
  EditProposal,
  EstadoPropuesta,
  MessageProposal,
  MoveProposal,
  OpenProjectProposal,
  PlanningProposal,
  PrivateMessageProposal,
  QuestionProposal,
  SprintProposal,
  StartSprintProposal,
  TaskProposal,
  TemplateProposal,
  TaskBatchProposal,
  DeleteBatchProposal,
} from '../../api/assistant';
import { claveDeRevisionDePrax } from '../../api/assistant';
import {
  PRIORITY_LABELS,
  type Priority,
  type ProjectTemplate,
  type TemplateResult,
} from '../../api/domain';
import {
  type AceptarSobreTareaState,
  aceptarAsignacionAction,
  aceptarAutomatizacionAction,
  aceptarBorradoAction,
  aceptarBorradosAction,
  aceptarChecklistAction,
  aceptarComentarioAction,
  aceptarDocumentoAction,
  aceptarEdicionAction,
  aceptarEstadoAutomatizacionAction,
  aceptarInicioSprintAction,
  aceptarMarcarPasosAction,
  aceptarMensajeAction,
  aceptarMensajePrivadoAction,
  aceptarMovimientoAction,
  aceptarPlanificacionAction,
  aceptarPlantillaAction,
  aceptarSprintAction,
  aceptarTableroAction,
  aceptarLoteDeTareasAction,
  aceptarTareaAction,
  resolverPropuestaAction,
} from '../../assistant/actions';
import { Badge, Button } from '../../atoms';
import { alpha, colors } from '../../tokens';
import { TemplatePlanReview, TemplateResultSummary, podar } from '../TemplatePlanReview';
import { ModelText } from './ModelText';

/**
 * La tarjeta de una propuesta: **lo que se va a crear, antes de que exista.**
 *
 * Es la pieza donde se paga la decisión de que la IA proponga en vez de
 * ejecutar. Por eso enseña los campos uno a uno —título, columna, prioridad,
 * encargado, etiquetas, fecha— y no un resumen en prosa: quien pulsa «Aceptar»
 * tiene que poder ver exactamente lo que va a pasar, no fiarse de que el modelo
 * lo haya contado bien.
 *
 * **El porqué se pinta aquí, dentro de cada tarjeta.** Estuvo solo en la burbuja
 * de encima, como texto libre del asistente, y con una propuesta por respuesta
 * colaba: el párrafo de arriba justificaba la única tarjeta de abajo. En cuanto
 * el modelo empezó a proponer varias a la vez —repartir cinco tareas sin
 * encargado es una llamada por tarea— dejó de casar: un bloque de razones
 * arriba y N tarjetas debajo no se pueden emparejar leyendo.
 *
 * Por eso `porQue` es un parámetro **obligatorio** de las dos herramientas (ver
 * `tools.ts`) y no una recomendación del prompt: para que cada propuesta llegue
 * con la suya pegada y no dependa de que el modelo escriba además un texto que
 * las cubra todas.
 *
 * Va **entre los hechos y los botones**, que es el orden en que se decide: qué
 * va a pasar, por qué se propone, y entonces aceptar o descartar.
 */

export type Estado = 'pendiente' | 'enviando' | 'hecho' | 'descartada';

/**
 * Por dónde una tarjeta cuenta en qué estado está.
 *
 * Lo necesita el grupo que las apila: para pintar el punto de cada una y para
 * saber cuántas quedan sin decidir tiene que conocer un estado que vive dentro
 * de cada tarjeta. Va por contexto igual que la señal de aceptar todas, y por lo
 * mismo: `Marco` es el único sitio que hay que tocar.
 *
 * `null` cuando nadie escucha —una tarjeta suelta fuera de un grupo—, y ahí no
 * se informa a nadie.
 */
export const RegistroDeEstado = createContext<((estado: Estado) => void) | null>(null);

/**
 * Señal de «aceptar todas», como contador.
 *
 * Va por contexto y no por props porque cada tarjeta guarda su propio estado y
 * su propia función de aceptar: para dispararlas desde fuera habría que subir
 * ese estado a quien las pinta y reescribir las seis. Con el contexto, lo único
 * que lo escucha es `Marco`, que ya lo envuelve todo — un sitio en lugar de
 * seis.
 *
 * **Es un contador y no un booleano** a propósito: aceptar todas dos veces
 * seguidas en la misma conversación tiene que volver a disparar, y un `true`
 * que ya estaba en `true` no cambia nada y el efecto no se ejecutaría.
 */
export const SenalDeAceptarTodas = createContext(0);

/**
 * Las seis familias de propuesta (D12 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Cada una con su acento y su icono, para que en una fila de tarjetas se
 * distinga de un vistazo qué crea, qué cambia y qué borra. El borde es morado
 * en todas —es PRAX proponiendo— menos en el borrado, que es rojo: el rojo solo
 * significa «no se deshace» mientras lo lleve una sola familia.
 */
export type Familia = 'crear' | 'cambiar' | 'mover' | 'comunicar' | 'analizar' | 'destruir';

const FAMILIA_DE_HERRAMIENTA: Record<string, Familia> = {
  proponer_tarea: 'crear',
  proponer_tablero: 'crear',
  proponer_sprint: 'crear',
  proponer_documento: 'crear',
  proponer_plantilla: 'crear',
  proponer_automatizacion: 'crear',
  proponer_edicion: 'cambiar',
  proponer_asignacion: 'cambiar',
  proponer_checklist: 'cambiar',
  proponer_revision_documento: 'cambiar',
  proponer_estado_automatizacion: 'cambiar',
  proponer_tareas: 'crear',
  proponer_movimiento: 'mover',
  proponer_marcar_pasos: 'mover',
  proponer_planificacion: 'mover',
  proponer_iniciar_sprint: 'mover',
  proponer_comentario: 'comunicar',
  proponer_mensaje: 'comunicar',
  proponer_mensaje_privado: 'comunicar',
  proponer_pregunta: 'analizar',
  proponer_abrir_proyecto: 'analizar',
  proponer_borrado: 'destruir',
  proponer_borrados: 'destruir',
};

export function familiaDe(tool: string): Familia {
  return FAMILIA_DE_HERRAMIENTA[tool] ?? 'cambiar';
}

const ESTILO_DE_FAMILIA: Record<Familia, { acento: string; icono: string; nombre: string }> = {
  crear: { acento: colors.primary, icono: '+', nombre: 'Crear' },
  cambiar: { acento: colors.info, icono: '✎', nombre: 'Cambiar' },
  mover: { acento: colors.accent, icono: '→', nombre: 'Mover' },
  comunicar: { acento: colors.info, icono: '✉', nombre: 'Comunicar' },
  analizar: { acento: colors.accent, icono: '?', nombre: 'Preguntar' },
  destruir: { acento: colors.error, icono: '×', nombre: 'Borrar' },
};

/**
 * Qué familia es la tarjeta y en qué puesto llega. Lo pone `AssistantChat` una
 * vez por propuesta, y lo lee `Marco`: así ninguna de las veinte tarjetas tiene
 * que saberlo.
 */
export const FamiliaDePropuesta = createContext<{ familia: Familia; indice: number }>({
  familia: 'cambiar',
  indice: 0,
});

interface Resultado {
  texto: string;
  href: string | null;
}

export interface ProposalCardProps {
  projectId: string;
  /**
   * Id de la propuesta guardada. Con él se anota lo que se decide.
   *
   * Opcional porque una propuesta podría llegar sin él si el guardado falló: la
   * tarjeta funciona igual, solo que su decisión no queda anotada y al releer
   * volverá a ofrecer sus botones.
   */
  proposalId?: string | undefined;
  /**
   * Lo que se decidió la última vez, si esto viene de una conversación vieja.
   *
   * Solo `PENDING` —o ausente, que es lo que llega en un turno nuevo— conserva
   * los botones. Ver `Marco`.
   */
  estadoGuardado?: EstadoPropuesta;
  /** `userId` → nombre para mostrar. Sin entrada, se enseña el id recortado. */
  nombres: Record<string, string>;
  /** `labelId` → nombre de la etiqueta. */
  etiquetas: Record<string, string>;
  /**
   * La conversación de PRAX donde está la tarjeta. La usan las de mensaje para
   * que el gateway los firme «enviado con PRAX» (D13).
   */
  conversationId?: string | null;
}

export function TaskProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  nombres,
  etiquetas,
}: ProposalCardProps & { propuesta: TaskProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarTareaAction(projectId, propuesta);

    if (respuesta.error || !respuesta.creada) {
      setError(respuesta.error ?? 'No se pudo crear la tarea.');
      setEstado('pendiente');
      return;
    }

    setResultado({
      texto: `Creada «${respuesta.creada.title}».`,
      /* A otra zona del multi-zone: `<a>` y no `next/link`, que le pondría el
         basePath de reportes delante. */
      href: `/projects/${projectId}?board=${respuesta.creada.boardId}&task=${respuesta.creada.id}`,
    });
    setEstado('hecho');
  }

  const encargados = (propuesta.assigneeIds ?? []).map((id) => nombres[id] ?? id.slice(0, 8));
  /**
   * ⚠️ **El `id` viaja con el nombre, y es lo que sirve de clave.**
   *
   * Esto era una lista de nombres a secas, con el `<Badge>` keyed por el nombre.
   * Y el nombre **no es único**: una etiqueta que no esté en el mapa cae a
   * «etiqueta», así que dos desconocidas daban dos hijos con la misma clave y
   * React avisaba en consola —«two children with the same key, `etiqueta`»— con
   * el riesgo real de duplicar u omitir una insignia. El `id` sí es único por
   * construcción, y ya estaba a mano.
   *
   * Que una etiqueta no esté en el mapa es normal, no un fallo: el mapa lo
   * resuelve el servidor por proyecto, y el modelo puede proponer una de una
   * conversación anterior.
   */
  const marcas = (propuesta.labelIds ?? []).map((id) => ({
    id,
    nombre: etiquetas[id] ?? 'etiqueta',
  }));

  return (
    <Marco
      titulo="Tarea propuesta"
      sinAplicar="nada existe todavía"
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-base font-semibold text-text-primary">{propuesta.title}</p>

      {propuesta.description && (
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          {propuesta.description}
        </p>
      )}

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* El tablero antes que la columna: es lo que sitúa. Sin él, «Por hacer»
            puede ser cualquiera de los cuatro tableros del proyecto. */}
        {propuesta.boardName && <Campo termino="Tablero" valor={propuesta.boardName} />}
        <Campo termino="Columna" valor={propuesta.columnName} />
        <Campo
          termino="Prioridad"
          valor={PRIORITY_LABELS[propuesta.priority as Priority] ?? propuesta.priority}
        />
        {propuesta.dueDate && <Campo termino="Vence" valor={formatoFecha(propuesta.dueDate)} />}
        {typeof propuesta.estimatePoints === 'number' && (
          <Campo termino="Puntos" valor={String(propuesta.estimatePoints)} />
        )}
        {encargados.length > 0 && <Campo termino="Para" valor={encargados.join(', ')} />}
      </dl>

      {marcas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {marcas.map((marca) => (
            <Badge key={marca.id} variant="primary">
              {marca.nombre}
            </Badge>
          ))}
        </div>
      )}
    </Marco>
  );
}

/**
 * Un lote de tareas (`proponer_tareas`): una tarjeta, una fila por tarea.
 *
 * Filas y no tarjetas (kyloo-design §13): el título con su nomenclatura, los
 * puntos y la prioridad, y la descripción debajo en pequeño. Con más de diez se
 * enseñan las primeras y el resto se despliega, para que el lote no ocupe la
 * conversación entera antes de decidir.
 */
export function TaskBatchProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: TaskBatchProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [todas, setTodas] = useState(false);
  const total = propuesta.tareas.length;
  const puntos = propuesta.tareas.reduce((suma, t) => suma + (t.estimatePoints ?? 0), 0);
  const visibles = todas ? propuesta.tareas : propuesta.tareas.slice(0, 10);

  async function aceptar() {
    setEstado('enviando');
    setError(null);
    const respuesta = await aceptarLoteDeTareasAction(projectId, propuesta);
    if (respuesta.error) {
      setError(respuesta.error);
      setEstado('pendiente');
      return;
    }
    setResultado({
      texto:
        respuesta.fallidas.length === 0
          ? `Creadas ${respuesta.creadas} tareas.`
          : `Creadas ${respuesta.creadas}; no entraron: ${respuesta.fallidas.join(', ')}.`,
      href: respuesta.boardId ? `/projects/${projectId}?board=${respuesta.boardId}` : null,
    });
    setEstado('hecho');
  }

  return (
    <Marco
      titulo={`Crear ${total} ${total === 1 ? 'tarea' : 'tareas'}`}
      sinAplicar="nada existe todavía"
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {propuesta.boardName && <Campo termino="Tablero" valor={propuesta.boardName} />}
        <Campo
          termino={propuesta.alBacklog ? 'Backlog' : 'Columna'}
          valor={propuesta.alBacklog ? 'sin sprint' : propuesta.columnName}
        />
        {puntos > 0 && <Campo termino="Puntos" valor={String(puntos)} />}
      </dl>

      <ol className="flex flex-col gap-1">
        {visibles.map((tarea, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: el lote no cambia de orden
            key={i}
            className="flex flex-col gap-0.5 rounded-lg px-3 py-2"
            style={{ background: alpha(colors.textPrimary, 4) }}
          >
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 font-sans text-sm font-medium text-text-primary">
                {tarea.title}
              </span>
              {typeof tarea.estimatePoints === 'number' && (
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-secondary">
                  {tarea.estimatePoints} pt
                </span>
              )}
              <span className="shrink-0 font-sans text-[11px] text-text-disabled">
                {PRIORITY_LABELS[tarea.priority as Priority] ?? tarea.priority}
              </span>
            </div>
            {tarea.description && (
              <p className="line-clamp-2 font-sans text-xs leading-relaxed text-text-secondary">
                {tarea.description}
              </p>
            )}
          </li>
        ))}
      </ol>

      {total > 10 && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="self-start font-sans text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {todas ? 'Ver menos' : `Ver las ${total - 10} restantes`}
        </button>
      )}
    </Marco>
  );
}

export function AssignProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  nombres,
}: ProposalCardProps & { propuesta: AssignmentProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarAsignacionAction(projectId, propuesta);

    if (respuesta.error || !respuesta.asignada) {
      setError(respuesta.error ?? 'No se pudo cambiar el encargado.');
      setEstado('pendiente');
      return;
    }

    setResultado({
      texto: `«${respuesta.asignada.title}» queda con ${
        respuesta.asignada.cuantos === 1
          ? '1 encargado'
          : `${respuesta.asignada.cuantos} encargados`
      }.`,
      href: `/projects/${projectId}?board=${respuesta.asignada.boardId}&task=${respuesta.asignada.id}`,
    });
    setEstado('hecho');
  }

  const quedan = propuesta.assigneeIds.map((id) => nombres[id] ?? id.slice(0, 8));

  return (
    <Marco
      titulo="Cambio de encargado propuesto"
      /* La tarea existe desde antes: lo que no se ha aplicado es el cambio. */
      sinAplicar="sin aplicar"
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-sm text-text-secondary">
        {/* Con el inventario en el contexto la propuesta ya viaja con el
            título. El id recortado se queda de reserva: identificaba la tarea
            para quien la escribió a mano, no para quien decide si acepta. */}
        {propuesta.taskTitle ? (
          <>
            <strong className="text-text-primary">{propuesta.taskTitle}</strong> pasaría a{' '}
          </>
        ) : (
          <>
            La tarea{' '}
            <code className="font-mono text-xs text-text-primary">
              {propuesta.taskId.slice(0, 8)}
            </code>{' '}
            pasaría a{' '}
          </>
        )}
        <strong className="text-text-primary">
          {quedan.length > 0 ? quedan.join(', ') : 'nadie'}
        </strong>
        .
      </p>
      {/* La lista sustituye, no añade: hay que decirlo antes de aceptar, no
          después de que alguien desaparezca de una tarea sin enterarse. */}
      <p className="font-sans text-xs text-text-secondary">
        {quedan.length > 0
          ? 'Quien no esté en esa lista deja de estar asignado.'
          : 'La tarea se quedaría sin nadie asignado.'}
      </p>
    </Marco>
  );
}

/**
 * La tarjeta de las cuatro propuestas que actúan sobre una tarea que ya existe:
 * editar, mover, checklist y comentario.
 *
 * Las cuatro comparten forma —una tarea identificada por su título, un cuerpo
 * que describe el cambio y el mismo resultado al aceptar— así que comparten
 * componente y solo se diferencian en el `titulo`, el `children` y qué acción
 * llaman. Escribirlas cuatro veces habría sido cuatro sitios donde arreglar el
 * mismo error de copia.
 *
 * Todas dicen **«sin aplicar»** y no «nada existe todavía»: la tarea existe
 * desde antes, lo que falta es el cambio.
 */
function CambioSobreTarea({
  titulo,
  taskId,
  taskTitle,
  porQue,
  ejecutar,
  projectId,
  proposalId,
  estadoGuardado,
  children,
}: {
  titulo: string;
  taskId: string;
  taskTitle?: string;
  porQue?: string;
  ejecutar: () => Promise<AceptarSobreTareaState>;
  projectId: string;
  proposalId?: string | undefined;
  estadoGuardado?: EstadoPropuesta;
  children: React.ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await ejecutar();

    if (respuesta.error || !respuesta.hecha) {
      setError(respuesta.error ?? 'No se pudo aplicar el cambio.');
      setEstado('pendiente');
      return;
    }

    setResultado({
      texto: respuesta.hecha.detalle,
      href: `/projects/${projectId}?board=${respuesta.hecha.boardId}&task=${respuesta.hecha.id}`,
    });
    setEstado('hecho');
  }

  return (
    <Marco
      titulo={titulo}
      sinAplicar="sin aplicar"
      porQue={porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-sm text-text-secondary">
        {taskTitle ? (
          <strong className="text-text-primary">{taskTitle}</strong>
        ) : (
          <code className="font-mono text-xs text-text-primary">{taskId.slice(0, 8)}</code>
        )}
      </p>
      {children}
    </Marco>
  );
}

export function EditProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  etiquetas,
}: ProposalCardProps & { propuesta: EditProposal }) {
  /**
   * ⚠️ **El `id` viaja con el nombre, y es lo que sirve de clave.**
   *
   * Esto era una lista de nombres a secas, con el `<Badge>` keyed por el nombre.
   * Y el nombre **no es único**: una etiqueta que no esté en el mapa cae a
   * «etiqueta», así que dos desconocidas daban dos hijos con la misma clave y
   * React avisaba en consola —«two children with the same key, `etiqueta`»— con
   * el riesgo real de duplicar u omitir una insignia. El `id` sí es único por
   * construcción, y ya estaba a mano.
   *
   * Que una etiqueta no esté en el mapa es normal, no un fallo: el mapa lo
   * resuelve el servidor por proyecto, y el modelo puede proponer una de una
   * conversación anterior.
   */
  const marcas = (propuesta.labelIds ?? []).map((id) => ({
    id,
    nombre: etiquetas[id] ?? 'etiqueta',
  }));

  return (
    <CambioSobreTarea
      titulo="Edición propuesta"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      ejecutar={() => aceptarEdicionAction(projectId, propuesta)}
    >
      {/* Campo a campo y con el valor nuevo delante: quien acepta tiene que
          poder ver exactamente qué se va a sobrescribir. */}
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {propuesta.title !== undefined && <Campo termino="Título" valor={propuesta.title} />}
        {propuesta.priority !== undefined && (
          <Campo
            termino="Prioridad"
            valor={PRIORITY_LABELS[propuesta.priority as Priority] ?? propuesta.priority}
          />
        )}
        {propuesta.dueDate !== undefined && (
          <Campo termino="Vence" valor={formatoFecha(propuesta.dueDate)} />
        )}
        {propuesta.estimatePoints !== undefined && (
          <Campo
            termino="Estimación"
            valor={`${propuesta.estimatePoints} ${propuesta.estimatePoints === 1 ? 'punto' : 'puntos'}`}
          />
        )}
      </dl>

      {propuesta.description !== undefined && (
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          {propuesta.description}
        </p>
      )}

      {propuesta.labelIds !== undefined &&
        (marcas.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {marcas.map((marca) => (
              <Badge key={marca.id} variant="primary">
                {marca.nombre}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="font-sans text-xs text-text-secondary">Se quedaría sin etiquetas.</p>
        ))}

      {propuesta.labelIds !== undefined && marcas.length > 0 && (
        /* Misma advertencia que en los encargados: la lista sustituye. */
        <p className="font-sans text-xs text-text-secondary">
          Esas serían todas sus etiquetas; las demás se quitan.
        </p>
      )}
    </CambioSobreTarea>
  );
}

export function MoveProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: MoveProposal }) {
  return (
    <CambioSobreTarea
      titulo="Movimiento propuesto"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      ejecutar={() => aceptarMovimientoAction(projectId, propuesta)}
    >
      <p className="font-sans text-sm text-text-secondary">
        {propuesta.columnaActual ? (
          <>
            Pasaría de <strong className="text-text-primary">{propuesta.columnaActual}</strong> a{' '}
          </>
        ) : (
          'Pasaría a '
        )}
        <strong className="text-text-primary">{propuesta.columnName}</strong>.
      </p>

      {/**
       * El cambio de tablero, dicho aparte y solo cuando lo hay.
       *
       * Un proyecto puede tener varios tableros y cada uno sus propias columnas,
       * así que «pasaría a Por hacer» no identifica ningún sitio por sí solo. Y
       * si además cambia de tablero, ese es el cambio grande de los dos: la
       * tarea desaparece de donde la gente la estaba mirando.
       */}
      {propuesta.boardName &&
        (propuesta.tableroActual && propuesta.tableroActual !== propuesta.boardName ? (
          <p className="font-sans text-sm" style={{ color: colors.warning }}>
            Y cambiaría de tablero: de <strong>{propuesta.tableroActual}</strong> a{' '}
            <strong>{propuesta.boardName}</strong>.
          </p>
        ) : (
          <p className="font-sans text-xs text-text-secondary">
            En el tablero <strong className="text-text-primary">{propuesta.boardName}</strong>.
          </p>
        ))}
    </CambioSobreTarea>
  );
}

export function ChecklistProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: ChecklistProposal }) {
  return (
    <CambioSobreTarea
      titulo="Checklist propuesto"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      ejecutar={() => aceptarChecklistAction(projectId, propuesta)}
    >
      <ol className="flex flex-col gap-1">
        {propuesta.items.map((paso, indice) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: son textos sin id, y la lista no se reordena
            key={`${indice}-${paso}`}
            className="flex gap-2 font-sans text-sm text-text-secondary"
          >
            <span className="text-text-secondary tabular-nums">{indice + 1}.</span>
            {paso}
          </li>
        ))}
      </ol>
      {/* Se suman: hay que decirlo, porque «proponer un checklist» suena a
          reemplazarlo entero. */}
      <p className="font-sans text-xs text-text-secondary">
        Se añaden a los pasos que ya tenga. No se borra ninguno.
      </p>
    </CambioSobreTarea>
  );
}

export function CommentProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: CommentProposal }) {
  return (
    <CambioSobreTarea
      titulo="Comentario propuesto"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      ejecutar={() => aceptarComentarioAction(projectId, propuesta)}
    >
      {/* El texto entero y tal cual se va a publicar: se firma con tu nombre,
          así que no puede quedar resumido ni recortado. */}
      <p
        className="whitespace-pre-wrap rounded-lg px-3 py-2 font-sans text-sm leading-relaxed text-text-primary"
        style={{ background: alpha(colors.primary, 8) }}
      >
        {propuesta.body}
      </p>
      <p className="font-sans text-xs text-text-secondary">
        Se publicaría a tu nombre, no al del asistente.
      </p>
    </CambioSobreTarea>
  );
}

/**
 * Borrar una tarea. **La única tarjeta destructiva de las diez.**
 *
 * ## Por qué no usa `CambioSobreTarea` como las otras cuatro
 *
 * Porque aquellas comparten una forma —«esto cambia, ¿lo aplicas?»— y esta no es
 * un cambio: es una pérdida. Meterla en el mismo marco la habría convertido en un
 * «Aceptar» más en una fila de «Aceptar», que es exactamente lo que no puede
 * pasar cuando el gesto no se deshace.
 *
 * Las tres diferencias, y ninguna es cosmética:
 *
 * 1. **Confirmación propia.** El primer botón no borra: descubre el segundo. Dos
 *    gestos separados por medio segundo de lectura es lo que distingue decidir de
 *    despachar, y es la misma razón por la que borrar un proyecto pide escribir
 *    su nombre.
 * 2. **Dice qué se lleva por delante**, no solo qué se borra. Una tarea con nueve
 *    pasos de checklist y sus comentarios no es «una tarea».
 *    ⚠️ Los pasos se enseñan con su número porque la propuesta lo trae; los
 *    comentarios y los adjuntos, en genérico, porque **no** llega ninguna cifra y
 *    un número inventado en una tarjeta de borrado sería la peor clase de mentira.
 * 3. **«Aceptar todas» no la toca.** Lo resuelve `Marco` sin saber de borrados:
 *    hasta que no se confirma, `onAceptar` no existe, y la señal de aceptar en
 *    bloque solo llama a lo que existe. Un botón pensado para despachar cinco
 *    propuestas de golpe no puede llevarse por delante algo irreversible.
 *
 * ## Y sigue sin ser una vía de escritura nueva
 *
 * Aceptar llama a `DELETE /tasks/:id`, el mismo endpoint y el mismo
 * `canDeleteTask` que el botón del diálogo de tarea. Sin ese permiso, al modelo
 * ni se le declara la herramienta.
 */
export function DeleteProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: DeleteProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /** El segundo gesto. Hasta que no está puesto, no hay botón que borre. */
  const [confirmando, setConfirmando] = useState(false);

  async function borrar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarBorradoAction(projectId, propuesta);

    if (respuesta.error || !respuesta.borrada) {
      setError(respuesta.error ?? 'No se pudo borrar la tarea.');
      setEstado('pendiente');
      /* Se vuelve al primer gesto: si falló, que haya que volver a confirmar. */
      setConfirmando(false);
      return;
    }

    /* Sin `href`: la tarea ya no existe, así que no hay nada que ir a ver. Es la
       única de las diez donde el resultado no puede ofrecer un enlace. */
    setResultado({ texto: `Se borró «${respuesta.borrada.title}».`, href: null });
    setEstado('hecho');
  }

  const detalles = [
    propuesta.tablero && propuesta.columna
      ? `${propuesta.tablero} · ${propuesta.columna}`
      : propuesta.columna,
    propuesta.pasos ? `${propuesta.pasos} ${propuesta.pasos === 1 ? 'paso' : 'pasos'}` : null,
    propuesta.cerrada ? 'ya cerrada' : null,
  ].filter(Boolean);

  return (
    <Marco
      titulo="Borrado propuesto"
      sinAplicar="Todavía no se ha borrado nada."
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      /* Hasta que no se confirma no hay acción de aceptar. Es lo que además
         mantiene esta tarjeta fuera de «Aceptar todas». */
      onAceptar={confirmando ? borrar : undefined}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      tono="destructivo"
    >
      <p className="font-sans text-sm text-text-primary">
        <strong>{propuesta.taskTitle ?? 'Una tarea'}</strong>
        {detalles.length > 0 && (
          <span className="font-normal text-text-secondary"> — {detalles.join(' · ')}</span>
        )}
      </p>

      <p
        className="rounded-lg px-3 py-2 font-sans text-sm"
        style={{ background: alpha(colors.error, 10), color: colors.error }}
      >
        <strong>Esto no se puede deshacer.</strong> Se borra la tarea y con ella sus subtareas, su
        checklist, sus comentarios y sus adjuntos.
      </p>

      {!confirmando && estado === 'pendiente' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="danger" onClick={() => setConfirmando(true)}>
            Sí, quiero borrarla
          </Button>
          <span className="font-sans text-xs text-text-secondary">
            Te lo preguntamos otra vez antes de hacerlo.
          </span>
        </div>
      )}
    </Marco>
  );
}

/**
 * Borrar varias tareas (`proponer_borrados`): la lista entera, en rojo, y la
 * misma doble confirmación que el borrado suelto. Hasta confirmar no hay
 * «Aceptar», así que tampoco entra en «Aceptar todas».
 */
export function DeleteBatchProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: DeleteBatchProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [todas, setTodas] = useState(false);
  const total = propuesta.tareas.length;
  const visibles = todas ? propuesta.tareas : propuesta.tareas.slice(0, 10);

  async function borrar() {
    setEstado('enviando');
    setError(null);
    const respuesta = await aceptarBorradosAction(projectId, propuesta);
    if (respuesta.error) {
      setError(respuesta.error);
      setEstado('pendiente');
      setConfirmando(false);
      return;
    }
    setResultado({
      texto:
        respuesta.fallidas.length === 0
          ? `Se borraron ${respuesta.borradas} tareas.`
          : `Se borraron ${respuesta.borradas}; no se pudieron borrar: ${respuesta.fallidas.join(', ')}.`,
      href: null,
    });
    setEstado('hecho');
  }

  return (
    <Marco
      titulo={`Borrar ${total} ${total === 1 ? 'tarea' : 'tareas'}`}
      sinAplicar="Todavía no se ha borrado nada."
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={confirmando ? borrar : undefined}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      tono="destructivo"
    >
      <ol className="flex flex-col gap-1">
        {visibles.map((tarea) => (
          <li
            key={tarea.taskId}
            className="flex items-baseline gap-2 rounded-lg px-3 py-1.5"
            style={{ background: alpha(colors.error, 6) }}
          >
            <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
              {tarea.taskTitle}
            </span>
            <span className="shrink-0 font-sans text-[11px] text-text-secondary">
              {[tarea.tablero, tarea.columna].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ol>
      {total > 10 && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="self-start font-sans text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {todas ? 'Ver menos' : `Ver las ${total - 10} restantes`}
        </button>
      )}

      <p
        className="rounded-lg px-3 py-2 font-sans text-sm"
        style={{ background: alpha(colors.error, 10), color: colors.error }}
      >
        <strong>Esto no se puede deshacer.</strong> Se borran las {total} tareas y con ellas sus
        subtareas, checklists, comentarios y adjuntos.
      </p>

      {!confirmando && estado === 'pendiente' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="danger" onClick={() => setConfirmando(true)}>
            Sí, quiero borrar las {total}
          </Button>
          <span className="font-sans text-xs text-text-secondary">
            Te lo preguntamos otra vez antes de hacerlo.
          </span>
        </div>
      )}
    </Marco>
  );
}

/**
 * Un tablero nuevo con sus columnas.
 *
 * ## Enseña el flujo, no una lista
 *
 * Las columnas van **en fila y con su color**, en el orden en que se van a
 * crear: es lo que se va a ver en el tablero, y una lista con viñetas no dice
 * nada sobre el recorrido que hace el trabajo. Quien acepta tiene que poder
 * reconocer su propio flujo de un vistazo, o no puede juzgar si está bien.
 *
 * ⚠️ **La última se marca como «cierre» con todas las letras.** El verde de esa
 * columna no es decorativo: una tarea que llega ahí cuenta como terminada en los
 * informes y deja de avisar aunque esté vencida (`DONE_COLUMN_COLOR`). Es lo
 * único de esta propuesta con consecuencias que no se ven en el tablero, así que
 * es lo único que la tarjeta explica.
 *
 * ## Fallar a mitad se cuenta
 *
 * Tres endpoints y ninguna transacción que los abarque: el tablero puede quedar
 * creado con dos columnas de cuatro. No se deshace nada —borrar lo ya creado por
 * un fallo de red sería destruir trabajo— y en su lugar el resultado dice qué se
 * quedó fuera. Mismo criterio que la plantilla de proyecto nuevo.
 */
export function BoardProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: BoardProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarTableroAction(projectId, propuesta);

    if (respuesta.error || !respuesta.creado) {
      setError(respuesta.error ?? 'No se pudo crear el tablero.');
      setEstado('pendiente');
      return;
    }

    const { nombre, columnas, fallos } = respuesta.creado;
    setResultado({
      texto:
        fallos.length > 0
          ? `Se creó «${nombre}» con ${columnas} ${columnas === 1 ? 'columna' : 'columnas'}. ${fallos.join(' ')}`
          : `Se creó «${nombre}» con ${columnas} ${columnas === 1 ? 'columna' : 'columnas'}.`,
      /* Cruza a la zona de proyectos → ruta completa del shell. Ver §16. */
      href: null,
    });
    setEstado('hecho');
  }

  const columnas = propuesta.columnas ?? [];

  return (
    <Marco
      titulo="Tablero propuesto"
      sinAplicar="Todavía no existe."
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Campo termino="Tablero" valor={propuesta.nombre} />
        <Campo termino="En el espacio" valor={propuesta.espacio} />
      </dl>

      <div className="flex flex-col gap-1.5">
        <span className="font-sans text-xs text-text-secondary">
          {columnas.length} {columnas.length === 1 ? 'columna' : 'columnas'}, en este orden
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {columnas.map((columna, indice) => (
            <Fragment key={`${columna.nombre}-${indice}`}>
              {indice > 0 && (
                <span aria-hidden="true" className="font-sans text-xs text-text-secondary">
                  ›
                </span>
              )}
              <span
                className="rounded-lg px-2.5 py-1 font-sans text-sm"
                style={{
                  background: alpha(colorDeColumna(columna.color), 14),
                  color: colorDeColumna(columna.color),
                  boxShadow: `inset 0 0 0 1px ${alpha(colorDeColumna(columna.color), 30)}`,
                }}
              >
                {columna.nombre}
              </span>
            </Fragment>
          ))}
        </div>

        {/* El verde tiene consecuencias fuera del tablero, así que se dice. */}
        {columnas.some((columna) => columna.color === 'success') && (
          <span className="font-sans text-xs text-text-secondary">
            La última es la <strong className="text-text-primary">columna de cierre</strong>: lo que
            llegue ahí cuenta como terminado en los informes y deja de avisar aunque esté vencido.
          </span>
        )}
      </div>
    </Marco>
  );
}

/**
 * El marco de las propuestas cuyo resultado es una frase: los sprints.
 *
 * Las de tarea tienen `CambioSobreTarea`, que enlaza a la tarea; estas no
 * tienen una tarea a la que llevar, así que el resultado es lo que pasó y un
 * enlace al proyecto.
 */
function AccionConFrase({
  titulo,
  sinAplicar,
  porQue,
  ejecutar,
  projectId,
  proposalId,
  estadoGuardado,
  children,
}: {
  titulo: string;
  sinAplicar: string;
  porQue?: string | undefined;
  ejecutar: () => Promise<{ error: string | null; hecho: string | null; href?: string }>;
  projectId: string;
  proposalId?: string | undefined;
  estadoGuardado?: EstadoPropuesta | undefined;
  children: React.ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);
    const respuesta = await ejecutar();
    if (respuesta.error || !respuesta.hecho) {
      setError(respuesta.error ?? 'No se pudo aplicar.');
      setEstado('pendiente');
      return;
    }
    setResultado({ texto: respuesta.hecho, href: respuesta.href ?? `/projects/${projectId}` });
    setEstado('hecho');
  }

  return (
    <Marco
      titulo={titulo}
      sinAplicar={sinAplicar}
      porQue={porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      {children}
    </Marco>
  );
}

export function SprintProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: SprintProposal }) {
  return (
    <AccionConFrase
      titulo="Sprint propuesto"
      sinAplicar="Todavía no existe."
      porQue={propuesta.porQue}
      ejecutar={() => aceptarSprintAction(projectId, propuesta)}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Campo termino="Sprint" valor={propuesta.nombre} />
        <Campo termino="En el tablero" valor={propuesta.tablero} />
      </dl>
      {propuesta.meta && (
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          Meta: <span className="text-text-primary">{propuesta.meta}</span>
        </p>
      )}
      <p className="font-sans text-xs text-text-secondary">
        Nace planeado y sin fechas: empezarlo es otro paso.
      </p>
    </AccionConFrase>
  );
}

export function StartSprintProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: StartSprintProposal }) {
  return (
    <AccionConFrase
      titulo="Empezar el sprint"
      sinAplicar="Todavía no ha empezado."
      porQue={propuesta.porQue}
      ejecutar={() =>
        aceptarInicioSprintAction(projectId, propuesta, new Date().getTimezoneOffset())
      }
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Campo termino="Sprint" valor={propuesta.sprint} />
        <Campo termino="Tablero" valor={propuesta.tablero} />
        <Campo termino="Desde" valor={formatoFecha(propuesta.desde)} />
        <Campo termino="Hasta" valor={formatoFecha(propuesta.hasta)} />
      </dl>
      <p className="font-sans text-xs text-text-secondary">
        Desde ese momento el tablero enseña solo las tareas de este sprint.
      </p>
    </AccionConFrase>
  );
}

export function PlanningProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: PlanningProposal }) {
  const tareas = propuesta.tareas ?? [];
  const alSprint = Boolean(propuesta.sprintId);
  return (
    <AccionConFrase
      titulo={alSprint ? `Planificar «${propuesta.sprint ?? 'el sprint'}»` : 'Devolver al backlog'}
      sinAplicar="Todavía no se ha movido ninguna."
      porQue={propuesta.porQue}
      ejecutar={() => aceptarPlanificacionAction(projectId, propuesta)}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-sm text-text-secondary">
        {tareas.length} {tareas.length === 1 ? 'tarea' : 'tareas'}{' '}
        {alSprint ? 'entrarían en el sprint:' : 'saldrían del sprint y volverían al backlog:'}
      </p>
      <ul className="flex flex-col gap-1">
        {tareas.map((tarea) => (
          <li key={tarea.id} className="font-sans text-sm text-text-primary">
            {tarea.titulo}
          </li>
        ))}
      </ul>
    </AccionConFrase>
  );
}

export function DocumentProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: DocumentProposal }) {
  return (
    <AccionConFrase
      titulo="Documento propuesto"
      sinAplicar="Todavía no existe."
      porQue={propuesta.porQue}
      ejecutar={() => aceptarDocumentoAction(projectId, propuesta)}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Campo termino="Documento" valor={propuesta.titulo} />
        <Campo termino="En el espacio" valor={propuesta.espacio} />
      </dl>
      {/* El contenido tal cual va a quedar, pintado como lo pinta el documento. */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border px-3 py-2">
        <ModelText texto={propuesta.contenido} />
      </div>
    </AccionConFrase>
  );
}

/**
 * Una revisión de un documento que ya existe.
 *
 * ⚠️ **Aceptar no escribe nada**: abre el documento con la revisión esperando
 * arriba, y el editor la aplica cuando la persona lo confirma allí. El
 * contenido solo entra por el tiempo real (E4 de PLAN-DOCUMENTOS); aplicarlo
 * desde aquí sería un `PATCH` que el siguiente guardado de Yjs se comería.
 */
export function DocumentRevisionProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: DocumentRevisionProposal }) {
  const router = useRouter();
  const href = `/projects/${projectId}?tab=espacios&ws=${propuesta.workspaceId}&doc=${propuesta.documentoId}`;
  return (
    <AccionConFrase
      titulo="Revisión de un documento"
      sinAplicar="El documento no ha cambiado."
      porQue={propuesta.porQue}
      ejecutar={async () => {
        try {
          sessionStorage.setItem(
            claveDeRevisionDePrax(propuesta.documentoId),
            JSON.stringify({ contenido: propuesta.contenido, cambios: propuesta.cambios }),
          );
        } catch {
          return { error: 'Este navegador no deja guardar la revisión para abrirla.', hecho: null };
        }
        router.push(href);
        return { error: null, hecho: 'Abierta en el documento: aplícala desde allí.', href };
      }}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <dl className="grid grid-cols-1 gap-y-2">
        <Campo termino="Documento" valor={propuesta.titulo} />
      </dl>
      <p className="font-sans text-sm leading-relaxed text-text-primary">{propuesta.cambios}</p>
      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer font-sans text-xs text-text-secondary">
          Ver cómo quedaría
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <ModelText texto={propuesta.contenido} />
        </div>
      </details>
      <p className="font-sans text-xs text-text-secondary">
        Se aplica desde el editor y queda en el historial de versiones: se puede deshacer.
      </p>
    </AccionConFrase>
  );
}

export function PrivateMessageProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  conversationId,
}: ProposalCardProps & { propuesta: PrivateMessageProposal }) {
  return (
    <AccionConFrase
      titulo={`Mensaje privado para ${propuesta.destinatario}`}
      sinAplicar="Todavía no se ha enviado."
      porQue={propuesta.porQue}
      ejecutar={() => aceptarMensajePrivadoAction(propuesta, conversationId)}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="whitespace-pre-wrap rounded-lg border border-border px-3 py-2 font-sans text-sm leading-relaxed text-text-primary">
        {propuesta.body}
      </p>
      <p className="font-sans text-xs text-text-secondary">
        Solo lo verá {propuesta.destinatario}. Sale a tu nombre, con la marca «enviado con PRAX».
      </p>
    </AccionConFrase>
  );
}

export function AutomationProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: AutomationProposal }) {
  return (
    <AccionConFrase
      titulo="Automatización propuesta"
      sinAplicar="Todavía no existe."
      porQue={propuesta.porQue}
      ejecutar={() => aceptarAutomatizacionAction(projectId, propuesta)}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-sm font-medium text-text-primary">{propuesta.nombre}</p>
      <p className="font-sans text-sm leading-relaxed text-text-secondary">{propuesta.frase}</p>
      <p className="font-sans text-xs text-text-secondary">
        Nace pausada: no hará nada hasta que la enciendas.
      </p>
    </AccionConFrase>
  );
}

export function AutomationStateProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: AutomationStateProposal }) {
  return (
    <AccionConFrase
      titulo={propuesta.activar ? 'Encender una automatización' : 'Pausar una automatización'}
      sinAplicar="Sigue como estaba."
      porQue={propuesta.porQue}
      ejecutar={() => aceptarEstadoAutomatizacionAction(projectId, propuesta)}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-sm font-medium text-text-primary">{propuesta.nombre}</p>
      {propuesta.activar && (
        <p className="font-sans text-xs text-text-secondary">
          Cuenta en el tope de reglas encendidas de tu plan.
        </p>
      )}
    </AccionConFrase>
  );
}

/** Token de columna → color real. Sin color, el gris de siempre. */
function colorDeColumna(token?: string): string {
  switch (token) {
    case 'primary':
      return colors.primary;
    case 'accent':
      return colors.accent;
    case 'info':
      return colors.info;
    case 'warning':
      return colors.warning;
    case 'error':
      return colors.error;
    case 'success':
      return colors.success;
    default:
      return colors.textSecondary;
  }
}

/**
 * Las preguntas de PRAX, con las respuestas para pulsar.
 *
 * ## No se parece a las demás porque no es lo mismo
 *
 * Las otras diez tarjetas dicen «esto va a pasar, ¿lo aceptas?» y tienen dos
 * botones. Esta no propone ningún cambio: **es una pregunta**, así que no lleva
 * «Aceptar» ni «Descartar» sino un formulario y un «Responder». Meterla en el
 * mismo marco habría sido llamar «aceptar» a contestar.
 *
 * ## ⚠️ La respuesta vuelve como un turno normal
 *
 * Al enviar no se llama a ningún endpoint nuevo: se compone una frase en español
 * —«Cuál de estas: la de Diseño. Prioridad: alta»— y se manda como el siguiente
 * mensaje de la conversación. Dos cosas salen de ahí, y las dos importan:
 *
 * - el modelo lo entiende **sin maquinaria extra**, porque ve una respuesta
 *   escrita y no un formulario serializado;
 * - y el hilo **se sigue leyendo** al releerlo dentro de una semana, en vez de
 *   tener un hueco donde hubo unos clics.
 *
 * ## Y se puede pasar de largo
 *
 * «Prefiero escribirlo» descarta la tarjeta sin responder. Una pregunta que
 * bloquea la conversación hasta que la contestes es un formulario disfrazado:
 * si lo que hace falta decir no está entre las opciones, escribirlo tiene que
 * seguir siendo posible.
 */
export function QuestionProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  onResponder,
}: ProposalCardProps & {
  propuesta: QuestionProposal;
  /** Manda la respuesta como un turno más. La pone `AssistantChat`. */
  onResponder?: (texto: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  /** Pregunta → respuestas marcadas. Un `Set` por pregunta, también en las de una. */
  const [marcadas, setMarcadas] = useState<Record<string, Set<string>>>({});

  function alternar(preguntaId: string, opcionId: string, unaSola: boolean) {
    setMarcadas((previas) => {
      const actuales = previas[preguntaId] ?? new Set<string>();
      /* En las de una sola respuesta, marcar sustituye en vez de sumar: es lo
         que hace un grupo de opciones excluyentes, y ahorra tener que
         desmarcar la anterior. */
      if (unaSola) return { ...previas, [preguntaId]: new Set([opcionId]) };

      const siguientes = new Set(actuales);
      if (siguientes.has(opcionId)) siguientes.delete(opcionId);
      else siguientes.add(opcionId);
      return { ...previas, [preguntaId]: siguientes };
    });
  }

  /* Todas contestadas: sin esto se puede enviar media respuesta, y el modelo
     vuelve a preguntar por lo que falta — dos turnos para lo que era uno. */
  const completo = propuesta.preguntas.every((pregunta) => (marcadas[pregunta.id]?.size ?? 0) > 0);

  function responder() {
    if (!completo || !onResponder) return;

    /**
     * La frase que se manda.
     *
     * Se escribe como lo escribiría una persona —«pregunta: respuesta»— y no
     * como JSON: el modelo la lee en el hilo igual que leería una respuesta
     * tecleada, sin ninguna instrucción especial que explicarle en el prompt.
     */
    const frase = propuesta.preguntas
      .map((pregunta) => {
        const elegidas = pregunta.opciones
          .filter((opcion) => marcadas[pregunta.id]?.has(opcion.id))
          .map((opcion) => opcion.texto);
        return `${pregunta.texto} ${elegidas.join(', ')}`;
      })
      .join('. ');

    setEstado('hecho');
    onResponder(frase);
  }

  /* Ya se contestó en su día, o se acaba de contestar: la tarjeta se queda
     legible —importa saber qué se preguntó— y sin nada que presionar. */
  const decidida = estado !== 'pendiente' || (estadoGuardado && estadoGuardado !== 'PENDING');

  return (
    <Marco
      titulo={propuesta.preguntas.length === 1 ? 'Una pregunta' : 'Unas preguntas'}
      sinAplicar="Elige y responde, o escríbelo tú."
      porQue={propuesta.porQue}
      estado={decidida ? 'hecho' : 'pendiente'}
      error={null}
      resultado={decidida ? { texto: 'Respondido.', href: null } : null}
      /* Sin acción de aceptar: el botón propio de esta tarjeta es «Responder», y
         va dentro, junto a las opciones que activa. */
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      etiquetaDescartar="Prefiero escribirlo"
    >
      <div className="flex flex-col gap-4">
        {propuesta.preguntas.map((pregunta) => {
          const unaSola = pregunta.tipo === 'una';

          return (
            <fieldset
              key={pregunta.id}
              className="flex flex-col gap-2"
              disabled={Boolean(decidida)}
            >
              <legend className="mb-1 font-sans text-sm text-text-primary">{pregunta.texto}</legend>

              <div className="flex flex-wrap gap-2">
                {pregunta.opciones.map((opcion) => {
                  const puesta = marcadas[pregunta.id]?.has(opcion.id) ?? false;

                  return (
                    <button
                      key={opcion.id}
                      type="button"
                      /* `aria-pressed` y no `role="radio"`/`"checkbox"`: esos
                         roles prometen navegación con flechas y gestión de foco
                         de grupo, y anunciarlos sin implementarlos engaña al
                         lector de pantalla. Es el mismo criterio que ya toman
                         `ProjectPicker` y `RowActions`. */
                      aria-pressed={puesta}
                      disabled={Boolean(decidida)}
                      onClick={() => alternar(pregunta.id, opcion.id, unaSola)}
                      className="rounded-full border px-3 py-1.5 font-sans text-sm transition-colors disabled:cursor-not-allowed"
                      style={
                        puesta
                          ? {
                              borderColor: colors.primary,
                              background: alpha(colors.primary, 14),
                              color: colors.primary,
                            }
                          : {
                              borderColor: colors.border,
                              color: colors.textSecondary,
                            }
                      }
                    >
                      {opcion.texto}
                    </button>
                  );
                })}
              </div>

              {/* Solo cuando se pueden marcar varias: en las de una, decir «elige
                  una» al lado de opciones excluyentes es explicar lo evidente. */}
              {!unaSola && (
                <span className="font-sans text-xs text-text-secondary">Puedes marcar varias.</span>
              )}
            </fieldset>
          );
        })}

        {!decidida && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={responder} disabled={!completo}>
              Responder
            </Button>
            {!completo && (
              <span className="font-sans text-xs text-text-secondary">
                {propuesta.preguntas.length === 1
                  ? 'Elige una respuesta.'
                  : 'Responde a todas para enviar.'}
              </span>
            )}
          </div>
        )}
      </div>
    </Marco>
  );
}

/**
 * Marcar pasos del checklist como hechos.
 *
 * Enseña **los pasos, uno a uno y con su texto**, no «se marcarán 3 pasos»: dar
 * por terminado el trabajo de alguien pide ver exactamente qué se da por hecho.
 */
export function MarkStepsProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: CheckStepsProposal }) {
  return (
    <CambioSobreTarea
      titulo="Pasos que se darían por hechos"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
      ejecutar={() => aceptarMarcarPasosAction(projectId, propuesta)}
    >
      <ul className="flex flex-col gap-1">
        {(propuesta.items ?? []).map((paso, indice) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: los textos pueden repetirse y no traen id propio en la tarjeta
            key={indice}
            className="flex items-center gap-2 font-sans text-sm text-text-primary"
          >
            <span
              aria-hidden="true"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              style={{ borderColor: colors.success, color: colors.success }}
            >
              ✓
            </span>
            {paso}
          </li>
        ))}
      </ul>
      <p className="font-sans text-xs text-text-secondary">
        Solo se marcan. El asistente no puede desmarcar ni borrar pasos.
      </p>
    </CambioSobreTarea>
  );
}

/**
 * Un mensaje para el chat del equipo.
 *
 * ⚠️ **Es la propuesta con más alcance de todas, y la tarjeta lo dice.** Las
 * demás cambian algo dentro de una tarea; esta **suena en el teléfono de todo el
 * equipo**. Por eso enseña el texto entero —nadie debería firmar algo que no ha
 * leído, y menos algo que va a interrumpir a otros— y lo advierte en su pie.
 *
 * No usa `CambioSobreTarea` porque no hay tarea a la que enlazar después: el
 * resultado es «enviado», y a dónde lleva es al chat del proyecto.
 */
export function MessageProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  conversationId,
}: ProposalCardProps & { propuesta: MessageProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarMensajeAction(projectId, propuesta, conversationId);

    if (respuesta.error || !respuesta.enviado) {
      setError(respuesta.error ?? 'No se pudo enviar el mensaje.');
      setEstado('pendiente');
      return;
    }

    setResultado({
      texto: 'Mensaje enviado al chat del equipo.',
      href: `/projects/${projectId}?tab=chat`,
    });
    setEstado('hecho');
  }

  return (
    <Marco
      titulo="Mensaje propuesto para el equipo"
      sinAplicar="Todavía no se ha enviado a nadie."
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      onAceptar={aceptar}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      {/* El texto entero y tal cual se va a enviar. */}
      <p
        className="whitespace-pre-wrap rounded-lg px-3 py-2 font-sans text-sm leading-relaxed text-text-primary"
        style={{ background: alpha(colors.primary, 8) }}
      >
        {propuesta.body}
      </p>
      <p className="font-sans text-xs text-text-secondary">
        Lo verá todo el equipo del proyecto y les llegará un aviso. Se enviaría a tu nombre, no al
        del asistente.
      </p>
    </Marco>
  );
}

/**
 * El marco común: cabecera, cuerpo y los dos botones.
 *
 * Los tres estados finales se quedan **en su sitio y con su rastro** en vez de
 * hacer desaparecer la tarjeta: en un hilo de chat, algo que se borra al pulsar
 * deja la conversación hablando de una propuesta que ya no está.
 */
function Marco({
  titulo,
  sinAplicar,
  porQue,
  estado,
  error,
  resultado,
  onAceptar,
  onDescartar,
  projectId,
  proposalId,
  estadoGuardado,
  tono = 'normal',
  etiquetaDescartar = 'Descartar',
  etiquetaAceptar,
  children,
}: {
  titulo: string;
  /**
   * Qué se dice mientras la propuesta sigue sin aceptarse.
   *
   * Lo pone cada tarjeta porque no significan lo mismo: en una tarea nueva
   * **nada existe todavía**, pero en un cambio de encargado la tarea existe
   * desde antes y lo único que falta es aplicar el cambio. Decir «nada existe
   * todavía» sobre una tarea que está en el tablero era, sencillamente, falso.
   */
  sinAplicar: string;
  /** La justificación del modelo, obligatoria en las dos herramientas. */
  porQue?: string;
  estado: Estado;
  error: string | null;
  resultado: Resultado | null;
  /**
   * Qué pasa al aceptar.
   *
   * **Opcional**: sin ella la tarjeta enseña lo que se propone y no ofrece el
   * botón. La dejan fuera dos casos —el gráfico cuando no hay lienzo delante, y
   * el borrado mientras no se ha confirmado— y los dos por lo mismo: un botón
   * que no puede cumplir lo que promete es peor que su ausencia.
   */
  onAceptar?: () => void;
  onDescartar: () => void;
  /**
   * Qué dice el botón de descartar.
   *
   * Por defecto «Descartar», que es lo correcto cuando se está rechazando un
   * cambio. En la tarjeta de preguntas no se descarta nada —no había nada que
   * aplicar— así que ahí dice «Prefiero escribirlo», que es lo que de verdad
   * pasa al pulsarlo.
   */
  etiquetaDescartar?: string;
  /**
   * Qué dice el botón de aceptar.
   *
   * Por defecto «Aceptar», que es lo correcto cuando pulsarlo **hace** lo que la
   * tarjeta propone. La plantilla lo cambia porque ahí no hace nada todavía: abre
   * la revisión del plan, y llamar «Aceptar» a eso prometería un proyecto creado
   * de un clic — que es justo lo que el paso de revisión existe para evitar.
   */
  etiquetaAceptar?: string;
  /**
   * El foco de la conversación. **`null` en una sin proyecto**, y con él la
   * decisión se anota por `/me/assistant/proposals/:id/resolve` en vez de por la
   * ruta del proyecto — que respondería 404, porque no hay ninguno.
   */
  projectId: string | null;
  proposalId?: string;
  estadoGuardado?: EstadoPropuesta;
  /**
   * El color del marco.
   *
   * `destructivo` lo tiñe de rojo, y **solo lo lleva el borrado**. Si algún día
   * lo llevara una segunda tarjeta habría que preguntarse si de verdad las dos
   * son irreversibles: en cuanto el rojo aparece en dos sitios distintos deja de
   * significar «cuidado» y pasa a ser un color más de la paleta.
   */
  tono?: 'normal' | 'destructivo';
  children: React.ReactNode;
}) {
  /**
   * Anota lo decidido, una sola vez, **después** de que haya salido bien.
   *
   * Va aquí y no en cada tarjeta porque las seis terminan igual: `estado` pasa a
   * `hecho` o a `descartada` y eso es lo que hay que guardar. Repetirlo seis
   * veces habría sido seis sitios donde olvidarlo.
   *
   * `resolverPropuestaAction` falla en silencio a propósito: que no se pueda
   * anotar no es motivo para decir que la tarea no se creó, cuando sí se creó.
   */
  const anotado = useRef(false);
  useEffect(() => {
    if (!proposalId || anotado.current) return;
    if (estado !== 'hecho' && estado !== 'descartada') return;
    anotado.current = true;
    resolverPropuestaAction(projectId, proposalId, estado === 'hecho' ? 'ACCEPTED' : 'DISCARDED');
  }, [estado, proposalId, projectId]);

  /** Ya se decidió en su día: ni se acepta en bloque ni se vuelve a ofrecer. */
  const decididaAntes = Boolean(estadoGuardado && estadoGuardado !== 'PENDING');

  /**
   * «Aceptar todas» llega hasta aquí.
   *
   * Se guarda el valor **atendido** en vez de comparar contra cero: el efecto
   * vuelve a ejecutarse en cada render —`onAceptar` es una closure nueva cada
   * vez— y sin esa marca aceptaría en bucle. Solo actúa cuando el contador ha
   * cambiado de verdad.
   *
   * Una tarjeta que ya se envió, ya se hizo o se descartó no reacciona: aceptar
   * todas significa «las que siguen pendientes».
   */
  const contexto = useContext(FamiliaDePropuesta);
  const senal = useContext(SenalDeAceptarTodas);
  const senalAtendida = useRef(senal);
  useEffect(() => {
    if (senal === senalAtendida.current) return;
    senalAtendida.current = senal;
    if (estado === 'pendiente' && !decididaAntes) onAceptar?.();
  }, [senal, estado, decididaAntes, onAceptar]);

  /**
   * Le cuenta al grupo en qué estado está.
   *
   * Una propuesta que ya venía decidida de una conversación vieja se anuncia
   * como tal desde el principio, no como pendiente: si no, el grupo ofrecería
   * «Aceptar todas» sobre tarjetas que ya se aceptaron en su día.
   */
  const registrar = useContext(RegistroDeEstado);
  useEffect(() => {
    registrar?.(decididaAntes ? (estadoGuardado === 'ACCEPTED' ? 'hecho' : 'descartada') : estado);
  }, [registrar, estado, decididaAntes, estadoGuardado]);

  /**
   * Lo que se decidió en su día, al releer una conversación vieja.
   *
   * Sin esto, una propuesta de hace una semana volvería a ofrecer su «Aceptar» y
   * bastaría un clic distraído para crear la misma tarea dos veces. Se deja
   * legible —importa saber qué se propuso— pero sin nada que pulsar.
   */
  if (estado === 'pendiente' && decididaAntes) {
    return (
      <article
        className="flex flex-col gap-3 rounded-xl border border-dashed px-4 py-3"
        style={{ borderColor: colors.border }}
      >
        <header className="flex items-center gap-2">
          <span className="font-sans text-[11px] uppercase tracking-wider text-text-secondary">
            {titulo}
          </span>
          <span
            className="font-sans text-[11px]"
            style={{ color: estadoGuardado === 'ACCEPTED' ? colors.success : colors.textDisabled }}
          >
            {estadoGuardado === 'ACCEPTED' ? 'aceptada' : 'descartada'}
          </span>
        </header>
        <div className="opacity-60">{children}</div>
      </article>
    );
  }

  if (estado === 'descartada') {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 font-sans text-sm text-text-secondary">
        {/* «No se ha creado nada» solo valía para la tarea nueva: al descartar
            un cambio de encargado no había nada que crear. */}
        Propuesta descartada. No se ha aplicado nada.
      </p>
    );
  }

  /* El rojo se reserva para lo que no se deshace. Ver la nota de `tono`. */
  const borde = tono === 'destructivo' ? colors.error : colors.primary;
  const familia = ESTILO_DE_FAMILIA[tono === 'destructivo' ? 'destruir' : contexto.familia];

  return (
    <article
      className={`prax-entrada flex flex-col gap-3 rounded-xl border bg-surface p-4 ${
        estado === 'hecho' ? 'prax-aceptada' : ''
      }`}
      style={{
        borderColor: alpha(borde, tono === 'destructivo' ? 55 : 45),
        /* Escalonadas: la segunda llega un poco después de la primera. */
        animationDelay: estado === 'hecho' ? undefined : `${contexto.indice * 70}ms`,
      }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: familia.acento }}
          title={familia.nombre}
        >
          <span
            aria-hidden="true"
            className="flex h-4 w-4 items-center justify-center rounded-sm text-[11px] leading-none"
            style={{ background: alpha(familia.acento, 16) }}
          >
            {familia.icono}
          </span>
          Propuesta
        </span>
        <span className="font-sans text-sm font-medium text-text-primary">{titulo}</span>
        <span className="ml-auto font-sans text-[11px] text-text-secondary">
          {estado === 'hecho' ? 'aceptada' : sinAplicar}
        </span>
      </header>

      {children}

      {/* El porqué, separado de los hechos por un filete: lo de arriba es lo que
          va a pasar y esto es una opinión del asistente sobre por qué. Mezclarlos
          en el mismo bloque los haría leer con la misma autoridad. */}
      {/* ⚠️ Un `div` y no un `p`: `ModelText` devuelve bloques —párrafos,
          listas—, y un `<p>` dentro de otro `<p>` es HTML inválido. El
          navegador lo «arregla» cerrando el de fuera, así que el estilo del
          borde izquierdo se perdía a partir del primer salto de línea. */}
      {porQue && (
        <div
          className="flex flex-col gap-2 border-l-2 pl-3 font-sans text-sm leading-relaxed text-text-secondary"
          style={{ borderColor: alpha(colors.primary, 35) }}
        >
          <ModelText texto={porQue} />
        </div>
      )}

      {/* ⚠️ **`hecho` sin `resultado` no cae en los botones.** La plantilla
          enseña su resumen dentro de `children` en vez de en una línea, así que
          sin esta partición volvía a pintar «Descartar» debajo de un proyecto
          que ya existe. */}
      {estado === 'hecho' ? (
        resultado && (
          <p className="font-sans text-sm text-success">
            {resultado.texto}{' '}
            {resultado.href && (
              <a
                href={resultado.href}
                className="underline underline-offset-2 hover:text-text-primary"
              >
                Verla en el tablero
              </a>
            )}
          </p>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* Sin acción no hay «Aceptar»: un botón que no puede cumplir lo que
              promete es peor que su ausencia. «Descartar» se queda, porque
              quitarse la tarjeta de delante sí se puede hacer desde aquí. */}
          {onAceptar && (
            <Button
              size="sm"
              variant={tono === 'destructivo' ? 'danger' : 'primary'}
              onClick={onAceptar}
              isLoading={estado === 'enviando'}
            >
              {etiquetaAceptar ?? (tono === 'destructivo' ? 'Borrar definitivamente' : 'Aceptar')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDescartar} disabled={estado === 'enviando'}>
            {etiquetaDescartar}
          </Button>
          {error && <span className="font-sans text-sm text-error">{error}</span>}
          {/* Lo que la tarjeta no dice y conviene saber: aceptar no le da a PRAX
              ningún poder, lo hace quien presiona. */}
          {!error && onAceptar && (
            <span className="ml-auto hidden font-sans text-[11px] text-text-disabled sm:inline">
              con tus permisos, por el mismo botón que usarías tú
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function Campo({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-sans text-[11px] uppercase tracking-wider text-text-secondary">
        {termino}
      </dt>
      <dd className="font-sans text-sm text-text-primary">{valor}</dd>
    </div>
  );
}

/** `2026-08-14` → `14 de agosto`. El año solo si no es el que corre. */
function formatoFecha(iso: string): string {
  const fecha = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return iso;
  const mismoAno = fecha.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    ...(mismoAno ? {} : { year: 'numeric' }),
  }).format(fecha);
}

/**
 * Abrir uno de tus proyectos, propuesto desde una conversación sin foco.
 *
 * ## Por qué esta tarjeta anota su decisión ella misma
 *
 * ⚠️ Las demás dejan que lo haga `Marco` en un efecto, después de pintar. Aquí
 * no vale: aceptar **navega**, y una petición lanzada en un efecto que se
 * desmonta a la vez es una carrera que se pierde la mitad de las veces. La
 * consecuencia sería una tarjeta que al releer el hilo vuelve a ofrecer su
 * botón como si nadie lo hubiera pulsado.
 *
 * Por eso se llama a `resolverPropuestaAction` **antes de navegar y esperando su
 * vuelta**, y a `Marco` no se le pasa `proposalId`: sin él no intenta anotar
 * nada y no hay dos peticiones para lo mismo.
 */
export function OpenProjectProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
  onAbrir,
}: {
  /** El foco actual, que en este modo es `null`. Lo necesita `Marco`. */
  projectId: string | null;
  proposalId?: string;
  estadoGuardado?: EstadoPropuesta;
  propuesta: OpenProjectProposal;
  /** Cargar el proyecto sin perder el hilo. Lo resuelve la pantalla. */
  onAbrir?: (projectId: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>('pendiente');

  async function aceptar() {
    setEstado('enviando');
    if (proposalId) await resolverPropuestaAction(projectId, proposalId, 'ACCEPTED');
    setEstado('hecho');
    onAbrir?.(propuesta.projectId);
  }

  return (
    <Marco
      titulo="Abrir un proyecto"
      sinAplicar="Todavía estamos hablando sin ningún proyecto cargado."
      porQue={propuesta.porQue}
      estado={estado}
      error={null}
      resultado={
        estado === 'hecho' ? { texto: `Cargando «${propuesta.nombre}»…`, href: null } : null
      }
      onAceptar={onAbrir ? aceptar : undefined}
      onDescartar={() => {
        setEstado('descartada');
        if (proposalId) resolverPropuestaAction(projectId, proposalId, 'DISCARDED');
      }}
      projectId={projectId}
      estadoGuardado={estadoGuardado}
      etiquetaDescartar="Ahora no"
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2">
        <Campo termino="Proyecto" valor={propuesta.nombre} />
      </dl>

      <p className="font-sans text-xs text-text-secondary">
        Seguimos en esta misma conversación, pero con sus tareas, sus tableros y su gente delante.{' '}
        <strong className="text-text-primary">A partir de ahí es su conversación</strong>: para
        hablar de otro proyecto se empieza una nueva.
      </p>
    </Marco>
  );
}

/**
 * La estructura de un proyecto que todavía no existe.
 *
 * ## La tarjeta resume; la revisión se despliega
 *
 * Un árbol de espacios, tableros y columnas —más los roles con sus permisos y
 * las etiquetas— no cabe en una burbuja de chat, y meterlo a la fuerza haría que
 * nadie lo leyera. Así que la tarjeta dice **cuánto** hay y por qué, y el plan
 * entero se abre debajo cuando alguien va a decidir de verdad.
 *
 * ⚠️ Y lo que se despliega es **el mismo componente** que usa el diálogo de
 * proyecto nuevo (`TemplatePlanReview`), no una versión para el chat. Dibujarlo
 * dos veces habría duplicado la poda, que tiene dentro un bug ya arreglado —el
 * orden de `map` y `filter`— y que en una copia nueva volvería el primer día.
 */
export function TemplateProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: {
  projectId: string | null;
  proposalId?: string;
  estadoGuardado?: EstadoPropuesta;
  propuesta: TemplateProposal;
}) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ProjectTemplate>(propuesta);
  const [excluido, setExcluido] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<TemplateResult | null>(null);

  function alternar(clave: string) {
    setExcluido((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(clave)) ahora.delete(clave);
      else ahora.add(clave);
      return ahora;
    });
  }

  async function crear() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarPlantillaAction(podar(plan, excluido));

    if (!respuesta.proyecto) {
      setError(respuesta.error ?? 'No se pudo crear el proyecto.');
      setEstado('pendiente');
      return;
    }

    setResultado(respuesta);
    setEstado('hecho');
    if (proposalId) resolverPropuestaAction(projectId, proposalId, 'ACCEPTED');
  }

  return (
    <Marco
      titulo="Un proyecto entero, propuesto"
      sinAplicar="Nada de esto existe todavía."
      porQue={plan.porQue}
      estado={estado}
      error={error}
      resultado={null}
      onAceptar={undefined}
      onDescartar={() => {
        setEstado('descartada');
        if (proposalId) resolverPropuestaAction(projectId, proposalId, 'DISCARDED');
      }}
      projectId={projectId}
      estadoGuardado={estadoGuardado}
    >
      {resultado ? (
        /**
         * ⚠️ **Aquí había un botón «Seguir aquí con X», y se retiró.**
         *
         * Adoptaba el proyecto recién creado como foco de la conversación. La
         * idea era razonable y el resultado no: un proyecto que acaba de nacer
         * **no tiene de qué hablar** —ni tareas, ni movimiento, ni informe— así
         * que el briefing que llegaba estaba vacío y PRAX pasaba de proponer un
         * plan entero a no tener nada que decir sobre él. Un botón que empeora
         * la conversación no es un atajo, es una trampa.
         *
         * Quien quiera trabajar el proyecto lo abre; quien quiera seguir
         * hablando, sigue escribiendo.
         */
        <TemplateResultSummary resultado={resultado} />
      ) : (
        <div className="flex flex-col gap-4">
          <TemplatePlanReview
            plantilla={plan}
            excluido={excluido}
            onAlternar={alternar}
            onCambiarNombre={(nombre) => setPlan({ ...plan, nombre })}
            onCambiarDescripcion={(descripcion) => setPlan({ ...plan, descripcion })}
          />

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <span className="mr-auto font-sans text-xs text-text-secondary">
              Quita lo que no quieras antes de crearlo.
            </span>
            <Button
              type="button"
              onClick={crear}
              isLoading={estado === 'enviando'}
              disabled={estado === 'enviando'}
            >
              Crear proyecto
            </Button>
          </div>
        </div>
      )}
    </Marco>
  );
}
