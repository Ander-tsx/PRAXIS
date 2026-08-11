export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días completos transcurridos entre una fecha y ahora (nunca negativo). */
export function daysSince(date: Date | string, now: Date = new Date()): number {
  const then = date instanceof Date ? date : new Date(date);
  const diff = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

/** Inicio del lunes de la semana natural que contiene `ref`. */
export function startOfCalendarWeek(ref: Date = new Date()): Date {
  const date = new Date(ref);
  date.setHours(0, 0, 0, 0);
  // getDay(): 0 = domingo. Lo desplazamos para que la semana empiece en lunes.
  const dayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayOffset);
  return date;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Ventanas de la semana actual y la anterior según el modo configurado. */
export function weekWindows(
  mode: 'calendar' | 'rolling',
  now: Date = new Date(),
): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
} {
  if (mode === 'rolling') {
    const currentEnd = now;
    const currentStart = addDays(now, -7);
    return {
      currentStart,
      currentEnd,
      previousStart: addDays(now, -14),
      previousEnd: currentStart,
    };
  }

  const currentStart = startOfCalendarWeek(now);
  return {
    currentStart,
    currentEnd: now,
    previousStart: addDays(currentStart, -7),
    previousEnd: currentStart,
  };
}

export function isWithin(date: Date | string | null | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return false;
  return value >= start && value < end;
}
