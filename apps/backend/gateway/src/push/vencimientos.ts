/**
 * Qué día es para quien recibe el aviso: **México**, UTC-6 todo el año (el país
 * dejó el horario de verano en 2022). Si algún día se atiende a otra zona, esto
 * pasa a ser por persona; hoy es una constante, a propósito.
 */
const DESFASE_MX_MS = 6 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

export type ModoVencimiento = 'hoy' | 'manana';

/**
 * Qué toca avisar a esta hora, si nadie lo pide explícitamente.
 *
 * El cron corre a las 00:00 y a las 12:00 de México. Pasada la medianoche
 * («mañana»), se avisa de lo que vence el día siguiente; al mediodía («hoy»), de
 * lo que vence hoy. Cada tarea recibe como mucho dos avisos y **ninguno se
 * repite**, sin necesidad de marcar nada en la base. Un retraso de horas no
 * cambia el modo: manda la mitad del día en la que cae.
 */
export function modoPorDefecto(ahora: number): ModoVencimiento {
  return new Date(ahora - DESFASE_MX_MS).getUTCHours() < 6 ? 'manana' : 'hoy';
}

/** El tramo `[from, to)` de fechas límite que cubre un modo, en UTC. */
export function tramoDe(modo: ModoVencimiento, ahora: number): { from: string; to: string } {
  const mx = new Date(ahora - DESFASE_MX_MS);
  const inicioDeHoy =
    Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate()) + DESFASE_MX_MS;
  const from = inicioDeHoy + (modo === 'manana' ? DIA_MS : 0);
  return { from: new Date(from).toISOString(), to: new Date(from + DIA_MS).toISOString() };
}

/** Lo que dice la notificación de una persona con N tareas. */
export function textoDelAviso(
  modo: ModoVencimiento,
  titulos: string[],
): { title: string; body: string } {
  const cuando = modo === 'hoy' ? 'hoy' : 'mañana';
  if (titulos.length === 1) {
    return { title: `Vence ${cuando}`, body: titulos[0].slice(0, 120) };
  }
  return {
    title: `${titulos.length} tareas vencen ${cuando}`,
    body: titulos
      .slice(0, 3)
      .map((t) => t.slice(0, 40))
      .join(' · '),
  };
}
