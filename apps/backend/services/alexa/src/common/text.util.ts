/** Normaliza texto para comparar estados: sin acentos, minúsculas y sin espacios extremos. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

/** Convierte una lista separada por comas de una variable de entorno en un Set normalizado. */
export function parseStatusList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter((item) => item.length > 0),
  );
}

/** Nombre legible de un usuario, con fallback al correo y luego al id. */
export function displayName(user: {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  credential?: { email?: string | null } | null;
}): string {
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (full) return full;
  const email = user.credential?.email;
  if (email) return email.split('@')[0];
  return user.id ?? 'Sin nombre';
}
