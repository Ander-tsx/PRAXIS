import { colors } from '../tokens';

/**
 * Lo que alguien dice que está haciendo.
 *
 * ⚠️ **No es `UserProfile.status`.** Aquel es el estado *administrativo* de la
 * cuenta —`ACTIVE`, `INACTIVE`, `SUSPENDED`—, lo pone la plataforma y decide si
 * la cuenta sirve. Esto lo elige su dueño y solo informa al resto del equipo.
 * Los nombres se parecen y por eso conviene tener la diferencia escrita: quien
 * decide si alguien entra es `status`, siempre.
 *
 * Espejo de `UserPresence` en el esquema de credentials y de `USER_PRESENCES`
 * en `@praxis/contracts`. Declarado aquí porque el frontend no consume ese
 * paquete —arrastra `class-validator` y `@nestjs/swagger`—, el mismo trato que
 * `GLOBAL_ROLES` y `PROJECT_PERMISSIONS`.
 */
export const PRESENCES = [
  'AVAILABLE',
  'BUSY',
  'IN_MEETING',
  'EATING',
  'AWAY',
  'DO_NOT_DISTURB',
] as const;

export type Presence = (typeof PRESENCES)[number];

/** Cómo se lee cada estado, y de qué color es su punto. */
export interface PresenceDescription {
  etiqueta: string;
  /** Una línea que explica cuándo ponerlo. Sale en el selector, no en el punto. */
  ayuda: string;
  color: string;
}

/**
 * El catálogo, en un solo sitio.
 *
 * ## Un color por estado, y ninguno repetido
 *
 * Los tres colores que **no se tocan** son los que ya trae aprendido cualquiera
 * de otra herramienta: verde disponible, rojo no molestar y gris ausente.
 * Romperlos obligaría a leer la etiqueta cada vez.
 *
 * ⚠️ Los otros tres compartían el ámbar de los tokens —«Ocupado», «En una
 * reunión» y «Comiendo» eran el mismo punto— así que la esfera no distinguía
 * nada y en el menú compacto, que es **solo** esferas, había tres opciones
 * idénticas. Ahora cada uno tiene el suyo, elegidos para separarse bien del
 * verde y del rojo vecinos y entre ellos: ámbar, violeta y naranja.
 *
 * Van literales y no por token a propósito: no son colores semánticos de la
 * interfaz —no dicen «error» ni «aviso»— sino la paleta de una lista cerrada,
 * y atarlos a `warning` fue justo lo que los hizo colisionar.
 */
export const PRESENCE_DESCRIPTIONS: Record<Presence, PresenceDescription> = {
  AVAILABLE: {
    etiqueta: 'Disponible',
    ayuda: 'Puedes recibir mensajes y te responderán pronto.',
    color: colors.success,
  },
  BUSY: {
    etiqueta: 'Ocupado',
    ayuda: 'Estás ocupado trabajando en algo.',
    color: '#FBBF24',
  },
  IN_MEETING: {
    etiqueta: 'En una reunión',
    ayuda: 'Estás en una llamada o reunión.',
    color: '#A78BFA',
  },
  EATING: {
    etiqueta: 'Comiendo',
    ayuda: 'Estás en la comida y vuelves luego.',
    color: '#FB923C',
  },
  AWAY: {
    etiqueta: 'Ausente',
    ayuda: 'No estás delante del ordenador.',
    color: colors.textDisabled,
  },
  DO_NOT_DISTURB: {
    etiqueta: 'No molestar',
    ayuda: 'Prefieres que no te escriban salvo que sea urgente.',
    color: colors.error,
  },
};

/**
 * Descripción de una presencia, tolerando lo que no se reconoce.
 *
 * Una cuenta creada antes de que esto existiera, o un valor que el backend
 * estrene mañana, cae a «Ausente» en vez de dejar el punto sin color: un
 * estado que no se sabe pintar no debe romper la lista del equipo.
 */
export function presenceOf(valor: string | null | undefined): PresenceDescription {
  return PRESENCE_DESCRIPTIONS[(valor ?? '') as Presence] ?? PRESENCE_DESCRIPTIONS.AWAY;
}

/**
 * La URL de la foto de perfil, lista para un `<img>`.
 *
 * ⚠️ `avatarUrl` viene **relativa al gateway** (`/users/<id>/avatar?v=…`) y no
 * al sitio: cada zona la sirve por su propio proxy, así que la misma foto es
 * `/dashboard/api/gateway/users/…` en una zona y `/projects/api/gateway/users/…`
 * en otra. Guardar la absoluta en la base habría atado el dato a una zona.
 *
 * Devuelve `null` cuando no hay foto, que es lo que `Avatar` espera para caer a
 * las iniciales.
 */
export function avatarHref(
  avatarUrl: string | null | undefined,
  gatewayPath: string,
): string | null {
  if (!avatarUrl) return null;
  /* 🔴 La foto de Google llega **absoluta** (`https://lh3.googleusercontent.com/…`),
     la subida a mano **relativa** al gateway. Anteponer el proxy a la primera
     la rompe, y no anteponerlo a la segunda también: por eso todo avatar tiene
     que pasar por aquí. */
  if (avatarUrl.startsWith('https://') || avatarUrl.startsWith('http://')) return avatarUrl;
  return `${gatewayPath}${avatarUrl}`;
}
