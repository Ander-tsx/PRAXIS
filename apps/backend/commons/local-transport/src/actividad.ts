import { transporteDelProceso } from './transporte';

/**
 * Si el proceso está en uso o en reposo (docs/PLAN-MONOLITO.md, M-K).
 *
 * ## Para qué
 *
 * Railway duerme un servicio tras 10 minutos **sin tráfico saliente**, y el
 * backend no dejaba de tenerlo aunque nadie lo usara: el consumidor de
 * automatizaciones consultaba Redis y Postgres cada segundo y el buzón de salida
 * de tasks y projects, cada cinco. Con `sleepApplication` activado, el
 * contenedor seguía despierto las 24 horas.
 *
 * Aquí se decide cuándo pueden parar: tras `PRAXIS_REPOSO_MS` (5 minutos por
 * defecto) sin un solo mensaje entre servicios. Toda petición de un usuario
 * cruza al menos uno —el gateway no responde nada de negocio por sí solo—, y
 * también las ediciones de documentos de collab, que cargan y guardan por
 * projects.
 *
 * ## Solo en el monolito
 *
 * Con procesos separados cada uno tendría su propio reloj y el del consumidor
 * nunca vería los mensajes que llegan a otro. Ahí no hay reposo: todo sigue
 * como siempre.
 *
 * El estado vive en `globalThis`, por lo mismo que el bus.
 */
const CLAVE = Symbol.for('praxis.local-transport.actividad');

interface Estado {
  ultima: number;
  oyentes: Set<() => void>;
}

type ConEstado = typeof globalThis & { [CLAVE]?: Estado };

function estado(): Estado {
  const g = globalThis as ConEstado;
  g[CLAVE] ??= { ultima: Date.now(), oyentes: new Set() };
  return g[CLAVE];
}

const REPOSO_POR_DEFECTO_MS = 5 * 60_000;

export function reposoMs(): number {
  const valor = Number(process.env.PRAXIS_REPOSO_MS);
  return Number.isFinite(valor) && valor > 0 ? valor : REPOSO_POR_DEFECTO_MS;
}

/** Si las tareas de fondo pueden dejar de sondear. Nunca con procesos separados. */
export function enReposo(ahora = Date.now()): boolean {
  if (transporteDelProceso() !== 'local') return false;
  return ahora - estado().ultima > reposoMs();
}

/**
 * Anota que el proceso está en uso. Si venía de reposo, avisa a quien espera
 * para reanudar: lo que se quedó pendiente se atiende en el acto, no en la
 * siguiente vuelta del temporizador.
 */
export function marcarActividad(ahora = Date.now()): void {
  const despertando = enReposo(ahora);
  estado().ultima = ahora;
  if (!despertando) return;
  for (const oyente of [...estado().oyentes]) {
    try {
      oyente();
    } catch {
      /* Un oyente que falla no puede impedir que despierten los demás. */
    }
  }
}

/** Se llama al salir de reposo. Devuelve cómo darse de baja. */
export function alReanudar(oyente: () => void): () => void {
  estado().oyentes.add(oyente);
  return () => {
    estado().oyentes.delete(oyente);
  };
}
