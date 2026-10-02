/**
 * El catálogo de planes: qué se puede contratar y cuánto da cada cosa.
 *
 * ## Un plan es la tercera capa, y no se parece a las otras dos
 *
 * PRAXIS ya tenía dos capas de autorización, y están explicadas en
 * `docs/backend/permissions.md`:
 *
 * 1. El **rol global** —quién administra la plataforma— que vive en
 *    permissions-service y es privado.
 * 2. El **rol de proyecto** —qué puedes hacer dentro de un tablero— que se
 *    resuelve en `ProjectPermissionGuard` contra `permissions/me`.
 *
 * Un plan es una tercera, y la diferencia importa: las dos primeras contestan
 * **«¿puedes hacer esto?»** y esta contesta **«¿te queda?»**. Un permiso
 * denegado se arregla pidiéndoselo a quien administra el proyecto; una cuota
 * agotada no se arregla con permisos, se arregla pagando o borrando. Son dos
 * conversaciones distintas y por eso el error también lo es: `FORBIDDEN` frente
 * a `QUOTA_EXCEEDED`, con el plan y el tope dentro para poder explicarlo.
 *
 * ⚠️ **Y no se comprueba en la pantalla.** La interfaz apaga botones y avisa
 * antes de gastar el viaje; quien decide es el gateway. Es la misma regla que
 * los permisos y por el mismo motivo: la pantalla es del cliente.
 *
 * ## Los números salen de aquí y de ningún otro sitio
 *
 * Este archivo es la única fuente. El gateway lo lee para negar, la pantalla de
 * planes para pintar la tabla comparativa, y el aviso de «te quedan tres» para
 * saber sobre cuántos. Escribir el mismo número dos veces —una en el guard y
 * otra en la tabla— es garantizar que un día la tabla prometa lo que el guard
 * niega, sin un solo error de compilación.
 */

/**
 * Que un tope no exista.
 *
 * ⚠️ **Sí, es `null`, y sí, choca con la invariante de que `null` significa «no
 * se pudo leer»** (PLAN-REDISENO, invariante 6). La diferencia es de dónde
 * viene: aquella habla de lo que devuelve un `fetch`, donde `null` es la única
 * forma de decir «hubo un error y degradamos». Esto es una **constante del
 * catálogo**, no viaja por la red y no puede fallar al leerse.
 *
 * Las alternativas se miraron y son peores: `Infinity` no sobrevive a `JSON`
 * —sale `null` al otro lado igualmente, pero por accidente y sin decirlo—, y
 * `-1` es un número mágico que alguien acaba sumando. Con `null` y `cabe()`
 * delante, no hay ninguna comparación suelta contra un tope en el repositorio.
 */
export const SIN_TOPE = null;

/** Un tope, o que no lo haya. */
export type Tope = number | null;

/**
 * ¿Cabe uno más?
 *
 * **Siempre por aquí, nunca con un `<` a mano.** Un `actual < tope` con `tope`
 * a `null` compara contra cero: `0 < null` es `false` y `−1 < null` también, así
 * que el plan sin límite se comporta como el plan más restrictivo de todos y no
 * da ningún error. Es el fallo que este helper existe para hacer imposible.
 */
export function cabe(actual: number, tope: Tope): boolean {
  return tope === SIN_TOPE || actual < tope;
}

/** Cuántos quedan, o `null` si no hay tope. Para el aviso, no para decidir. */
export function quedan(actual: number, tope: Tope): Tope {
  return tope === SIN_TOPE ? SIN_TOPE : Math.max(tope - actual, 0);
}

/**
 * El más restrictivo de dos topes.
 *
 * Existe porque los asientos tienen **dos** números que significan cosas
 * distintas —`Subscription.seats`, lo contratado en Stripe, y `quotas.asientos`,
 * hasta dónde llega el plan— y quien manda es el menor de los dos. D6 de
 * `docs/PLAN-ASIENTOS-CONGELADOS.md`.
 *
 * ⚠️ **Un `Math.min` a pelo no vale.** `Math.min(5, null)` es **0**, porque
 * `null` se convierte en cero: el plan sin tope pasaría a ser el único donde no
 * cabe nadie, y sin dar ningún error. Es exactamente el mismo fallo que `cabe()`
 * evita con el `<`, un operador más allá.
 */
export function menorTope(a: Tope, b: Tope): Tope {
  if (a === SIN_TOPE) return b;
  if (b === SIN_TOPE) return a;
  return Math.min(a, b);
}

