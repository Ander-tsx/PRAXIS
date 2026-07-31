'use client';

import { Badge, Button, Sparkle, alpha, colors } from '@praxis/commons';
import { useEffect, useId, useRef, useState } from 'react';
import { preguntarAction } from '@/app/(private)/[id]/actions';
import {
  type AssistantProposal,
  type AssistantQuota,
  type ChatTurn,
  MAX_HISTORIAL,
  esPropuestaDeAsignacion,
  esPropuestaDeTarea,
  formatoReinicio,
} from '@/lib/assistant';
import { AssignProposalCard, TaskProposalCard } from './ProposalCard';

interface Mensaje {
  id: string;
  role: 'user' | 'model';
  text: string;
  /** Solo en los del asistente. Cada una se pinta como tarjeta debajo. */
  proposals?: AssistantProposal[];
}

export interface AssistantChatProps {
  projectId: string;
  /** La cuota al cargar la página, antes de escribir nada. */
  cuotaInicial: AssistantQuota | null;
  nombres: Record<string, string>;
  etiquetas: Record<string, string>;
}

const SUGERENCIAS = [
  '¿Cómo va el proyecto?',
  '¿Dónde se está acumulando el trabajo?',
  '¿Para cuándo estaría vacío el tablero?',
];

/**
 * El asistente del proyecto, dentro de la propia página de reportes.
 *
 * Está aquí y no en una pantalla aparte porque **lee exactamente lo que se está
 * viendo**: los mismos percentiles, la misma predicción, el mismo reparto. Un
 * chat en otra pestaña obligaría a recordar el gráfico mientras se pregunta por
 * él, que es justo lo que esta sección existe para evitar.
 *
 * ### Lo que hace y lo que no
 *
 * Responde y **propone**. No crea nada: cada propuesta sale como una tarjeta con
 * su «Aceptar», y aceptar llama al mismo endpoint que el formulario del tablero,
 * con los mismos permisos. Ver `ProposalCard`.
 *
 * ### Sin streaming, a propósito
 *
 * Gemini lo soporta, pero atravesar SSE por una Server Action complica el bucle
 * entero y las respuestas de aquí son cortas. Un estado de carga honesto basta.
 *
 * ### El historial lo lleva el cliente
 *
 * No hay tabla de conversaciones —queda fuera del alcance— así que el hilo vive
 * en este estado y se reenvía en cada turno, recortado a `MAX_HISTORIAL`.
 * Consecuencia que hay que tener presente: **recargar la página borra la
 * conversación**. No se guarda en `localStorage` a propósito; lo que se habla de
 * un proyecto no tiene por qué quedarse en el navegador de quien lo usó.
 */
