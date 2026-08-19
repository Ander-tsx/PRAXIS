import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Planes del asistente y cuánto da cada uno **al mes**.
 *
 * Viven aquí y no en el servicio para que el contador del chat y el que
 * gobierna la cuota no puedan discrepar: un chat que dice «quedan 12» mientras
 * el backend rechaza el siguiente es peor que no enseñar contador.
 *
 * ⚠️ **No hay pasarela de pago.** Pasar a `PRO` es hoy un `UPDATE` a mano en
 * `assistant.assistant_subscriptions`. No inventes una pantalla de suscripción:
 * prometería algo que no existe.
 */
/**
 * Peticiones al asistente por mes y plan.
 *
 * ⚠️ El gratuito da para probarlo, no para trabajar con él, y es deliberado:
 * cada pregunta cuesta una llamada a Gemini contra una clave nuestra, así que
 * una cuenta recién creada no puede vaciar la cuota de todos. Con 50 bastaba
 * una tarde para agotarla.
 *
 * PRO se asigna a mano desde el panel de administración —no hay pasarela de
 * pago— y es lo que se le da a quien tiene que usarlo de verdad.
 */
export const ASSISTANT_LIMITS = {
  FREE: 5,
  PRO: 250,
} as const;

export type AssistantPlanName = keyof typeof ASSISTANT_LIMITS;

/**
 * Los planes que existen, como lista.
 *
 * Sale de las claves de `ASSISTANT_LIMITS` y no se escribe aparte: son la misma
 * verdad, y dos listas a mano acaban discrepando el día que se añada un plan.
 * Lo usan el validador del panel y el desplegable que lo pinta.
 */
export const ASSISTANT_PLANS = Object.keys(ASSISTANT_LIMITS) as AssistantPlanName[];

/** Los cuatro papeles de un mensaje del hilo. */
export const ASSISTANT_ROLES = ['user', 'model'] as const;

/**
 * Un turno del hilo, tal y como lo reenvía el cliente.
 *
 * ⚠️ **Ya no se usa para nada.** Durante un tiempo el historial lo mandaba el
 * cliente en cada turno porque no había tabla de conversaciones, con el efecto
 * incómodo de que el hilo era *lo que el cliente dijera que era*. Desde
 * `assistant_conversations` sale de la base: el modelo ve exactamente el mismo
 * hilo que la pantalla, y el cliente ya no puede recortarlo mal.
 *
 * `MAX_HISTORIAL` sigue vivo y sigue significando lo mismo —cuántos turnos
 * entran en el prompt—, solo que ahora lo aplica el servidor al leer.
 */
export class AssistantTurnDto {
  @ApiProperty({ enum: ASSISTANT_ROLES })
  @IsIn(ASSISTANT_ROLES as unknown as string[])
  role: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text: string;
}

/** Cuántos turnos anteriores se aceptan. Ver la nota de `AssistantTurnDto`. */
export const MAX_HISTORIAL = 12;

/**
 * Lo que se puede adjuntar a una pregunta.
 *
 * ## ⚠️ Los cuatro límites, y por qué son estos
 *
 * Un archivo entra **entero en el prompt** de cada turno, así que aquí un tope
 * generoso no cuesta disco: cuesta cuota, latencia y —lo peor— atención del
 * modelo. Un PDF de trescientas páginas empuja las reglas y el inventario del
 * proyecto fuera de la ventana, y el resultado no es un error sino un asistente
 * que de pronto responde peor sin que nadie sepa por qué.
 *
 * - **3 por mensaje.** Suficiente para «estas notas y este pantallazo».
 * - **5 MB cada uno.** Un PDF de texto normal cabe de sobra; un escaneado de
 *   200 páginas, no, y es justo el que no queremos.
 * - **Solo lo que el modelo sabe leer.** PDF e imágenes van nativos; texto y
 *   Markdown se pegan como texto. Un `.docx` o un `.zip` se rechazan aquí en vez
 *   de llegar al modelo y volver como «no he podido leer el archivo».
 * - **40 000 caracteres** por archivo de texto, avisando de que se recortó.
 *
 * ## Y sí se guardan
 *
 * 🔴 **La primera versión no los guardaba, y eso era el fallo, no un atajo.**
 * Viajaban en base64 dentro de la pregunta y se descartaban después, con dos
 * consecuencias: la pregunta va por una Server Action —cuerpo topado en 1 MB—
 * así que cualquier foto de teléfono reventaba con un «Body exceeded 1 MB
 * limit» de Next, sin traducir y sin decir qué archivo; y cuando sí entraba, el
 * hilo quedaba **mintiendo**, porque PRAX citaba el documento y en la
 * conversación no había ni rastro de él.
 *
 * Ahora se suben aparte por `POST /me/assistant/attachments` (multipart, que no
 * pasa por la Server Action), quedan como borrador y el turno los reclama con
 * `attachmentIds`. Los bytes van a `BlobStorage` —Postgres o GCS según
 * `STORAGE_DRIVER`—, igual que los del chat de equipo.
 */
