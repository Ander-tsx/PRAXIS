'use client';

import { Badge, Button, PRIORITY_LABELS, type Priority, alpha, colors } from '@praxis/commons';
import { useState } from 'react';
import {
  type AceptarSobreTareaState,
  aceptarAsignacionAction,
  aceptarChecklistAction,
  aceptarComentarioAction,
  aceptarEdicionAction,
  aceptarMovimientoAction,
  aceptarTareaAction,
} from '@/app/(private)/[id]/actions';
import type {
  PropuestaAsignacion,
  PropuestaChecklist,
  PropuestaComentario,
  PropuestaEdicion,
  PropuestaMovimiento,
  PropuestaTarea,
} from '@/lib/assistant';

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

type Estado = 'pendiente' | 'enviando' | 'hecho' | 'descartada';

interface Resultado {
  texto: string;
  href: string | null;
}

export interface ProposalCardProps {
  projectId: string;
  /** `userId` → nombre para mostrar. Sin entrada, se enseña el id recortado. */
  nombres: Record<string, string>;
  /** `labelId` → nombre de la etiqueta. */
  etiquetas: Record<string, string>;
}

export function TaskProposalCard({
  projectId,
  propuesta,
  nombres,
  etiquetas,
}: ProposalCardProps & { propuesta: PropuestaTarea }) {
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
    >
      <p className="font-sans text-base font-semibold text-text-primary">{propuesta.title}</p>

      {propuesta.description && (
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          {propuesta.description}
        </p>
      )}

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
  propuesta,
  nombres,
}: ProposalCardProps & { propuesta: PropuestaAsignacion }) {
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
        respuesta.asignada.cuantos === 1 ? '1 encargado' : `${respuesta.asignada.cuantos} encargados`
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
  children,
}: {
  titulo: string;
  taskId: string;
  taskTitle?: string;
  porQue?: string;
  ejecutar: () => Promise<AceptarSobreTareaState>;
  projectId: string;
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
  propuesta,
  etiquetas,
}: ProposalCardProps & { propuesta: PropuestaEdicion }) {
  const marcas = (propuesta.labelIds ?? []).map((id) => etiquetas[id] ?? 'etiqueta');

  return (
    <CambioSobreTarea
      titulo="Edición propuesta"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
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
  propuesta,
}: ProposalCardProps & { propuesta: PropuestaMovimiento }) {
  return (
    <CambioSobreTarea
      titulo="Movimiento propuesto"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
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
    </CambioSobreTarea>
  );
}

export function ChecklistProposalCard({
  projectId,
  propuesta,
}: ProposalCardProps & { propuesta: PropuestaChecklist }) {
  return (
    <CambioSobreTarea
      titulo="Checklist propuesto"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
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
  propuesta,
}: ProposalCardProps & { propuesta: PropuestaComentario }) {
  return (
    <CambioSobreTarea
      titulo="Comentario propuesto"
      taskId={propuesta.taskId}
      taskTitle={propuesta.taskTitle}
      porQue={propuesta.porQue}
      projectId={projectId}
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
  onAceptar: () => void;
  onDescartar: () => void;
  children: React.ReactNode;
}) {
  if (estado === 'descartada') {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 font-sans text-sm text-text-disabled">
        {/* «No se ha creado nada» solo valía para la tarea nueva: al descartar
            un cambio de encargado no había nada que crear. */}
        Propuesta descartada. No se ha aplicado nada.
      </p>
    );
  }

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{
        borderColor: alpha(colors.primary, 30),
        background: alpha(colors.primary, 6),
      }}
    >
      <header className="flex items-center gap-2">
        <span className="font-sans text-[11px] uppercase tracking-wider text-primary">
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
      {porQue && (
        <p
          className="border-l-2 pl-3 font-sans text-sm leading-relaxed text-text-secondary"
          style={{ borderColor: alpha(colors.primary, 35) }}
        >
          {porQue}
        </p>
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
          <Button size="sm" onClick={onAceptar} isLoading={estado === 'enviando'}>
            Aceptar
          </Button>
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
