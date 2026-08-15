import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * La plantilla de proyecto que propone el asistente.
 *
 * ## Sigue siendo una propuesta, y eso no es una formalidad
 *
 * **La IA propone; ejecuta el código que ya existe** (§26.1). Aquí igual: este
 * objeto no crea nada, no toca ninguna base y no le llega a ningún servicio de
 * escritura. Es una lista de parámetros para funciones que ya existen, y quien
 * las llama —una a una, con su sesión y sus permisos— es el frontend después de
 * que una persona haya visto lo que se va a crear y lo haya aceptado.
 *
 * El reparto, endpoint por endpoint:
 *
 * | Trozo del plan | Endpoint que lo materializa |
 * |---|---|
 * | `nombre`, `descripcion` | `POST /projects` |
 * | `etiquetas[]` | `POST /projects/:id/labels` |
 * | `roles[]` | `POST /projects/:id/roles` |
 * | `espacios[]` | `POST /projects/:id/workspaces` |
 * | `espacios[].tableros[]` | `POST /workspaces/:id/boards` |
 * | `…tableros[].columnas[]` | `POST /boards/:id/columns` (+ `PATCH` si lleva color) |
 *
 * Ninguna vía de escritura nueva, ninguna validación que saltarse: los 400 y
 * los 409 son los que ya estaban probados.
 *
 * ## Por qué no hay ids en ninguna parte
 *
 * Porque **nada de esto existe todavía**. Es la diferencia de fondo con las seis
 * herramientas de `tools.ts`, que rellenan ids de un briefing y por eso pueden
 * inventárselos: aquí el modelo solo pone nombres, y los ids los devuelve el
 * servidor a medida que se va creando. No hay nada que validar contra un
 * contexto porque no hay contexto.
 */

/** Tope de cada lista. Un plan más grande que esto no se lee, se sufre. */
export const PLANTILLA_LIMITES = {
  etiquetas: 12,
  roles: 6,
  espacios: 4,
  tablerosPorEspacio: 4,
  columnasPorTablero: 8,
} as const;

/** Lo que se le pide a quien va a crear el proyecto. */
export const PLANTILLA_BRIEF_MIN = 20;
export const PLANTILLA_BRIEF_MAX = 4000;

export interface PlantillaEtiqueta {
  nombre: string;
  /** Token de `LABEL_COLORS`. Se valida contra la lista al recibirlo. */
  color: string;
}

export interface PlantillaRol {
  nombre: string;
  /**
   * Diccionario de booleanos, **nunca un array**.
   *
   * Es la trampa 8 de CLAUDE.md, y el modelo tiende a devolver una lista porque
   * es lo natural en JSON. Se normaliza al validar, aquí, y no en el frontend:
   * si llegara como array, `POST /projects/:id/roles` lo rechazaría con un 400
   * que nadie sabría leer.
   */
  permisos: Record<string, boolean>;
}

export interface PlantillaColumna {
  nombre: string;
  /**
   * Token de `COLUMN_COLORS`, opcional.
   *
   * ⚠️ `success` **no es un color, es un significado**: marca la columna de
   * cierre, y una tarea que entra ahí se da por terminada (§20.2). El plan
   * puede pedirlo y por eso el prompt insiste en que solo la última lo lleve.
   */
  color?: string;
}

export interface PlantillaTablero {
  nombre: string;
  columnas: PlantillaColumna[];
}

export interface PlantillaEspacio {
  nombre: string;
  tableros: PlantillaTablero[];
}

export interface PlantillaDeProyecto {
  nombre: string;
  descripcion: string;
  etiquetas: PlantillaEtiqueta[];
  roles: PlantillaRol[];
  espacios: PlantillaEspacio[];
  /**
   * Por qué esta plantilla y no otra, en dos o tres frases.
   *
   * Obligatorio por el mismo motivo que el `porQue` de las seis herramientas
   * (§30.4): con function calling lo normal es que el modelo devuelva la llamada
   * y ni una palabra, así que sin esto la pantalla enseña una estructura entera
   * sin decir de dónde sale. Lo que se acepta a ciegas no se revisa.
   */
  porQue: string;
}

/** Lo que devuelve `POST /me/assistant/project-draft`. */
export interface PlantillaDraftResult {
  plantilla: PlantillaDeProyecto;
  /** El contador, para que la pantalla lo pinte como hace el chat. */
  cuota: { plan: string; usados: number; limite: number };
}

/** Cuánto texto puede ocupar un ajuste sobre un plan ya propuesto. */
export const PLANTILLA_AJUSTE_MAX = 1000;

/**
 * Tope de la plantilla previa **serializada**.
 *
 * Va como cadena JSON y no como objeto anidado, y es una decisión, no un atajo:
 * el `ValidationPipe` del gateway corre con `forbidNonWhitelisted`, así que un
 * objeto anidado obligaría a declarar seis clases DTO con sus decoradores para
 * describir algo que **este servicio no usa como datos** — solo lo reenvía al
 * modelo como texto del turno anterior. Una cadena con tope es exactamente lo
 * que hace falta y no puede quedarse desincronizada de la forma real.
 */
export const PLANTILLA_PREVIA_MAX = 20_000;

export class ProjectDraftBodyDto {
  @ApiProperty({
    description:
      'Lo que la persona cuenta de su proyecto: a qué se dedica, qué equipo tiene, ' +
      'cómo trabaja y qué necesita. Cuanto más concreto, mejor sale la plantilla.',
    minLength: PLANTILLA_BRIEF_MIN,
    maxLength: PLANTILLA_BRIEF_MAX,
  })
  @IsString()
  @MinLength(PLANTILLA_BRIEF_MIN)
  @MaxLength(PLANTILLA_BRIEF_MAX)
  brief!: string;

  /**
   * Qué hay que cambiar del plan anterior.
   *
   * Con esto y `previa`, la llamada deja de ser «propón algo» y pasa a ser
   * «cambia esto de lo que ya propusiste». Sin los dos, se genera de cero.
   */
  @ApiPropertyOptional({ maxLength: PLANTILLA_AJUSTE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PLANTILLA_AJUSTE_MAX)
  ajuste?: string;

  /** El plan que se está ajustando, en JSON. Ver `PLANTILLA_PREVIA_MAX`. */
  @ApiPropertyOptional({ maxLength: PLANTILLA_PREVIA_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PLANTILLA_PREVIA_MAX)
  previa?: string;
}
