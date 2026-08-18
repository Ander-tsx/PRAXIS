'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  AssignmentProposal,
  ChartProposal,
  CheckStepsProposal,
  ChecklistProposal,
  CommentProposal,
  DeleteProposal,
  EditProposal,
  EstadoPropuesta,
  MessageProposal,
  MoveProposal,
  TaskProposal,
} from '../../api/assistant';
import { PRIORITY_LABELS, type Priority } from '../../api/domain';
import {
  type AceptarSobreTareaState,
  aceptarAsignacionAction,
  aceptarBorradoAction,
  aceptarChecklistAction,
  aceptarComentarioAction,
  aceptarEdicionAction,
  aceptarMarcarPasosAction,
  aceptarMensajeAction,
  aceptarMovimientoAction,
  aceptarTareaAction,
  resolverPropuestaAction,
} from '../../assistant/actions';
import { Badge, Button } from '../../atoms';
import { alpha, colors } from '../../tokens';
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
 * La firma de «añadir este gráfico a mi lienzo».
 *
 * Es la misma que `aceptarGraficoAction` de `reports-front`. Se declara aquí
 * —y no se importa— porque el sentido de todo esto es que este paquete **no**
 * dependa de aquella zona.
 */
export type AceptarGrafico = (
  projectId: string,
  propuesta: ChartProposal,
) => Promise<{ anadido: boolean; error: string | null }>;

/**
 * De dónde saca `ChartProposalCard` su acción.
 *
 * ## ⚠️ Por qué esta llega por contexto y las otras nueve por importación
 *
 * Porque las otras **valen en cualquier zona**: crear una tarea, comentar, mover
 * o borrar es lo mismo se pida desde donde se pida, y viven en
 * `commons/assistant/actions`. Aceptar un gráfico no: escribe en el lienzo, y el
 * lienzo lo dibuja `reports-front` — necesita su catálogo de widgets para saber
 * de qué tamaño nace la tarjeta, y revalida *aquella* página.
 *
 * `null` es el caso normal en `assistant-front`, donde no hay lienzo delante. La
 * tarjeta entonces **no ofrece un botón que no llevaría a ninguna parte**: dice
 * dónde se coloca y enlaza a Análisis. Es el mismo criterio que apagar una acción
 * que va a dar 403 en vez de dejar que reviente al pulsarla.
 *
 * Contexto y no una prop encadenada porque entre `AssistantChat` y esta tarjeta
 * hay tres componentes que no tienen nada que ver con gráficos y tendrían que
 * llevarla de la mano solo para pasarla.
 */
export const AccionDelLienzo = createContext<AceptarGrafico | null>(null);

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
  proposalId?: string;
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
  const marcas = (propuesta.labelIds ?? []).map((id) => etiquetas[id] ?? 'etiqueta');

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
        {encargados.length > 0 && <Campo termino="Para" valor={encargados.join(', ')} />}
      </dl>

      {marcas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {marcas.map((nombre) => (
            <Badge key={nombre} variant="primary">
              {nombre}
            </Badge>
          ))}
        </div>
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
      <p className="font-sans text-xs text-text-disabled">
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
  proposalId?: string;
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
  const marcas = (propuesta.labelIds ?? []).map((id) => etiquetas[id] ?? 'etiqueta');

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
      </dl>

      {propuesta.description !== undefined && (
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          {propuesta.description}
        </p>
      )}

      {propuesta.labelIds !== undefined &&
        (marcas.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {marcas.map((nombre) => (
              <Badge key={nombre} variant="primary">
                {nombre}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="font-sans text-xs text-text-disabled">Se quedaría sin etiquetas.</p>
        ))}

      {propuesta.labelIds !== undefined && marcas.length > 0 && (
        /* Misma advertencia que en los encargados: la lista sustituye. */
        <p className="font-sans text-xs text-text-disabled">
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
          <p className="font-sans text-xs text-text-disabled">
            En el tablero <strong className="text-text-secondary">{propuesta.boardName}</strong>.
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
            <span className="text-text-disabled tabular-nums">{indice + 1}.</span>
            {paso}
          </li>
        ))}
      </ol>
      {/* Se suman: hay que decirlo, porque «proponer un checklist» suena a
          reemplazarlo entero. */}
      <p className="font-sans text-xs text-text-disabled">
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
      <p className="font-sans text-xs text-text-disabled">
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
          <span className="font-sans text-xs text-text-disabled">
            Te lo preguntamos otra vez antes de hacerlo.
          </span>
        </div>
      )}
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
      <p className="font-sans text-xs text-text-disabled">
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
}: ProposalCardProps & { propuesta: MessageProposal }) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarMensajeAction(projectId, propuesta);

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
      <p className="font-sans text-xs text-text-disabled">
        Lo verá todo el equipo del proyecto y les llegará un aviso. Se enviaría a tu nombre, no al
        del asistente.
      </p>
    </Marco>
  );
}

