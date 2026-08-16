import type { AppNotification } from '@praxis/commons';

/**
 * Utilidades de la bandeja de avisos: agrupar por día y poner fecha.
 *
 * Vive en `lib/` y no dentro del organismo porque lo usan **las dos mitades**:
 * la page agrupa en el servidor y la lista pinta en el cliente. Es un módulo
 * plano, sin `next/headers` ni nada de servidor, así que cruzar la frontera no
 * arrastra nada al navegador.
 */

export interface GrupoDeAvisos {
  /** «Hoy», «Ayer», «Esta semana», «Antes». */
  etiqueta: string;
  avisos: AppNotification[];
}

const DIA_MS = 86_400_000;

/**
 * Reparte la página de avisos en tramos de tiempo.
 *
 * ## Por qué agrupar
 *
 * Veinte filas seguidas con «hace 2 h», «hace 3 h», «hace 1 d» obligan a leer
 * cada marca de tiempo para situarse. Con los tramos, la posición en la lista ya
 * dice cuándo pasó y la marca solo afina.
 *
 * ⚠️ **Los tramos se calculan con el reloj de quien renderiza**, y quien
 * renderiza es el servidor. Un servidor en UTC y alguien mirando desde
 * UTC−6 pueden discrepar en la franja de medianoche: lo que para esa persona
 * fue «ayer por la noche» puede salir bajo «Hoy». Es el mismo trato que ya
 * reciben las fechas del resto del repositorio (todas formateadas en el
 * servidor con `es-MX`), y por eso cada fila lleva además la **fecha completa
 * en su `title`**: la agrupación orienta, el `title` no deja lugar a dudas.
 *
 * El orden de entrada se conserva —el backend los da del más nuevo al más
 * viejo— y los grupos salen en su orden fijo, saltándose los vacíos.
 */
export function agruparPorDia(avisos: AppNotification[]): GrupoDeAvisos[] {
  const medianoche = new Date();
  medianoche.setHours(0, 0, 0, 0);

  const inicioHoy = medianoche.getTime();
  const inicioAyer = inicioHoy - DIA_MS;
  /* Siete días contando hoy: «esta semana» son los últimos siete, no la semana
     natural — nadie piensa su bandeja en lunes-a-domingo. */
  const inicioSemana = inicioHoy - 6 * DIA_MS;

  const cubos: Record<string, AppNotification[]> = {
    Hoy: [],
    Ayer: [],
    'Esta semana': [],
    Antes: [],
  };

  for (const aviso of avisos) {
    const cuando = new Date(aviso.createdAt).getTime();

    if (cuando >= inicioHoy) cubos.Hoy.push(aviso);
    else if (cuando >= inicioAyer) cubos.Ayer.push(aviso);
    else if (cuando >= inicioSemana) cubos['Esta semana'].push(aviso);
    else cubos.Antes.push(aviso);
  }

  return Object.entries(cubos)
    .filter(([, lista]) => lista.length > 0)
    .map(([etiqueta, lista]) => ({ etiqueta, avisos: lista }));
}

const FECHA_COMPLETA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** «15 de agosto de 2026, 02:31 p.m.» — para el `title` de cada fila. */
export function fechaCompleta(iso: string): string {
  return FECHA_COMPLETA.format(new Date(iso));
}

/**
 * «hace un momento» pesa menos que una marca de tiempo completa.
 *
 * `ahora` entra por parámetro en vez de leerse aquí con `Date.now()`: así la
 * lista entera se pinta contra **un solo instante** —el suyo, que refresca cada
 * minuto— y no contra veinte lecturas del reloj que podrían caer a los dos
 * lados de un cambio de minuto.
 */
export function tiempoRelativo(iso: string, ahora: number): string {
  const minutos = Math.round((ahora - new Date(iso).getTime()) / 60_000);

  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 1440) return `hace ${Math.round(minutos / 60)} h`;
  if (minutos < 10080) return `hace ${Math.round(minutos / 1440)} d`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