/**
 * Los planes que existen. El orden es el de la tabla de precios.
 *
 * ⚠️ **Una sola escalera, y es una decisión de 2026-08-26.** Antes eran cinco en
 * dos escaleras paralelas —`PLUS`/`PRO` individuales y `TEAM`/`BUSINESS` de
 * empresa— y se colapsaron: desde que la organización **contiene** los proyectos,
 * «individual» deja de ser una categoría y pasa a ser una organización de un
 * asiento. Dos escaleras obligaban a cada pantalla, cada guard y cada correo a
 * saber en cuál estabas, para siempre.
 *
 * ⚠️ **`PRO` ha vuelto, y no es aquel.** Aquel era un plan de la escalera
 * individual; éste es un peldaño de **la** escalera, entre `FREE` y `TEAM`, y
 * vale dentro de la organización que lo paga como todos los demás. Que se llame
 * igual es porque es el nombre que la gente entiende, no porque quede nada de
 * lo anterior: `PLUS` sigue borrado y el `PRO` **por usuario** del asistente se
 * retiró el 2026-09-03 (ver `docs/AUDITORIA-PLANES.md`).
 */
export enum PlanTier {
  /** Lo que tienes sin pagar nada. No se contrata: se es. */
  FREE = 'FREE',
  /**
   * Un equipo pequeño, a precio fijo, con MCP y GitHub.
   *
   * Hasta 2026-10-02 era «una persona o dos que usan PRAX en serio», por
   * asiento y con seis veces la IA del gratuito. Ahora es un precio fijo para
   * toda la organización, con la IA del gratuito por persona y el argumento en
   * las integraciones (`docs/PLAN-PRO-INTEGRACIONES.md`). Sigue **por debajo de
   * Equipo en todos los ejes**: lo que los separa es el tamaño.
   *
   * ⚠️ **No confundir con el `PRO` viejo.** Hubo un `PRO` por persona en
   * `assistant.assistant_subscriptions`, anterior a las organizaciones, que se
   * concedía a mano desde el panel de administración y solo gobernaba la cuota
   * del asistente. Se retiró entero: ese sistema tenía su propio contador, su
   * propia escalera y podía contradecir al plan de la organización. Éste es un
   * plan del catálogo como los demás, se contrata por Stripe y vale dentro de
   * la organización que lo paga.
   */
  PRO = 'PRO',
  /** Un equipo que crece, por asiento. Sin mes gratis desde 2026-10-02. */
  TEAM = 'TEAM',
  /** Una empresa en marcha, con gente entrando y saliendo. */
  BUSINESS = 'BUSINESS',
  /** Organización grande. Sin topes de inventario, y se habla con alguien. */
  ENTERPRISE = 'ENTERPRISE',
}

/**
 * Cómo se contrata un plan.
 *
 * ⚠️ **Existe porque `envPrecio: null` era ambiguo.** `FREE` y `ENTERPRISE` no
 * tienen precio en Stripe, pero por razones opuestas: al primero no se le puede
 * pagar, y al segundo hay que escribirle. Deducir uno de los dos casos de la
 * ausencia de un precio deja a la pantalla enseñando el botón equivocado, y no da
 * ningún error.
 */
export enum PlanContratacion {
  /** No se contrata: se es. Solo `FREE`. */
  NINGUNA = 'NINGUNA',
  /** Se compra solo, por Stripe Checkout. */
  AUTOSERVICIO = 'AUTOSERVICIO',
  /** Se habla con alguien. No hay precio, hay un formulario. */
  CONTACTO = 'CONTACTO',
}