/**
 * Un gráfico para el lienzo de Análisis.
 *
 * ⚠️ **Es la propuesta con menos alcance de todas, y la tarjeta también lo
 * dice.** Las otras ocho cambian algo del proyecto; esta solo añade una tarjeta
 * al panel de quien acepta. Decirlo importa tanto como decir lo contrario en la
 * del mensaje: sin esa frase, «el asistente quiere añadir un gráfico» se lee
 * como si fuera a tocar algo del equipo, y quien duda no acepta.
 *
 * Y sigue habiendo tarjeta, que era la pregunta de diseño de verdad. Un gráfico
 * es inofensivo, así que la tentación es añadirlo directamente y ahorrar un
 * clic. No se hace: **nunca aparece un gráfico en la pantalla de alguien sin que
 * lo haya aceptado**. Un asistente que empieza a cambiar cosas sin preguntar
 * porque «esta es pequeña» es exactamente el que deja de dar confianza para las
 * grandes.
 *
 * Enseña la parametrización entera —métrica, forma, recorte— y no solo el
 * título, por el mismo motivo que las demás enseñan sus campos: quien acepta
 * tiene que ver qué va a salir, no fiarse de que el título lo resuma bien.
 */
export function ChartProposalCard({
  projectId,
  proposalId,
  estadoGuardado,
  propuesta,
}: ProposalCardProps & { propuesta: ChartProposal }) {
  const router = useRouter();
  const aceptarGrafico = useContext(AccionDelLienzo);
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function aceptar() {
    /* No debería llegar aquí sin acción —sin ella la tarjeta no pinta el botón—
       pero el estrechamiento de tipos lo pide, y una guarda de más en un camino
       de escritura no estorba. */
    if (!aceptarGrafico) return;

    setEstado('enviando');
    setError(null);

    const respuesta = await aceptarGrafico(projectId, propuesta);

    if (respuesta.error || !respuesta.anadido) {
      setError(respuesta.error ?? 'No se pudo añadir el gráfico.');
      setEstado('pendiente');
      return;
    }

    /* Sin `href`: el gráfico está en esta misma página, al final del lienzo.
       Un enlace que lleva a donde ya estás es ruido. */
    setResultado({ texto: 'Añadido al final de tu lienzo.', href: null });
    setEstado('hecho');

    /**
     * Y se repinta al momento.
     *
     * La acción ya revalida en el servidor, pero el lienzo es una isla de
     * cliente con su propio estado: sin este empujón, el gráfico se guardaba y
     * no aparecía hasta que alguien recargaba — que es exactamente lo contrario
     * de lo que promete una tarjeta que dice «Añadido».
     */
    router.refresh();
  }

  const { grafico } = propuesta;

  return (
    <Marco
      titulo="Gráfico propuesto para tu lienzo"
      sinAplicar="Todavía no está en tu lienzo."
      porQue={propuesta.porQue}
      estado={estado}
      error={error}
      resultado={resultado}
      /**
       * ⚠️ **Sin lienzo delante no hay botón de aceptar.**
       *
       * Pasa en `assistant-front`, donde PRAX tiene pantalla propia y no hay
       * ningún gráfico a la vista: un «Aceptar» ahí escribiría en una pantalla
       * que no se está viendo, y la promesa de «Añadido» no se podría comprobar.
       *
       * Se prefiere a esconder la propuesta entera: que PRAX haya pensado que
       * este corte de los datos es interesante **es** parte de la respuesta, y
       * tirarla porque esta pantalla no puede aplicarla sería perder justo lo que
       * se preguntó.
       */
      onAceptar={aceptarGrafico ? aceptar : undefined}
      onDescartar={() => setEstado('descartada')}
      projectId={projectId}
      proposalId={proposalId}
      estadoGuardado={estadoGuardado}
    >
      <p className="font-sans text-sm text-text-primary">
        <strong>{grafico.titulo}</strong>
      </p>

      {!aceptarGrafico && (
        <p className="font-sans text-xs text-text-secondary">
          Los gráficos se colocan desde{' '}
          {/* Cruza de zona → `<a>` duro, nunca `next/link`. Ver §16. */}
          <a
            href="/reports"
            className="text-primary underline-offset-2 transition-colors hover:underline"
          >
            Análisis
          </a>
          , y ahí se queda puesto para la próxima vez.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Campo termino="Qué mide" valor={ETIQUETA_METRICA[grafico.metrica] ?? grafico.metrica} />
        <Campo termino="Cómo se dibuja" valor={ETIQUETA_FORMA[grafico.forma] ?? grafico.forma} />
        {grafico.dias !== undefined && (
          <Campo
            termino={grafico.metrica === 'paradas_por_columna' ? 'Sin moverse desde' : 'Periodo'}
            valor={`${grafico.dias} días`}
          />
        )}
        {grafico.soloVencidas && <Campo termino="Filtro" valor="Solo las vencidas" />}
        {grafico.topN !== undefined && (
          <Campo termino="Recorte" valor={`Las ${grafico.topN} mayores, el resto en «Otras»`} />
        )}
      </dl>

      <p className="font-sans text-xs text-text-disabled">
        Va a tu panel y solo al tuyo: no cambia nada del proyecto y no lo ve el resto del equipo.
        Puedes moverlo, cambiarle el tamaño o quitarlo cuando quieras.
      </p>
    </Marco>
  );
}

const ETIQUETA_METRICA: Record<string, string> = {
  tareas_por_columna: 'Tareas por columna',
  tareas_por_prioridad: 'Tareas por prioridad',
  tareas_por_etiqueta: 'Tareas por etiqueta',
  carga_por_persona: 'Carga por persona',
  cerradas_por_persona: 'Tareas cerradas por persona',
  vencidas_por_persona: 'Tareas vencidas por persona',
  paradas_por_columna: 'Tareas paradas, por columna',
  flujo_por_columna: 'Flujo acumulado por columna',
  cierres_por_semana: 'Tareas cerradas por semana',
  creadas_por_semana: 'Tareas creadas por semana',
};

const ETIQUETA_FORMA: Record<string, string> = {
  barras: 'Barras',
  barras_horizontales: 'Barras horizontales',
  dona: 'Dona',
  lineas: 'Líneas',
  area_apilada: 'Áreas apiladas',
};

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
  projectId: string;
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
          <span className="font-sans text-[11px] uppercase tracking-wider text-text-disabled">
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
      <p className="rounded-xl border border-dashed border-border px-4 py-3 font-sans text-sm text-text-disabled">
        {/* «No se ha creado nada» solo valía para la tarea nueva: al descartar
            un cambio de encargado no había nada que crear. */}
        Propuesta descartada. No se ha aplicado nada.
      </p>
    );
  }

  /* El rojo se reserva para lo que no se deshace. Ver la nota de `tono`. */
  const acento = tono === 'destructivo' ? colors.error : colors.primary;

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{
        borderColor: alpha(acento, tono === 'destructivo' ? 45 : 30),
        background: alpha(acento, 6),
      }}
    >
      <header className="flex items-center gap-2">
        <span className="font-sans text-[11px] uppercase tracking-wider" style={{ color: acento }}>
          {titulo}
        </span>
        <span className="font-sans text-[11px] text-text-disabled">
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

      {estado === 'hecho' && resultado ? (
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
              {tono === 'destructivo' ? 'Borrar definitivamente' : 'Aceptar'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDescartar} disabled={estado === 'enviando'}>
            Descartar
          </Button>
          {error && <span className="font-sans text-sm text-error">{error}</span>}
        </div>
      )}
    </article>
  );
}

function Campo({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-sans text-[11px] uppercase tracking-wider text-text-disabled">
        {termino}
      </dt>
      <dd className="font-sans text-sm text-text-secondary">{valor}</dd>
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
