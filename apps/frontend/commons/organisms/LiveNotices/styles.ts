import type { SileoOptions } from 'sileo';

/**
 * Cómo se anuncia cada cosa: forma, color y ritmo.
 *
 * ## Por qué una tabla y no un `switch` dentro del componente
 *
 * Son ocho clases de aviso y cada una tiene cuatro decisiones —el estado de
 * color, la etiqueta corta, cuánto se queda y cómo se despliega—. Repartidas por
 * un `switch` de cien líneas no hay forma de ver si dos se parecen demasiado o
 * si a una se le olvidó algo; en una tabla se lee de un vistazo y se compara
 * columna a columna.
 *
 * ## El ritmo dice tanto como el color
 *
 * `sileo` pinta una píldora compacta que **se despliega** para enseñar el texto
 * y se vuelve a cerrar. Ese despliegue es la herramienta expresiva, y aquí se
 * usa a propósito:
 *
 * - Lo que **solo informa** —un mensaje, una tarea que te quitan— se despliega
 *   rápido y se cierra pronto: has visto que pasó algo y sigues a lo tuyo.
 * - Lo que **espera una decisión** —una invitación— se abre con un punto de
 *   retraso y se queda bastante más: si se cierra antes de leerlo, obliga a ir a
 *   buscarlo a la bandeja, que es justo lo que el aviso venía a evitar.
 * - Lo que **es una mala noticia** —te han sacado de un proyecto— se abre
 *   despacio y se queda lo máximo. No hay nada que pulsar y no debe pasar
 *   desapercibido.
 *
 * ⚠️ **Ninguno es `loading`.** Ese estado de `sileo` deja la tarjeta sin poder
 * descartarse (`cursor: default`, sin cierre automático) porque está pensado
 * para una operación en curso. Un aviso que llega solo y no se puede quitar es
 * una tarjeta clavada en la pantalla.
 */
export interface Presentacion {
  /** El estado de color de `sileo`. Decide el tono del título y de la insignia. */
  tipo: NonNullable<SileoOptions['type']>;
  /** La etiqueta corta de la píldora cerrada. `sileo` la pinta capitalizada. */
  titulo: string;
  /** Cuánto se queda en pantalla, en milisegundos. */
  duracion: number;
  /** Cuándo se despliega y cuándo se cierra, respecto a su aparición. */
  autopilot: { expand: number; collapse: number };
  /** El texto del botón, si el aviso lleva a algún sitio. */
  accion?: string;
}

/** Lo que se enseña cuando llega un tipo que este navegador no conoce todavía. */
export const PRESENTACION_POR_DEFECTO: Presentacion = {
  tipo: 'info',
  titulo: 'Aviso',
  duracion: 6000,
  autopilot: { expand: 400, collapse: 4500 },
  accion: 'Ver',
};

export const PRESENTACION_DE_MENSAJE: Presentacion = {
  tipo: 'info',
  titulo: 'Mensaje',
  /* Corto: en una conversación viva llegan seguidos, y uno que se queda mucho
     se solapa con el siguiente. */
  duracion: 5000,
  autopilot: { expand: 300, collapse: 3800 },
  accion: 'Abrir',
};

export const PRESENTACION_POR_TIPO: Record<string, Presentacion> = {
  /* Espera una decisión: se abre con retraso y se queda el doble. */
  INVITATION_RECEIVED: {
    tipo: 'action',
    titulo: 'Invitación',
    duracion: 11000,
    autopilot: { expand: 600, collapse: 9500 },
    accion: 'Ver',
  },
  INVITATION_ACCEPTED: {
    tipo: 'success',
    titulo: 'Aceptada',
    duracion: 6500,
    autopilot: { expand: 400, collapse: 5000 },
    accion: 'Ver',
  },
  INVITATION_REJECTED: {
    tipo: 'warning',
    titulo: 'Rechazada',
    duracion: 6500,
    autopilot: { expand: 400, collapse: 5000 },
  },
  MEMBER_LEFT: {
    tipo: 'warning',
    titulo: 'Baja',
    duracion: 6500,
    autopilot: { expand: 400, collapse: 5000 },
    accion: 'Ver',
  },
  /* Mala noticia y sin nada que pulsar —el proyecto ya daría 403—: despacio y
     lo máximo que se queda nada aquí. */
  MEMBER_REMOVED: {
    tipo: 'error',
    titulo: 'Sin acceso',
    duracion: 12000,
    autopilot: { expand: 800, collapse: 10500 },
  },
  TASK_ASSIGNED: {
    tipo: 'action',
    titulo: 'Tarea',
    duracion: 9000,
    autopilot: { expand: 500, collapse: 7500 },
    accion: 'Abrir',
  },
  /* Solo informa: rápido y fuera. */
  TASK_UNASSIGNED: {
    tipo: 'info',
    titulo: 'Tarea',
    duracion: 5500,
    autopilot: { expand: 350, collapse: 4200 },
  },
};

/** La presentación de un aviso de bandeja, con respaldo para lo desconocido. */
export function presentacionDe(tipo: string): Presentacion {
  return PRESENTACION_POR_TIPO[tipo] ?? PRESENTACION_POR_DEFECTO;
}

/**
 * El color de la píldora, **según el tema de la aplicación**.
 *
 * ## Por qué se sobrescribe el de serie
 *
 * `sileo` trae `{ light: '#1a1a1a', dark: '#f2f2f2' }`: negro casi puro sobre la
 * aplicación clara y blanco casi puro sobre la oscura. Contrasta, sí, pero **no
 * pertenece a la paleta**: en pantalla se lee como un elemento de otra
 * aplicación pegado encima, y el blanco puro sobre el tema oscuro deslumbra.
 *
 * ## Qué se usa en su lugar
 *
 * Los tonos que la paleta de PRAXIS ya tiene **para el tema contrario**:
 *
 * - Con la aplicación en oscuro, la píldora es `#e8eaf0` — el `text-primary` del
 *   tema oscuro, un blanco frío que ya sale por toda la interfaz.
 * - Con la aplicación en claro, es `#1e2535` — el `surface-elevated` del tema
 *   oscuro, un azul muy oscuro que no llega a negro.
 *
 * ⚠️ **La inversión hay que conservarla, no es una preferencia estética.**
 * `sileo` colorea la descripción según el `data-theme` que se le pasa —texto
 * oscuro cuando el tema es oscuro, porque da por hecho que la píldora será
 * clara—. Poner una píldora oscura sobre el tema oscuro dejaría texto oscuro
 * sobre fondo oscuro: ilegible. Si algún día se quiere una píldora del mismo
 * tono que la aplicación, hay que cambiar **también** el color de la
 * descripción, en `commons/styles/theme.css`.
 */
export const RELLENO_POR_TEMA: Record<'dark' | 'light', string> = {
  dark: '#2c354a', // A lighter elevated surface for high contrast
  light: '#1e2535', // Dark background on light theme for high contrast
};