/** Lo que da un plan. */
export interface PlanQuotas {
  /**
   * Asientos de la organización: cuánta gente cabe dentro.
   *
   * ⚠️ **Es el tope que sustituyó a `miembrosPorProyecto`.** Desde que quien está
   * en un proyecto tiene que estar en la organización, el techo de un tablero ya
   * lo pone el asiento y un segundo tope por proyecto solo era una cifra más que
   * explicar y que vigilar. Si vuelve a aparecer un límite por proyecto, es señal
   * de que alguien reabrió la puerta a los invitados externos.
   *
   * ⚠️ **Una invitación sin aceptar ocupa el suyo.** Si no lo ocupara se podrían
   * mandar mil sobre tres y el tope reventaría al aceptarlas, con la organización
   * ya por encima de lo que paga y sin más salida que echar a alguien.
   */
  asientos: Tope;
  /**
   * Proyectos de la organización.
   *
   * ⚠️ **Por organización, no por persona.** Es la mitad que hace que el plan
   * tenga sentido: veinticinco proyectos **para el equipo**, no veinticinco para
   * cada uno. Los `DELETED` no cuentan — cobrar por algo que ya no se ve es la
   * clase de cuota que parece una avería.
   */
  proyectos: Tope;
  /**
   * **Tokens PRAX** del asistente **por persona, por organización y por mes
   * natural** (D8 de docs/PLAN-PRAX-SEMIAGENTICO.md).
   *
   * ## Por qué tokens y no mensajes
   *
   * Con PRAX semi-agéntico un mensaje ya no cuesta lo mismo que otro: uno que
   * consulta tres veces antes de responder lee el contexto cuatro veces, y una
   * conversación larga reenvía todo su historial en cada turno. Contar mensajes
   * cobraba igual un «hola» que un informe de tres proyectos.
   *
   * Un **token PRAX** pondera cada token por lo que cuesta de verdad en Gemini
   * Flash: los de entrada valen 1, los que salen de caché 0,25 y los que el
   * modelo escribe —texto y razonamiento— 8. Ver `tokensPrax()` en
   * `contracts/assistant`.
   *
   * ⚠️ **Por persona y no agregado al equipo.** Se consideró un tope de equipo y
   * se descartó: un límite así se agota por lo que hizo otro, a media tarde, sin
   * aviso y sin nada que la persona pueda hacer. La organización **ve** el
   * agregado en su portal, que es para lo que sirve saberlo; lo que se niega se
   * niega por lo que gastaste tú. El techo total sigue acotado: es este número
   * por los asientos.
   *
   * ⚠️ **Y también por organización, desde 2026-08-28.** Antes el contador era
   * `(persona, mes)` a secas. Con el plan valiendo solo dentro de la
   * organización que lo paga, un contador único no se puede aplicar: alguien que
   * gastara 50 en la BUSINESS del trabajo entraría en su espacio personal —tope
   * 13— ya por encima del límite, bloqueado desde el primer mensaje y sin nada
   * que explicara por qué. La clave es `(persona, organización, mes)`.
   *
   * ⚠️ **Sí, eso multiplica la cuota gratuita por el número de organizaciones**,
   * y es lo mismo que hacen los productos que cobran por espacio de trabajo. Lo
   * que acota la multiplicación es `MAX_ORGANIZACIONES_PROPIAS`, no este número.
   */
  iaTokensMensualesPorPersona: Tope;
  /** Reglas de automatización activas en un proyecto. Las pausadas no cuentan. */
  automatizacionesPorProyecto: Tope;
  /** Lo que suman los adjuntos de la organización, en megabytes. */
  almacenamientoOrgMb: Tope;
  /**
   * Hasta dónde llega hacia atrás el historial de Análisis, en días.
   *
   * ⚠️ **No es una cuota que niegue una escritura**, y por eso no tiene su
   * `QuotaKind`: es una ventana de lectura. Lo que hace es acotar el `from` que
   * acepta un informe, y la pantalla tiene que **decirlo** — un gráfico que empieza
   * noventa días atrás sin explicar por qué se lee como un dato incompleto, no
   * como un plan.
   */
  historialAnalisisDias: Tope;
}