export const ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE = 3;

/**
 * Cuánto vive un borrador que nadie llegó a enviar.
 *
 * 🔴 **Sin esto, el compositor se bloqueaba para siempre.** El tope de arriba se
 * cuenta sobre los borradores —`messageId: null`— y un borrador solo deja de
 * serlo cuando su turno se guarda. Si el turno **falla** —Gemini caído, cuota
 * agotada, la red— los archivos se quedan ahí; el cliente los devuelve al
 * compositor para poder reintentar, pero quien recargue la página o se rinda los
 * deja huérfanos, invisibles y contando. Tres fallos seguidos y esa persona no
 * puede volver a adjuntar nada **nunca**, con un mensaje que habla de un
 * mensaje que no existe.
 *
 * Pasó de verdad, probando el modo sin proyecto contra una clave de Gemini con
 * el presupuesto agotado: tres 502 seguidos y el compositor muerto.
 *
 * Una hora, y el número importa en los dos sentidos. **Más corto es peligroso**:
 * alguien adjunta un PDF, escribe quince minutos y al enviar el archivo ya no
 * está — el turno saldría sin él y PRAX respondería sin decir por qué. **Más
 * largo alarga el bloqueo** de quien ya lo sufrió. Una hora no alcanza a ninguna
 * sesión de compositor real y desbloquea el mismo día.
 */
export const ASSISTANT_DRAFT_TTL_MS = 60 * 60 * 1000;

/**
 * Hasta cuántas páginas se le manda un PDF **nativo** al modelo.
 *
 * ## 🔴 El agujero que tapa, que era el peor caso de todo el sistema
 *
 * Un PDF va como `inlineData` para que el modelo lo lea con su maquetación, sus
 * tablas y sus figuras — que es mejor que el texto pelado y por eso se hace. Pero
 * **el tope era de 5 MB y no había ninguno de páginas**, y Gemini tokeniza un PDF
 * por páginas: del orden de 250 tokens cada una. Un documento de 500 páginas que
 * pese menos de 5 MB —cualquier informe corporativo lo es— entraba entero:
 * **~130 000 tokens en un solo turno**, y caben tres por mensaje.
 *
 * O sea que el peor caso del sistema no era un proyecto grande (19 300 tokens,
 * ya con techo): era alguien adjuntando un manual, sin mala intención, y
 * gastando cien veces lo previsto **contando como un mensaje de su cuota**. Eso
 * es lo que hace inviable cualquier plan por peticiones.
 *
 * A partir de aquí el PDF viaja **como texto**, que ya se extrae al subirlo y sí
 * tiene tope (`ASSISTANT_TEXT_MAX_CHARS`). Se pierde la maquetación y se gana
 * que el coste de un turno sea una cifra que se puede escribir en un contrato.
 *
 * 25 páginas son ~6 500 tokens: un documento de trabajo normal entra nativo, y
 * lo que no entra es justo lo que no debería haber entrado nunca.
 */
export const ASSISTANT_PDF_MAX_INLINE_PAGES = 25;

/**
 * 5 MB por archivo.
 *
 * El quinto del chat de equipo (25 MB) a propósito: allí un adjunto se guarda y
 * se descarga, aquí **entra entero en el prompt de un turno**. Lo que cuesta no
 * es disco, es cuota, latencia y atención del modelo.
 *
 * Lo mide el gateway sobre los bytes recibidos, nunca sobre lo que declare quien
 * sube: es la única cifra en la que se puede confiar.
 */
export const ASSISTANT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/** Lo que Gemini sabe leer y nosotros sabemos mandarle. */
export const ASSISTANT_ATTACHMENT_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  /* ⚠️ **Markdown va con sus dos tipos, y no sobra ninguno.** Chrome declara un
     `.md` como `text/markdown`; Safari y algunos Linux lo mandan como
     `text/x-markdown`. Con solo el primero, el mismo archivo entraba en un
     navegador y lo rechazaba otro. Ya mordió en el chat de equipo. */
  'text/markdown',
  'text/x-markdown',
] as const;

