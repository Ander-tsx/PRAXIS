/**
 * Las herramientas que se le declaran a Gemini, y el filtro que decide cuáles.
 *
 * ## La decisión que gobierna este archivo
 *
 * **La IA propone; ejecuta el código que ya existe.** Cuando el modelo devuelve
 * una llamada a función, este servicio **no la ejecuta**: la devuelve como
 * propuesta, el frontend pinta una tarjeta de confirmación y solo al pulsar
 * «Aceptar» se llama a la Server Action que ya usa el formulario del tablero.
 *
 * Consecuencia: no se abre ninguna vía de escritura nueva. Sin `canCreateTask`,
 * aceptar falla igual que le fallaría a esa persona pulsando el botón a mano.
 *
 * ## Y aun así se filtran por permisos
 *
 * Podría parecer redundante —el gateway va a rechazar igual— pero no lo es:
 * proponerle a alguien algo que no puede hacer es enseñarle un botón que
 * revienta al pulsarlo, que es exactamente lo que existe para evitar
 * `permissions/me`. Que la herramienta no entre en la lista significa que el
 * modelo **no puede ni sugerirlo**.
 */

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Las prioridades del dominio, tal cual las declara el DTO de tarea. */
const PRIORIDADES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const PROPONER_TAREA: FunctionDeclaration = {
  name: 'proponer_tarea',
  description:
    'Prepara una propuesta de tarea nueva para que la persona la revise y la acepte. ' +
    'NO crea nada: nada existe hasta que la acepte. Usala cuando te pidan crear, ' +
    'anadir o abrir una tarea, o cuando propongas tu una a partir de los reportes.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description: 'Titulo corto y concreto, en infinitivo. Maximo 120 caracteres.',
      },
      description: {
        type: 'STRING',
        description: 'Opcional. Que hay que hacer y por que, en dos o tres frases.',
      },
      columnId: {
        type: 'STRING',
        description:
          'id de una columna de "columnas" del contexto. Salvo que digan otra cosa, ' +
          'la de menor "orden": una tarea nueva empieza por el principio del tablero.',
      },
      priority: {
        type: 'STRING',
        enum: PRIORIDADES,
        description: 'Deducela de como lo cuentan. Si no hay ninguna senal, MEDIUM.',
      },
      dueDate: {
        type: 'STRING',
        description:
          'Opcional, formato YYYY-MM-DD. Solo si la persona da una fecha o un plazo ' +
          'explicito. NUNCA te la inventes a partir de la prediccion.',
      },
      assigneeIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Opcional. userId de "personas" o de la lista de miembros. Si recomiendas ' +
          'a alguien, explica en el texto por que: experiencia y carga actual.',
      },
      labelIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Opcional. id de "etiquetas" del contexto. Nunca inventes uno.',
      },
      /**
       * ⚠️ **Obligatorio, y aquí y no en el texto libre a propósito.**
       *
       * Con function calling el modelo devuelve la llamada y, casi siempre, ni
       * una palabra: la tarjeta aparecía sin decir por qué esa etiqueta ni por
       * qué esa persona. Justo lo que la recomendación tenía que aportar —el
       * hecho que la sostiene— era lo que se perdía. Pedirlo por prompt no
       * bastó; como parámetro obligatorio el modelo no puede omitirlo.
       *
       * La tarjeta enseña QUÉ se va a crear; esto dice POR QUÉ.
       */
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una o dos frases: de que trata y por que esa etiqueta, y si ' +
          'recomiendas a alguien, con el hecho que lo sostiene ("ha cerrado 3 de ' +
          'frontend y ahora tiene 3 abiertas"). Nunca digas que alguien es mas rapido.',
      },
    },
    required: ['title', 'columnId', 'priority', 'porQue'],
  },
};

const PROPONER_ASIGNACION: FunctionDeclaration = {
  name: 'proponer_asignacion',
  description:
    'Prepara una propuesta para cambiar quien lleva una tarea que YA existe. NO la ' +
    'cambia: la persona tiene que aceptarla. Solo si te dan el id de la tarea; si no ' +
    'lo tienes, pidelo en vez de adivinarlo.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de la tarea. Tiene que darlo la persona: no esta en el contexto.',
      },
      assigneeIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'La lista COMPLETA de quien debe quedar asignado, no solo lo que se anade: ' +
          'lo que mandes es lo que queda.',
      },
      /** Obligatorio por lo mismo que `porQue` en la otra. */
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una frase con el hecho que lo sostiene: experiencia y carga ' +
          'actual. Nunca digas que alguien es mas rapido o mejor que otro.',
      },
    },
    required: ['taskId', 'assigneeIds', 'porQue'],
  },
};

/**
 * Las herramientas que le tocan a esta persona.
 *
 * `canEditTask` implica `canMoveTask` y demás por jerarquía, y el mapa que llega
 * del gateway viene **ya expandido** (`project_effective_permissions`), así que
 * aquí se leen las claves tal cual sin volver a razonar la jerarquía.
 *
 * Devolver un array vacío es válido y es lo que le pasa a un rol de solo
 * lectura: el asistente responde preguntas y no propone nada.
 */
export function herramientasPara(permisos: Record<string, boolean>): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [];
  if (permisos.canCreateTask) tools.push(PROPONER_TAREA);
  if (permisos.canEditTask) tools.push(PROPONER_ASIGNACION);
  return tools;
}
