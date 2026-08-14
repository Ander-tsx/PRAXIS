'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationType } from '../../api/domain';
import { alpha, colors } from '../../tokens';

/** Lo que publica el gateway por el flujo. Espejo de `AvisoEnVivo` allí. */
interface AvisoRecibido {
  type: NotificationType;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  createdAt: string;
}

interface AvisoEnPantalla {
  id: number;
  texto: string;
  tono: string;
}

/** Cuánto se queda un aviso en pantalla antes de irse solo. */
const DURACION_MS = 6000;

/**
 * Tope de avisos apilados a la vez.
 *
 * Sin tope, alguien que asigne quince tareas de golpe llena la pantalla de
 * tarjetas y tapa la aplicación que vienen a anunciar.
 */
const MAXIMO_APILADO = 3;

export interface AvisosEnVivoProps {
  /**
   * Proxy de la zona, sin barra final: `/projects/api/gateway`.
   *
   * Tiene que ser el de la zona en la que estamos. El token vive en una cookie
   * httpOnly y `EventSource` no puede mandar cabeceras, así que la petición
   * **debe** cruzar el proxy para que le añada el `Authorization`.
   */
  gatewayPath: string;
}

/**
 * Avisos que llegan solos, mientras la pantalla está abierta.
 *
 * Escucha el flujo SSE del gateway —una sola vía: el servidor empuja y aquí no
 * se escribe nunca— y por cada aviso hace tres cosas: lo enseña unos segundos en
 * una tarjeta que entra por la derecha, suena, y **refresca la ruta**.
 *
 * Ese refresco es la parte que más importa y la más fácil de olvidar: sin él, el
 * aviso emergente contaría algo que la página de debajo sigue sin enseñar —la
 * insignia de la barra lateral con el número viejo, el tablero sin la tarea que
 * te acaban de asignar—. `router.refresh()` vuelve a pedir los componentes de
 * servidor conservando el estado del cliente, así que la pantalla se pone al día
 * sin perder lo que estuvieras haciendo.
 *
 * ⚠️ **No reemplaza a la bandeja.** Si nadie tiene la pestaña abierta, el aviso
 * ya está guardado y se ve al entrar. Esto es una capa encima; que Redis o el
 * flujo fallen degrada el tiempo real y nada más.
 */
