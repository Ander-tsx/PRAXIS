import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, Matches } from 'class-validator';
import { ReportFiltersQueryDto } from './report-filters.dto';

/**
 * Los agregados que se pueden pedir en un solo viaje.
 *
 * ## Por qué existe este endpoint
 *
 * La pantalla de Análisis pedía **hasta siete informes en siete peticiones**, y
 * el coste no era solo el ida y vuelta: cada una atraviesa el proxy de la zona,
 * entra por el gateway y pasa por `ProjectPermissionGuard`, que resuelve los
 * permisos efectivos del proyecto **preguntándoselo a projects-service por
 * TCP**. Siete informes eran, además de siete viajes, **siete resoluciones de
 * permisos idénticas** para pintar una sola pantalla.
 *
 * Con esto es una petición, un guard y una resolución. Los agregados de dentro
 * se siguen calculando en paralelo y cada uno conserva su caché de 60 s en
 * Redis, así que lo que se ahorra es el andamiaje, no el trabajo.
 *
 * ## ⚠️ El conjunto es cerrado, y por el mismo motivo que el de los gráficos
 *
 * `include` no es un campo libre: si no está en esta lista, no existe. Un
 * parámetro que aceptara cualquier nombre sería una invitación a que el día de
 * mañana alguien pase `../` o el nombre de un método del servicio.
 */
export const REPORT_BUNDLE_PARTS = [
  'snapshot',
  'flow',
  'cycle-time',
  'forecast',
  'people',
  'blocked',
  'weekly',
  /**
   * Retrabajo, rotación y volatilidad. Entra en el paquete como los demás: es
   * un informe más del lienzo y pedirlo aparte habría costado otra resolución
   * de permisos para pintar la misma pantalla.
   */
  'dynamics',
  /** Tiempo por columna: dónde espera el trabajo, no solo cuánto tarda. */
  'column-time',
] as const;

export type ReportBundlePart = (typeof REPORT_BUNDLE_PARTS)[number];

/**
 * Las dimensiones por las que se puede cruzar el trabajo.
 *
 * Espejo de `DimensionCruce` en `tasks/stats.service.ts`, que es donde cada una
 * es un trozo de SQL escrito a mano. Conjunto cerrado por el mismo motivo que
 * `include`: un eje libre dejaría que el nombre de una columna llegara desde
 * una petición hasta la consulta.
 */
export const REPORT_CROSS_DIMENSIONS = ['columna', 'prioridad', 'etiqueta', 'persona'] as const;

export type ReportCrossDimension = (typeof REPORT_CROSS_DIMENSIONS)[number];

/**
 * Un cruce pedido dentro del paquete: `matrix:<agruparPor>:<partirPor>`.
 *
 * ## Por qué el cruce viaja en el `include` y no en una ruta aparte
 *
 * Porque un lienzo puede tener **varios** cruces distintos —etiqueta contra
 * prioridad en uno, persona contra columna en otro— y cada uno lleva sus dos
 * dimensiones. Con una ruta suelta, pintar un lienzo con tres cruces serían tres
 * peticiones más, o sea tres resoluciones de permisos más, que es exactamente el
 * coste que R4.2 quitó.
 *
 * La ruta suelta existe igualmente (`GET /reports/matrix`), como las otras
 * siete: un cliente que quiere un cruce concreto no tiene por qué saber que hay
 * un paquete.
 */
export const REPORT_MATRIX_PREFIX = 'matrix';

/**
 * Lo que puede aparecer en `include`, como expresión regular.
 *
 * Se construye **desde las dos constantes** y no a mano: una lista escrita en un
 * literal se desincroniza el día que se añada un informe, y el síntoma sería un
 * 400 sobre un informe que sí existe.
 */
export const REPORT_BUNDLE_PART_PATTERN = new RegExp(
  `^(?:${REPORT_BUNDLE_PARTS.join('|')}|${REPORT_MATRIX_PREFIX}:(?:${REPORT_CROSS_DIMENSIONS.join(
    '|',
  )}):(?:${REPORT_CROSS_DIMENSIONS.join('|')}))$`,
);

/** Las dos dimensiones de un `matrix:a:b`, o `null` si no lo es. */
export function leerCruce(parte: string): { agruparPor: string; partirPor: string } | null {
  const trozos = parte.split(':');
  if (trozos.length !== 3 || trozos[0] !== REPORT_MATRIX_PREFIX) return null;
  const [, agruparPor, partirPor] = trozos as [string, string, string];
  if (!(REPORT_CROSS_DIMENSIONS as readonly string[]).includes(agruparPor)) return null;
  if (!(REPORT_CROSS_DIMENSIONS as readonly string[]).includes(partirPor)) return null;
  /* Cruzar una dimensión consigo misma da la diagonal y nada más. */
  if (agruparPor === partirPor) return null;
  return { agruparPor, partirPor };
}

/**
 * Lo que devuelve el viaje único.
 *
 * ⚠️ **Cada clave puede venir a `null`, y eso no es un error de la respuesta.**
 * Es la misma degradación que tenía la pantalla cuando pedía los informes uno a
 * uno con su `.catch(() => null)`: que el cálculo de tiempos falle no puede
 * llevarse por delante la instantánea, que sí salió. Agrupar las peticiones no
 * puede significar agrupar los fallos — sería cambiar siete degradaciones
 * independientes por un único todo o nada.
 *
 * Solo salen las claves que se pidieron: una clave a `null` significa «se pidió
 * y no se pudo», que es distinto de «no se pidió».
 */
export type ReportBundle = Partial<Record<ReportBundlePart, unknown>>;

/**
 * Qué se pide, con qué ventana y con qué filtros.
 *
 * Hereda de `ReportFiltersQueryDto` para que el paquete acepte exactamente los
 * mismos filtros que las siete rutas sueltas. Si divergieran, la pantalla —que
 * pide por aquí— filtraría distinto que la skill de voz o el asistente, que
 * piden un informe suelto.
 */
export class ReportBundleQueryDto extends ReportFiltersQueryDto {
  /**
   * Los informes que hacen falta, separados por comas.
   *
   * Se acepta como cadena porque viaja en la URL: `?include=snapshot,flow`. Sin
   * él no se devuelve nada — pedir «todo por defecto» habría dejado que una
   * pantalla que solo pinta la instantánea pagara los siete cálculos.
   */
  @ApiPropertyOptional({
    description: 'Informes separados por comas',
    example: 'snapshot,flow,weekly',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((parte) => parte.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  /* `@Matches` y no `@IsIn`: desde el cruce, una parte válida puede ser
     `matrix:etiqueta:prioridad`, que no cabe en una lista de literales. El
     patrón sale de las mismas constantes, así que sigue siendo un conjunto
     cerrado — solo que expresado de otra forma. */
  @Matches(REPORT_BUNDLE_PART_PATTERN, {
    each: true,
    message: 'Ese informe no existe. Revisa `include`.',
  })
  include?: string[];

  /** Ventana en días, para los que la aceptan. El gateway la acota a 1–365. */
  @ApiPropertyOptional({ description: 'Días de historial (1–365)' })
  @IsOptional()
  days?: string;

  /** Semanas de la serie semanal. El gateway la acota a 2–52. */
  @ApiPropertyOptional({ description: 'Semanas de la serie (2–52)' })
  @IsOptional()
  weeks?: string;
}