export function AssistantChat({
  projectId,
  cuotaInicial,
  nombres,
  etiquetas,
}: AssistantChatProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuota, setCuota] = useState<AssistantQuota | null>(cuotaInicial);

  const hiloRef = useRef<HTMLDivElement>(null);
  const campoId = useId();

  const agotada = cuota !== null && cuota.usados >= cuota.limite;

  /**
   * Al fondo con cada turno: en un hilo, lo último es lo que importa.
   *
   * Depende de la **longitud** y no del array: las tarjetas de propuesta guardan
   * su propio estado, y reaccionar al contenido volvería a bajar el hilo cada
   * vez que alguien acepta una, justo cuando está leyendo el resultado.
   */
  useEffect(() => {
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes.length, pendiente]);

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    if (!limpio || pendiente || agotada) return;

    const mio: Mensaje = { id: crypto.randomUUID(), role: 'user', text: limpio };

    /* El historial es lo que había ANTES de este mensaje: el propio mensaje va
       en `message`, y mandarlo dos veces le haría creer al modelo que se ha
       repetido. */
    const historial: ChatTurn[] = mensajes
      .slice(-MAX_HISTORIAL)
      .map(({ role, text }) => ({ role, text }));

    setMensajes((previos) => [...previos, mio]);
    setTexto('');
    setError(null);
    setPendiente(true);

    const respuesta = await preguntarAction(projectId, limpio, historial);

    setPendiente(false);
    if (respuesta.cuota) setCuota(respuesta.cuota);

    if (respuesta.error || !respuesta.reply) {
      setError(respuesta.error ?? 'El asistente no ha respondido nada.');
      /* El mensaje se queda escrito en el hilo pero vuelve al campo: si el fallo
         fue de red, reintentarlo no debería obligar a escribirlo otra vez. */
      setTexto(limpio);
      setMensajes((previos) => previos.filter((mensaje) => mensaje.id !== mio.id));
      return;
    }

    setMensajes((previos) => [
      ...previos,
      {
        id: crypto.randomUUID(),
        role: 'model',
        text: respuesta.reply as string,
        proposals: respuesta.proposals,
      },
    ]);
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border p-5"
      style={{ borderColor: alpha(colors.primary, 25), background: colors.surface }}
      aria-label="Asistente del proyecto"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl text-text-primary">Pregúntale a los datos</h3>
            <Badge
              variant="accent"
              className="inline-flex items-center gap-1 uppercase"
              style={{
                borderRadius: 4,
                background: colors.accent,
                color: colors.accentForeground,
                fontWeight: 700,
              }}
            >

              AI Powered
            </Badge>
          </div>
          <p className="font-sans text-sm text-text-secondary">
            Lee este mismo informe y responde con sus números. Cuando propone algo,
            no lo hace: lo deja para que lo revises.
          </p>
        </div>
        {cuota && <ContadorCuota cuota={cuota} />}
      </header>

      {mensajes.length > 0 && (
        <div
          ref={hiloRef}
          className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto pr-1"
          aria-live="polite"
        >
          {mensajes.map((mensaje) => (
            <div key={mensaje.id} className="flex flex-col gap-3">
              <Burbuja mensaje={mensaje} />

              {(mensaje.proposals ?? []).map((propuesta, indice) => {
                if (esPropuestaDeTarea(propuesta)) {
                  return (
                    <TaskProposalCard
                      key={`${mensaje.id}-${indice}`}
                      projectId={projectId}
                      propuesta={propuesta.args}
                      nombres={nombres}
                      etiquetas={etiquetas}
                    />
                  );
                }
                if (esPropuestaDeAsignacion(propuesta)) {
                  return (
                    <AssignProposalCard
                      key={`${mensaje.id}-${indice}`}
                      projectId={projectId}
                      propuesta={propuesta.args}
                      nombres={nombres}
                      etiquetas={etiquetas}
                    />
                  );
                }
                return null;
              })}
            </div>
          ))}

          {pendiente && (
            <div className="flex items-center gap-2">
              <ThinkingStars />
              <p className="font-sans text-sm italic text-text-disabled">Pensando…</p>
            </div>
          )}
        </div>
      )}

      {mensajes.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGERENCIAS.map((sugerencia) => (
            <button
              key={sugerencia}
              type="button"
              disabled={agotada}
              onClick={() => enviar(sugerencia)}
              className="rounded-full border border-border px-3 py-1.5 font-sans text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sugerencia}
            </button>
          ))}
        </div>
      )}

      {agotada && cuota ? (
        <p
          role="note"
          className="rounded-xl border px-4 py-3 font-sans text-sm text-warning"
          style={{
            background: alpha(colors.warning, 8),
            borderColor: alpha(colors.warning, 30),
          }}
        >
          Has gastado los <strong>{cuota.limite}</strong> mensajes de este mes. Vuelven
          el <strong>{formatoReinicio(cuota.reinicia)}</strong>.
        </p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            enviar(texto);
          }}
        >
          <label htmlFor={campoId} className="sr-only">
            Pregunta al asistente
          </label>
          <div className="flex items-stretch gap-2">
            <textarea
              id={campoId}
              rows={2}
              maxLength={2000}
              value={texto}
              disabled={pendiente}
              placeholder="¿Quién puede llevar el formulario de login?"
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={(evento) => {
                /* Enter envía, Mayús+Enter parte la línea: es lo que hace
                   cualquier chat, y `requestSubmit` respeta la validación del
                   formulario en vez de saltársela. */
                if (evento.key === 'Enter' && !evento.shiftKey) {
                  evento.preventDefault();
                  evento.currentTarget.form?.requestSubmit();
                }
              }}
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 font-sans text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            />
            {/* `items-stretch` + `style.height` en vez de `items-end`: con dos
                filas el botón por defecto mide una (`size="md"`, 40px) y quedaba
                anclado abajo, con un hueco encima que rompía la simetría con el
                campo. Va por `style` y no por una clase `h-full`: la clase
                compite con el `h-10` de `sizeClasses.md` en la misma
                especificidad, y quién gana depende del orden en que Tailwind
                generó el CSS, no del orden en el `className` — un `style` en
                línea no tiene esa ambigüedad. */}
            <Button
              type="submit"
              isLoading={pendiente}
              disabled={texto.trim().length === 0}
              style={{ height: '100%' }}
            >
              Preguntar
            </Button>
          </div>

          <p className="font-sans text-xs text-text-disabled">
            El asistente puede equivocarse. Revisa cada propuesta antes de aceptarla.
          </p>

          {error && <p className="font-sans text-sm text-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

/**
 * Tres `Sparkle` de distinto tamaño, cada una con su propio `animation-delay`.
 *
 * Antes era una sola estrella girando sobre sí misma — un adorno, no una
 * señal de actividad. Tres estrellas que titilan por turnos, cambiando de
 * tamaño y posición sin sincronizarse entre sí, es la misma idea que usan los
 * indicadores de "pensando" de otros asistentes: no gira nada, parpadea.
 */
function ThinkingStars() {
  return (
    <div className="relative h-6 w-11 shrink-0" aria-hidden="true">
      <Sparkle
        size={9}
        style={{
          position: 'absolute',
          left: 0,
          top: 6,
          color: colors.accent,
          animation: 'sparkle-drift 1.6s ease-in-out infinite',
        }}
      />
      <Sparkle
        size={18}
        style={{
          position: 'absolute',
          left: 12,
          top: -3,
          color: colors.primary,
          animation: 'sparkle-drift 1.9s ease-in-out infinite 0.3s',
        }}
      />
      <Sparkle
        size={11}
        style={{
          position: 'absolute',
          left: 30,
          top: 7,
          color: colors.primary,
          animation: 'sparkle-drift 1.4s ease-in-out infinite 0.6s',
        }}
      />
    </div>
  );
}

/**
 * «187 / 500 este mes».
 *
 * Poner el coste a la vista de quien lo gasta es lo correcto, y además evita la
 * sorpresa de encontrarse el límite de golpe. El número sale **del backend en
 * cada respuesta**, nunca de una cuenta local: un contador que discrepe del que
 * gobierna la cuota es peor que no tener contador.
 */
function ContadorCuota({ cuota }: { cuota: AssistantQuota }) {
  const quedan = Math.max(0, cuota.limite - cuota.usados);
  const apurado = quedan <= Math.max(3, Math.round(cuota.limite * 0.1));

  return (
    <div className="flex shrink-0 flex-col items-end">
      <span
        className="font-display text-lg leading-none tabular-nums"
        style={{ color: apurado ? colors.warning : colors.textSecondary }}
      >
        {cuota.usados} / {cuota.limite}
      </span>
      <span className="font-sans text-[11px] uppercase tracking-wider text-text-disabled">
        mensajes este mes
      </span>
    </div>
  );
}

function Burbuja({ mensaje }: { mensaje: Mensaje }) {
  const mio = mensaje.role === 'user';

  return (
    <div className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 font-sans text-sm leading-relaxed',
          mio ? 'text-text-primary' : 'text-text-secondary',
        ].join(' ')}
        style={
          mio
            ? { background: alpha(colors.primary, 14) }
            : { background: colors.surfaceElevated }
        }
      >
        {mensaje.text}
      </div>
    </div>
  );
}