/** Una fila del catálogo. */
export interface PlanSpec {
  tier: PlanTier;
  /** Como se llama en la pantalla. */
  nombre: string;
  /** La frase de una línea de la tabla de precios. */
  resumen: string;
  /** A quién va dirigido, en una línea. Para la cabecera de su columna. */
  paraQuien: string;
  quotas: PlanQuotas;
  contratacion: PlanContratacion;
  /**
   * Días de prueba antes del primer cobro. `0` si no hay.
   *
   * 🔴 **Solo lo tiene el primer peldaño de pago, y es una decisión del dueño del
   * producto**, no una promoción que se pueda mover. Ese peldaño es `PRO` desde
   * 2026-10-02 (antes, `TEAM`). **Y se da una vez por persona y por
   * organización**: lo comprueba el checkout contra `trial_redemptions`. Lo aplica Stripe con
   * `trial_period_days` —no un `setTimeout` nuestro— y queda registrado con su
   * instante en `BillingEvent`, porque «no me avisaron» es la queja más cara de
   * este terreno.
   */
  diasDePrueba: number;
  /**
   * La variable de entorno con el precio de Stripe.
   *
   * No el identificador: **los precios cambian entre la cuenta de pruebas y la de
   * producción**, y meterlos en el código obligaría a un despliegue para cambiar
   * una tarifa. `null` en los que no se compran solos — mira `contratacion` para
   * saber por qué, que no es lo mismo en `FREE` que en `ENTERPRISE`.
   */
  envPrecio: string | null;
  /**
   * Asientos mínimos al contratar.
   *
   * Es lo que hace que ampliar el equipo cueste algo y que el techo total de IA
   * esté acotado en los planes que van por asiento. En uno de precio fijo no
   * significa nada: se contrata uno y entran `quotas.asientos`.
   */
  asientosMinimos: number;
  /**
   * 🔴 **El precio es el mismo para toda la organización, no por asiento.**
   *
   * Solo `PRO`, desde 2026-10-02 (`docs/PLAN-PRO-INTEGRACIONES.md`, D1). Cambia
   * tres cosas, y olvidar cualquiera no da error:
   *
   * 1. El checkout manda `quantity: 1`. La cantidad de Stripe **no** son los
   *    asientos.
   * 2. `Subscription.seats` no sale de esa cantidad sino del tope del plan
   *    (`asientosContratados`). Con la cantidad, un Pro quedaría en **un**
   *    asiento —`min(1, 7)`— y el resto del equipo, congelado.
   * 3. No se compran ni se quitan asientos sueltos: para más gente, otro plan.
   */
  precioFijo: boolean;
  /**
   * Si el plan trae las integraciones: el MCP de Praxis y GitHub.
   *
   * `PRO` es el primero que las tiene (D2 de `docs/PLAN-PRO-INTEGRACIONES.md`)
   * y los de arriba las heredan. No es un número de `PlanQuotas` sino una
   * capacidad, pero vale la trampa 23 igual: **se comprueba en el gateway** al
   * crear un token y en cada llamada al MCP (`McpAccessService`).
   */
  integraciones: boolean;
}

/**
 * El catálogo, entero.
 *
 * ## De dónde salen estos números
 *
 * Del encargo, literal: *«cantidades bastante indulgentes pero que a final de
 * cuentas están en las letras pequeñas»*. Están puestos para que **nadie los
 * toque en un uso normal** y para que existan de verdad cuando alguien empuja.
 *
 * ⚠️ **Los topes de IA son tokens PRAX desde 2026-09-29, y son provisionales.**
 * Salen de los mensajes que daba cada plan multiplicados por ~20.000 tokens PRAX
 * por turno —un turno con briefing ronda 10-15 mil de entrada y unos cientos de
 * salida, que a ×8 pesan—, redondeados. Se recalibran con las líneas
 * `gemini_uso` de producción (F0 del plan de PRAX). `FREE` sigue siendo el mismo
 * orden de magnitud que sus 13 mensajes, y `ASSISTANT_LIMITE_POR_DEFECTO` —la red
 * de abajo del servicio— es ese mismo número.
 *
 * ⚠️ **`FREE` da 3 asientos y 3 proyectos** porque el plan gratuito tiene que
 * seguir sirviendo para lo que sirve hoy: una persona y un par de amigos con sus
 * proyectos. Un gratuito que no da para eso no es un escalón, es un anuncio.
 */