/**
 * Los que se pegan como texto en vez de ir como datos binarios.
 *
 * 🐛 **`text/x-markdown` faltaba aquí, y estaba dos listas más arriba.** La de
 * permitidos lo lleva desde el chat de equipo, con su comentario explicando que
 * Safari y algunos Linux declaran así un `.md`; esta no. Efecto: **el mismo
 * archivo entraba como texto en Chrome y como binario en Safari**, y el modelo
 * lo trataba como un documento adjunto en vez de como parte de lo que se le
 * está contando. Sin error en ninguna consola, claro.
 */
export const ASSISTANT_TEXT_MIME: readonly string[] = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
];

/** Tope por archivo de texto. Se recorta y se avisa dentro del propio prompt. */
export const ASSISTANT_TEXT_MAX_CHARS = 40_000;

/**
 * Cuántos caracteres de adjuntos entran, **en total**, en el hilo que se le
 * reenvía al modelo.
 *
 * ## Por qué existe, con los números delante
 *
 * Desde que un adjunto deja su texto guardado (`Attachment.extract`), el
 * historial lo vuelve a poner en cada turno — que es justo el punto: sin eso,
 * PRAX olvidaba el documento en cuanto contestaba. Pero reinyectarlo sin tope
 * es una factura garantizada: **3 adjuntos por mensaje × 40 000 caracteres × 12
 * turnos = 360 000 caracteres en cada pregunta**.
 *
 * Así que se recorta del más reciente hacia atrás: lo último que se adjuntó
 * entra entero, lo viejo se recorta o se queda en su nombre.
 *
 * ⚠️ **Bajó de 24 000 a 12 000, y el motivo es que el primer número se eligió
 * mirando el peor caso.** Midiendo el prompt de verdad: un proyecto normal —9
 * tareas— gasta unos 8 500 tokens por turno **entero**, así que 24 000
 * caracteres de adjuntos (~6 000 tokens) eran más que todo lo demás junto. 12
 * 000 siguen siendo un documento largo entero, y el dial se sube si en el uso
 * real PRAX pierde el hilo de algo que sí hacía falta.
 *
 * ⚠️ **No es lo mismo que `ASSISTANT_TEXT_MAX_CHARS`, y confundirlos rompe el
 * diseño.** Ese topa lo que se **guarda** por archivo; este, lo que se **manda**
 * entre todos. Se guarda más de lo que se manda a propósito: subir este número
 * luego no obliga a volver a extraer nada.
 */
export const ASSISTANT_EXTRACT_BUDGET_CHARS = 12_000;

/**
 * Un adjunto tal y como lo ve el chat.
 *
 * Sin bytes: para pintar la burbuja bastan el nombre, el tipo y el tamaño, y el
 * contenido se pide aparte —`GET /me/assistant/attachments/:id/content`— solo si
 * alguien lo abre. Meterlo aquí metería cada archivo de la conversación en la
 * respuesta de cada turno.
 */
export interface AssistantAttachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Bytes reales. Lo pinta la burbuja junto al nombre. */
  size: number;
}

/** Los que la burbuja puede previsualizar en vez de ofrecer solo la descarga. */
export function esImagenDeAsistente(mimeType: string): boolean {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
}

export class AssistantChatBodyDto {
  @ApiProperty({ description: 'Lo que escribe el usuario' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    description:
      'Conversación que se continúa. Sin él, el servidor abre una nueva y ' +
      'devuelve su id en la respuesta',
  })
  @IsOptional()
  @IsUUID('4')
  conversationId?: string;