export function AvisosEnVivo({ gatewayPath }: AvisosEnVivoProps) {
  const [avisos, setAvisos] = useState<AvisoEnPantalla[]>([]);
  const router = useRouter();
  const siguienteId = useRef(0);

  /**
   * El contexto de audio se crea una vez y a la primera necesidad.
   *
   * Crearlo al montar no sirve: los navegadores lo dejan suspendido hasta que ha
   * habido un gesto de la persona, y uno creado antes de eso nace mudo.
   */
  const audio = useRef<AudioContext | null>(null);

  const sonar = useCallback(() => {
    try {
      const Contexto =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Contexto) return;

      audio.current ??= new Contexto();
      const contexto = audio.current;
      if (contexto.state === 'suspended') void contexto.resume();

      /**
       * Dos notas cortas, generadas aquí en vez de reproducir un archivo.
       *
       * Un `.mp3` habría que servirlo desde `public/` de cada zona **con su
       * basePath delante**, que es justo el detalle que se olvida y deja un 404
       * silencioso. Esto no se puede romper al desplegar y pesa cero.
       */
      const ahora = contexto.currentTime;
      for (const [indice, frecuencia] of [880, 1174].entries()) {
        const oscilador = contexto.createOscillator();
        const volumen = contexto.createGain();

        oscilador.type = 'sine';
        oscilador.frequency.value = frecuencia;

        const inicio = ahora + indice * 0.09;
        /* Rampas en vez de saltos: un gain que cambia de golpe suena a chasquido. */
        volumen.gain.setValueAtTime(0, inicio);
        volumen.gain.linearRampToValueAtTime(0.06, inicio + 0.01);
        volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16);

        oscilador.connect(volumen).connect(contexto.destination);
        oscilador.start(inicio);
        oscilador.stop(inicio + 0.18);
      }
    } catch {
      /* Sin audio disponible el aviso se ve igual. No es motivo para romper nada. */
    }
  }, []);

  useEffect(() => {
    /**
     * `withCredentials` no hace falta —es el mismo origen, la cookie va sola—
     * pero el flujo sí tiene que ser de la propia zona: el shell reescribe
     * `/<zona>/*` hacia ella, así que esta ruta relativa resuelve bien tanto en
     * local como detrás del balanceador.
     */
    const fuente = new EventSource(`${gatewayPath}/me/notifications/stream`);

    function alLlegarAviso(evento: MessageEvent<string>) {
      let aviso: AvisoRecibido;
      try {
        aviso = JSON.parse(evento.data) as AvisoRecibido;
      } catch {
        return;
      }

      const id = siguienteId.current++;
      setAvisos((actuales) =>
        [
          ...actuales,
          { id, texto: describir(aviso), tono: TONO_POR_TIPO[aviso.type] ?? colors.primary },
        ].slice(-MAXIMO_APILADO),
      );

      sonar();
      router.refresh();

      window.setTimeout(() => {
        setAvisos((actuales) => actuales.filter((candidato) => candidato.id !== id));
      }, DURACION_MS);
    }

    fuente.addEventListener('aviso', alLlegarAviso as EventListener);

    /* Los `latido` se ignoran: existen solo para que ningún intermediario cierre
       la conexión por inactividad. Y `onerror` no cierra nada — `EventSource`
       reconecta solo, y cerrarlo aquí desactivaría esa reconexión. */

    return () => {
      fuente.removeEventListener('aviso', alLlegarAviso as EventListener);
      fuente.close();
    };
  }, [gatewayPath, router, sonar]);

  if (avisos.length === 0) return null;

  return (
    <div
      /* `aria-live="polite"`: se anuncia cuando quien escucha termina lo que
         esté leyendo, en vez de interrumpirle. Un aviso de cortesía no puede
         cortar la lectura de un formulario. */
      aria-live="polite"
      aria-label="Avisos recientes"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {avisos.map((aviso) => (
        <article
          key={aviso.id}
          className="animate-entrar-desde-la-derecha pointer-events-auto flex items-start gap-3 rounded-xl border border-border p-3"
          style={{
            background: colors.surfaceElevated,
            boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}`,
          }}
        >
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ background: aviso.tono }}
            aria-hidden="true"
          />
          <p className="font-sans text-sm leading-snug text-text-primary">{aviso.texto}</p>
        </article>
      ))}
    </div>
  );
}

/**
 * El texto del aviso emergente.
 *
 * Sin el nombre de quien lo provocó, a diferencia de la bandeja: por el flujo
 * solo viaja `actorId`, y resolverlo contra el directorio costaría una petición
 * por aviso para una tarjeta que dura seis segundos. En impersonal se lee igual
 * de bien, y el nombre está en la bandeja para quien lo quiera.
 */
function describir(aviso: AvisoRecibido): string {
  const proyecto = aviso.projectName ?? 'un proyecto';
  const tarea = aviso.taskTitle ?? 'una tarea';

  switch (aviso.type) {
    case 'INVITATION_RECEIVED':
      return `Te han invitado a «${proyecto}».`;
    case 'INVITATION_ACCEPTED':
      return `Han aceptado tu invitación a «${proyecto}».`;
    case 'INVITATION_REJECTED':
      return `Han rechazado tu invitación a «${proyecto}».`;
    case 'MEMBER_LEFT':
      return `Alguien ha salido de «${proyecto}».`;
    case 'MEMBER_REMOVED':
      return `Te han sacado de «${proyecto}».`;
    case 'TASK_ASSIGNED':
      return `Te han asignado «${tarea}» en «${proyecto}».`;
    case 'TASK_UNASSIGNED':
      return `Te han quitado de «${tarea}» en «${proyecto}».`;
    default:
      return 'Tienes un aviso nuevo.';
  }
}

/** Mismos colores que la bandeja: equipo en ámbar, tareas en violeta, salidas en rojo. */
const TONO_POR_TIPO: Record<NotificationType, string> = {
  INVITATION_RECEIVED: colors.accent,
  INVITATION_ACCEPTED: colors.success,
  INVITATION_REJECTED: colors.textSecondary,
  MEMBER_LEFT: colors.warning,
  MEMBER_REMOVED: colors.error,
  TASK_ASSIGNED: colors.primary,
  TASK_UNASSIGNED: colors.textSecondary,
};