export const PLANS: Record<PlanTier, PlanSpec> = {
  [PlanTier.FREE]: {
    tier: PlanTier.FREE,
    nombre: 'Gratis',
    resumen: 'Tú y dos personas más, con tres proyectos y PRAX para probar.',
    paraQuien: 'Una persona y dos más',
    quotas: {
      asientos: 3,
      proyectos: 3,
      iaTokensMensualesPorPersona: 250_000,
      automatizacionesPorProyecto: 3,
      almacenamientoOrgMb: 200,
      historialAnalisisDias: 90,
    },
    contratacion: PlanContratacion.NINGUNA,
    diasDePrueba: 0,
    envPrecio: null,
    asientosMinimos: 1,
    precioFijo: false,
    integraciones: false,
  },
  [PlanTier.PRO]: {
    tier: PlanTier.PRO,
    nombre: 'Pro',
    resumen: 'Un precio fijo para un equipo pequeño, con MCP y GitHub. El primer mes es gratis.',
    paraQuien: 'Un equipo pequeño que quiere lo indispensable sin pagar por asiento',
    /**
     * ⚠️ **Desde 2026-10-02 es un plan de precio fijo** (`PLAN-PRO-INTEGRACIONES`,
     * D4–D8): 99 MXN al mes para toda la organización. Lo que vende no es la IA
     * —da la misma por persona que el gratuito— sino el tamaño y las
     * integraciones (MCP y GitHub). Lo que lo separa de Equipo es el tamaño.
     */
    quotas: {
      /* Siete, y es tope duro: sin cobro por asiento, para el octavo hay que
         pasar a Equipo. */
      asientos: 7,
      proyectos: 7,
      /**
       * Lo mismo que el gratuito, por persona.
       *
       * ⚠️ **Estuvo en 1,5 M y se bajó** con el precio fijo: el coste de IA
       * crece con cada persona y los 99 MXN no. El techo del equipo sí sube
       * —7 × 250 mil frente a 3 × 250 mil—, y la escalera lo admite porque pide
       * «al menos tanto», no «más».
       */
      iaTokensMensualesPorPersona: 250_000,
      automatizacionesPorProyecto: 5,
      almacenamientoOrgMb: 1_024,
      historialAnalisisDias: 90,
    },
    contratacion: PlanContratacion.AUTOSERVICIO,
    /* El mes gratis pasó de Equipo a aquí el 2026-10-02, por decisión del dueño
       (D9): Pro es ahora el primer peldaño de pago. Uno por persona y por
       organización — lo comprueba el checkout del gateway. */
    diasDePrueba: 30,
    envPrecio: 'STRIPE_PRICE_PRO',
    asientosMinimos: 1,
    precioFijo: true,
    integraciones: true,
  },
  [PlanTier.TEAM]: {
    tier: PlanTier.TEAM,
    nombre: 'Equipo',
    resumen: 'Veinticinco proyectos, PRAX a diario y se paga por asiento.',
    paraQuien: 'Un equipo que crece y paga por quien entra',
    quotas: {
      asientos: 15,
      proyectos: 25,
      iaTokensMensualesPorPersona: 2_000_000,
      automatizacionesPorProyecto: 25,
      almacenamientoOrgMb: 10_240,
      historialAnalisisDias: 365,
    },
    contratacion: PlanContratacion.AUTOSERVICIO,
    /* Sin mes gratis desde 2026-10-02: se movió a Pro (D9). */
    diasDePrueba: 0,
    envPrecio: 'STRIPE_PRICE_TEAM',
    asientosMinimos: 1,
    precioFijo: false,
    integraciones: true,
  },
  [PlanTier.BUSINESS]: {
    tier: PlanTier.BUSINESS,
    nombre: 'Negocio',
    resumen: 'Ciento cincuenta proyectos, cien asientos y el registro completo.',
    paraQuien: 'Una empresa en marcha, con gente entrando y saliendo',
    quotas: {
      asientos: 100,
      proyectos: 150,
      iaTokensMensualesPorPersona: 6_000_000,
      automatizacionesPorProyecto: SIN_TOPE,
      almacenamientoOrgMb: 102_400,
      historialAnalisisDias: SIN_TOPE,
    },
    contratacion: PlanContratacion.AUTOSERVICIO,
    diasDePrueba: 0,
    envPrecio: 'STRIPE_PRICE_BUSINESS',
    asientosMinimos: 5,
    precioFijo: false,
    integraciones: true,
  },
  [PlanTier.ENTERPRISE]: {
    tier: PlanTier.ENTERPRISE,
    nombre: 'Empresa',
    resumen: 'Sin topes de inventario. Los asientos son el único número.',
    paraQuien: 'Organización grande, con informática propia',
    quotas: {
      asientos: SIN_TOPE,
      proyectos: SIN_TOPE,
      iaTokensMensualesPorPersona: 20_000_000,
      automatizacionesPorProyecto: SIN_TOPE,
      almacenamientoOrgMb: SIN_TOPE,
      historialAnalisisDias: SIN_TOPE,
    },
    contratacion: PlanContratacion.CONTACTO,
    diasDePrueba: 0,
    envPrecio: null,
    asientosMinimos: 10,
    precioFijo: false,
    integraciones: true,
  },
};