  /**
   * @deprecated El servidor **guarda las conversaciones** desde que existe
   * `assistant_conversations`, así que el hilo sale de la base y este campo se
   * ignora. Se mantiene aceptado —y validado— para que un cliente sin
   * actualizar no reciba un 400, pero no influye en la respuesta.
   */
  @ApiPropertyOptional({
    type: [AssistantTurnDto],
    deprecated: true,
    description: 'Ignorado. El hilo lo guarda el servidor desde que hay conversaciones',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HISTORIAL)
  @ValidateNested({ each: true })
  @Type(() => AssistantTurnDto)
  history?: AssistantTurnDto[];

  /**
   * Los archivos que acompañan a la pregunta, **por id**.
   *
   * ⚠️ **Antes viajaban aquí en base64 y no cabían.** La pregunta va por una
   * Server Action, cuyo cuerpo está topado en 1 MB: cualquier imagen de teléfono
   * reventaba con un «Body exceeded 1 MB limit» de Next — sin traducir, sin decir
   * qué archivo y sin ninguna forma de saberlo antes de intentarlo.
   *
   * Ahora se suben aparte por `POST /projects/:id/assistant/attachments`
   * (multipart, que no pasa por la Server Action), quedan como borrador y el
   * turno los reclama con estos ids. Mismo patrón que los adjuntos del chat.
   */
  @ApiPropertyOptional({ type: [String], description: 'Ids de adjuntos ya subidos' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

/** Renombrar una conversación. */
export class RenameConversationBodyDto {
  @ApiProperty({ minLength: 1, maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title: string;
}

/** Marcar una propuesta como aplicada o descartada. */
export class ResolveProposalBodyDto {
  @ApiProperty({ enum: ['ACCEPTED', 'DISCARDED'] })
  @IsIn(['ACCEPTED', 'DISCARDED'])
  status: 'ACCEPTED' | 'DISCARDED';
}

/**
 * Lo que el asistente **propone**, nunca lo que hace.
 *
 * Es la pieza central del diseño: cuando el modelo devuelve una llamada a
 * función, el backend **no la ejecuta**. Devuelve esto, el frontend pinta una
 * tarjeta de confirmación, y solo al pulsar «Aceptar» se llama a la Server
 * Action que ya usa el formulario del tablero — con los mismos permisos, la
 * misma validación y los mismos 400 y 403 que ya están probados.
 *
 * Un fallo del modelo es, como mucho, una propuesta mala que alguien rechaza.
 */
export interface AssistantProposal {
  /**
   * Id de la propuesta guardada.
   *
   * Existe desde que las conversaciones se persisten: es con lo que el cliente
   * marca la propuesta como aceptada o descartada, para que al releer el hilo
   * días después no vuelva a ofrecer un botón que ya se pulsó.
   */
  id?: string;
  /** `proponer_tarea` | `proponer_asignacion` | `proponer_edicion` | … */
  tool: string;
  /** Los argumentos tal cual los devolvió el modelo, ya validados contra el proyecto. */
  args: Record<string, unknown>;
  /** `PENDING` al proponerse. Solo las pendientes conservan sus botones al releer. */
  status?: AssistantProposalStatus;
}

export type AssistantProposalStatus = 'PENDING' | 'ACCEPTED' | 'DISCARDED';

/** Lo que ve el chat después de cada turno. */
export interface AssistantChatResult {
  /**
   * La conversación en la que ha caído este turno.
   *
   * Si la petición no traía `conversationId`, el servidor abrió una y este es su
   * id: el cliente tiene que quedárselo para que el siguiente mensaje continúe
   * el mismo hilo en vez de abrir otro.
   */
  conversationId: string;
  reply: string;
  proposals: AssistantProposal[];
  cuota: AssistantQuota;
}

/** Una conversación en la lista, sin sus mensajes. */
export interface AssistantConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mensajes: number;
}

/** Un turno guardado, tal y como se relee. */
export interface AssistantStoredMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  proposals: AssistantProposal[];
  /**
   * Los archivos que iban con este turno.
   *
   * Solo los tienen los del usuario: PRAX responde texto y propuestas, nunca
   * adjuntos. Vacío en los del modelo, y vacío también en todo lo anterior a que
   * los adjuntos se guardaran — antes viajaban con la pregunta y se descartaban,
   * así que el hilo citaba documentos que ya no existen en ninguna parte.
   */
  attachments: AssistantAttachment[];
}

/**
 * Una conversación entera.
 *
 * No extiende a `AssistantConversationSummary` porque `mensajes` significa
 * cosas distintas en cada una: en la lista es cuántos hay, aquí son cuáles.
 */
export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mensajes: AssistantStoredMessage[];
}

export interface AssistantQuota {
  plan: AssistantPlanName;
  usados: number;
  limite: number;
  /** `YYYY-MM`. El periodo que se está consumiendo. */
  periodo: string;
  /** ISO 8601 del día 1 del mes que viene: cuándo vuelve a cero. */
  reinicia: string;
}
