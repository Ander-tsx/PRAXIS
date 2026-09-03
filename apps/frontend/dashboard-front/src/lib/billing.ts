/**
 * La forma que devuelve `assistant-service` a través del gateway.
 *
 * Se declara aquí y no se importa de `@praxis/contracts` porque ese paquete es
 * de backend —arrastra `class-validator` y los decoradores de Swagger— y el
 * frontend solo necesita la forma. Mismo tipo que ya vive en
 * `reports-front/src/lib/assistant.ts`; no se comparte porque cada zona
 * resuelve la cuota contra una ruta distinta (`/me/assistant/quota` aquí,
 * `/projects/:id/assistant/quota` allá) y no hay una tercera zona que lo
 * necesite todavía como para subirlo a `commons`.
 *
 * ⚠️ Los límites de cada plan **no** se copian aquí: vienen en `limite`, que lo
 * manda el servidor resuelto contra el plan de la organización. El número del
 * plan que no es el tuyo no se conoce sin pedirlo, así que esta pantalla no lo
 * enseña — describe el otro plan en palabras, nunca con una cifra copiada.
 */
export interface AssistantQuota {
  /* 🕳️ `plan: 'FREE' | 'PRO'` era del catálogo por persona, retirado el
     2026-09-03. Ver `docs/AUDITORIA-PLANES.md`. */
  usados: number;
  limite: number;
  /** `YYYY-MM`. El periodo que se está consumiendo. */
  periodo: string;
  /** ISO 8601 del día 1 del mes que viene: cuándo vuelve a cero. */
  reinicia: string;
}

/**
 * Qué puede ofrecer la pantalla, según `GET /me/billing/estado`.
 *
 * Se pregunta en vez de deducirse del plan porque son cosas distintas:
 * `disponible` depende de que el **backend** tenga claves de Stripe —cosa que
 * el navegador no puede saber— y `gestionable`, de que esta persona ya sea
 * cliente. Alguien cuya organización nunca ha pasado por Stripe no tiene
 * suscripción que gestionar.
 */
export interface EstadoDeFacturacion {
  /** Hay pasarela configurada. Sin esto no se enseña ningún botón de compra. */
  disponible: boolean;
  /** Ya es cliente de Stripe: se le puede abrir el portal de facturación. */
  gestionable: boolean;
}

/** «2026-07» → «julio de 2026». Si el formato no cuadra, se enseña tal cual. */
export function formatoPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  if (!anio || !mes) return periodo;
  const fecha = new Date(anio, mes - 1, 1);
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(fecha);
}

/** Mismo formato que ya usa el contador del chat, para no decir «vuelve» de dos formas distintas. */
export function formatoReinicio(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'el día 1 del mes que viene';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(fecha);
}