/** El catálogo como lista, en el orden de la tabla de precios. */
export const PLAN_LIST: PlanSpec[] = [
  PLANS[PlanTier.FREE],
  /* ⚠️ **El orden de la escalera es este, no el del enum.** La tabla de precios
     se pinta de aquí, así que un plan nuevo va en su peldaño y no al final. */
  PLANS[PlanTier.PRO],
  PLANS[PlanTier.TEAM],
  PLANS[PlanTier.BUSINESS],
  PLANS[PlanTier.ENTERPRISE],
];

/** Los cinco identificadores, para validar un `@IsIn`. */
export const PLAN_TIERS = Object.values(PlanTier);

/**
 * Los que se compran solos, y por tanto los únicos que abren un checkout.
 *
 * ⚠️ **No es «los de pago».** `ENTERPRISE` se paga y no está aquí: no tiene
 * precio en Stripe porque se negocia. Ofrecerle un botón de compra sería ofrecer
 * uno que responde 503 al pulsarlo.
 */
export const PLANES_AUTOSERVICIO = PLAN_LIST.filter(
  (plan) => plan.contratacion === PlanContratacion.AUTOSERVICIO,
);

/**
 * El plan de quien no tiene ninguno.
 *
 * **Sin fila en la base = FREE**, y sigue siendo la red aunque desde 2026-08-26
 * la organización se cree al registrarse: una lectura que no encuentra fila no
 * puede quedarse sin plan, y el más restrictivo es la única respuesta segura.
 *
 * ⚠️ **Antes esto era además una decisión de diseño** —«no crees filas para todo
 * el mundo antes de que sirvan de algo»— y ya no lo es: desde que la organización
 * **contiene** los proyectos, sirve desde el minuto uno y sin ella no hay dónde
 * poner nada. Lo que queda es la defensa, no la política.
 */
export const PLAN_POR_DEFECTO = PlanTier.FREE;

/**
 * Cuántas organizaciones puede tener alguien **a su nombre**.
 *
 * ## Por qué es una constante y no una cuota de plan
 *
 * 🔴 **Lo fue, y era una contradicción.** `organizacionesPropias` vivía en
 * `PlanQuotas` con una escalera (1 / 3 / sin tope) que nunca llegó a
 * comprobarse — el tope estaba escrito, el mensaje de error también, y ningún
 * código lo invocaba.
 *
 * Desde que el plan vale **solo dentro de la organización que lo paga**, esa
 * escalera se contradice a sí misma: un plan que te deja crear más
 * organizaciones es un beneficio escapándose de la organización justo después
 * de haber decidido que no puede. Cuántas organizaciones caben a nombre de
 * alguien es una propiedad **de la persona**, no de ninguna suscripción.
 *
 * ## Y es lo que cierra el farmeo
 *
 * ⚠️ Crear organizaciones ya no multiplica ningún beneficio de pago, pero sí
 * multiplicaría las gratuitas: tres proyectos y su cuota de IA **por cada una**.
 * Este número es el techo de esa multiplicación, y es el único que hay.
 *
 * ⚠️ **Cuenta la personal**, que se crea sola y no se puede borrar. O sea: la
 * propia más dos equipos. Lo que **no** cuenta es estar invitado en las de
 * otros, que no tiene límite — si contara, quien colabora con tres clientes se
 * quedaría sin poder tener la suya, que es justo al revés de lo que se quiere.
 */
export const MAX_ORGANIZACIONES_PROPIAS = 3;

/** Las cuotas de un plan, con FREE como red por si llega uno que no existe. */
export function quotasDe(tier: PlanTier | string | null | undefined): PlanQuotas {
  const spec = PLANS[tier as PlanTier];
  return (spec ?? PLANS[PLAN_POR_DEFECTO]).quotas;
}

/**
 * Los asientos que se guardan en `Subscription.seats` para lo que dijo Stripe.
 *
 * En un plan por asiento son la cantidad de la línea de Stripe. En uno de
 * **precio fijo** la cantidad es siempre 1 y no dice nada: los asientos son el
 * tope del plan. ⚠️ Guardar la cantidad dejaría un Pro en **un** asiento y al
 * resto del equipo congelado, sin un solo error (ver `precioFijo`).
 *
 * `undefined` si no hay nada que escribir: un evento sin cantidad no debe
 * pisar los asientos que ya había.
 */
export function asientosContratados(
  tier: PlanTier | string | null | undefined,
  cantidad: number | undefined,
): number | undefined {
  const spec = PLANS[tier as PlanTier];
  if (spec?.precioFijo && spec.quotas.asientos !== SIN_TOPE) return spec.quotas.asientos;
  return cantidad;
}

/**
 * Qué se mide.
 *
 * Viaja en el `error.details` de un 402 para que la pantalla sepa **qué**
 * ofrecer: quien se queda sin proyectos ve «amplía el plan o archiva uno», y
 * quien se queda sin IA ve cuándo se le renueva. Un mensaje genérico obliga a
 * leerlo para saber qué hacer.
 */
export enum QuotaKind {
  PROYECTOS = 'proyectos',
  IA_MENSUAL = 'ia_mensual',
  ASIENTOS = 'asientos',
  ORGANIZACIONES = 'organizaciones',
  AUTOMATIZACIONES = 'automatizaciones',
  ALMACENAMIENTO = 'almacenamiento',
  /**
   * El plan no trae integraciones (MCP, GitHub). No es un número que se agote
   * sino una capacidad que falta: `tope` y `actual` van a 0.
   */
  INTEGRACIONES = 'integraciones',
}

/**
 * El código de error de una cuota agotada.
 *
 * ⚠️ **402 y no 403**, y la diferencia es la que separa las dos capas: un 403 se
 * arregla pidiendo permiso a una persona, un 402 no se arregla con permisos.
 * Meterlos en el mismo saco haría que la pantalla ofreciera «pídeselo a quien
 * administra el proyecto» a alguien que lo administra él.
 *
 * Es el mismo patrón que `PROJECT_SUSPENDED_CODE`, que existe por lo mismo.
 */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/** Lo que acompaña a un 402, para poder explicarlo sin adivinar. */
export interface QuotaExceededDetails {
  kind: QuotaKind;
  tier: PlanTier;
  tope: number;
  actual: number;
  /** Solo en `IA_MENSUAL`: cuándo vuelve a cero, en ISO. */
  reiniciaEn?: string;
  /**
   * Si quien recibe el 402 puede ampliar el plan por su cuenta.
   *
   * 🔴 **Desde que los topes se cuentan por organización, quien ve el mensaje
   * puede no ser quien puede resolverlo**: en un equipo de diez, nueve no tocan
   * la tarjeta de la empresa. Sin este dato la pantalla solo puede ofrecer un
   * botón de pagar a todo el mundo, y delante de quien no puede pagar eso se lee
   * como una avería — y una avería no se paga, se abandona.
   *
   * ⚠️ **Ausente significa «no se sabe», y la pantalla ofrece la salida.** Es la
   * asimetría de siempre: esconderle el camino a quien sí puede pagar cuesta más
   * que enseñárselo a quien no.
   */
  puedeAmpliar?: boolean;
}

/**
 * El orden de los planes, de menos a más.
 *
 * ⚠️ **Es un orden declarado, no una comparación de cuotas.** Se intentó
 * deducirlo —«mejor es el que da más»— y no sale: los ejes no van todos en la misma
 * dirección (un plan puede dar más proyectos y menos de otra cosa), así que no hay
 * un orden total, y elegir «el mayor por cada eje» construiría un plan que no se
 * vende. Con un orden escrito, `mejorPlan` devuelve siempre uno del catálogo.
 */
export const PLAN_RANK: Record<PlanTier, number> = {
  [PlanTier.FREE]: 0,
  [PlanTier.PRO]: 1,
  [PlanTier.TEAM]: 2,
  [PlanTier.BUSINESS]: 3,
  [PlanTier.ENTERPRISE]: 4,
};

/**
 * El plan que vale para alguien que pertenece a varias organizaciones.
 *
 * **El mejor de todos, y no el de una elegida.** Alguien puede estar en su
 * organización personal (FREE) y a la vez en la de su empresa (BUSINESS): si el
 * plan dependiera de cuál mira en ese momento, la misma acción se permitiría o
 * se negaría según en qué pantalla esté, que es imposible de explicar. Si tu
 * empresa paga BUSINESS, tienes BUSINESS.
 */
export function mejorPlan(tiers: (PlanTier | string | null | undefined)[]): PlanTier {
  let mejor = PLAN_POR_DEFECTO;
  for (const tier of tiers) {
    const candidato = PLANS[tier as PlanTier]?.tier;
    if (candidato && PLAN_RANK[candidato] > PLAN_RANK[mejor]) mejor = candidato;
  }
  return mejor;
}
