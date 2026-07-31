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
    'cambia: la persona tiene que aceptarla. Busca la tarea en "tareas" del ' +
    'contexto por su titulo. Puedes llamarla VARIAS VECES en la misma respuesta si ' +
    'hay que repartir varias tareas: una llamada por tarea.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description:
          'id de una tarea de "tareas" del contexto. Nunca lo inventes ni lo ' +
          'construyas: si no encuentras la tarea en esa lista, dilo y no llames.',
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

const PROPONER_EDICION: FunctionDeclaration = {
  name: 'proponer_edicion',
  description:
    'Prepara una propuesta para cambiar los datos de una tarea que YA existe: ' +
    'titulo, descripcion, prioridad, fecha limite o etiquetas. NO la cambia: la ' +
    'persona tiene que aceptarla. Manda SOLO los campos que cambian; lo que no ' +
    'mandes se queda como esta. Para cambiar de columna usa proponer_movimiento, ' +
    'y para cambiar encargados usa proponer_asignacion.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      title: { type: 'STRING', description: 'Opcional. Maximo 120 caracteres.' },
      description: { type: 'STRING', description: 'Opcional.' },
      priority: { type: 'STRING', enum: PRIORIDADES, description: 'Opcional.' },
      dueDate: {
        type: 'STRING',
        description:
          'Opcional, formato YYYY-MM-DD. Solo si la persona da una fecha o un ' +
          'plazo explicito. NUNCA la deduzcas de la prediccion.',
      },
      labelIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Opcional. La lista COMPLETA de etiquetas que quedan, no solo las que ' +
          'anades: lo que mandes sustituye a las que tuviera. id de "etiquetas".',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una o dos frases con el motivo del cambio, apoyado en ' +
          'algo del contexto. La tarjeta lo enseña junto a la propuesta.',
      },
    },
    required: ['taskId', 'porQue'],
  },
};

const PROPONER_MOVIMIENTO: FunctionDeclaration = {
  name: 'proponer_movimiento',
  description:
    'Prepara una propuesta para mover una tarea a otra columna del tablero. NO la ' +
    'mueve: la persona tiene que aceptarla. Usala cuando te pidan avanzar, ' +
    'devolver o dar por terminada una tarea.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      columnId: {
        type: 'STRING',
        description:
          'id de una columna de "columnas" del contexto, distinta de la que ya ' +
          'tiene la tarea. Nunca inventes uno.',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una frase con el motivo, apoyado en algo del contexto ' +
          '("lleva 12 dias parada en revision").',
      },
    },
    required: ['taskId', 'columnId', 'porQue'],
  },
};

const PROPONER_CHECKLIST: FunctionDeclaration = {
  name: 'proponer_checklist',
  description:
    'Prepara una propuesta para anadir pasos al checklist de una tarea que YA ' +
    'existe. NO los anade: la persona tiene que aceptarla. Los pasos se SUMAN a ' +
    'los que ya tenga; no se borra ni se reemplaza ninguno.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      items: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Los pasos, en orden, en infinitivo y concretos. Entre 1 y 10. Cada uno ' +
          'una accion que se pueda dar por hecha o no hecha, no una idea vaga.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que ese desglose y no otro.',
      },
    },
    required: ['taskId', 'items', 'porQue'],
  },
};

const PROPONER_COMENTARIO: FunctionDeclaration = {
  name: 'proponer_comentario',
  description:
    'Prepara una propuesta de comentario en una tarea que YA existe. NO lo ' +
    'publica: la persona tiene que aceptarla, y se publicara a SU nombre, no al ' +
    'tuyo. Usalo para dejar constancia de algo que se ha hablado aqui.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      body: {
        type: 'STRING',
        description:
          'El comentario, redactado en primera persona como lo escribiria la ' +
          'persona que lo publica. Corto y concreto. Maximo 2000 caracteres.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que dejar constancia de esto.',
      },
    },
    required: ['taskId', 'body', 'porQue'],
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
  if (permisos.canEditTask) tools.push(PROPONER_ASIGNACION, PROPONER_EDICION, PROPONER_CHECKLIST);
  /**
   * Mover cuelga de `canMoveTask` y no de `canEditTask`, igual que su endpoint.
   *
   * Es la **única herramienta que alcanza a un colaborador**: quien ejecuta el
   * trabajo puede decir que lo terminó sin poder redefinir en qué consistía, y
   * eso vale también cuando lo pide por el chat. Como `canEditTask` implica
   * `canMoveTask` por jerarquía, quien edita la recibe igual sin repetirla
   * arriba.
   */
  if (permisos.canMoveTask) tools.push(PROPONER_MOVIMIENTO);
  if (permisos.canComment) tools.push(PROPONER_COMENTARIO);
  return tools;
}

/**
 * ⚠️ **Aquí no hay, ni va a haber, una herramienta de borrado.**
 *
 * No es un olvido ni una decisión que se pueda revisar a la ligera: es la
 * garantía de que el asistente no puede destruir nada. Y la garantía es
 * **estructural, no una instrucción** — el prompt no menciona el borrado a
 * propósito, porque una regla que dice «nunca borres» se rodea con la pregunta
 * adecuada, mientras que una capacidad que no existe no se puede invocar.
 *
 * Son tres capas y ninguna depende de que el modelo obedezca:
 *
 * 1. la herramienta no se le declara, así que no tiene forma de expresarlo;
 * 2. `validarPropuesta` descarta cualquier `call` fuera de esta lista;
 * 3. las server actions solo saben llamar a los endpoints que tienen escritos.
 *
 * Si alguna vez alguien añade aquí algo destructivo, que sea sabiendo que
 * rompe las tres a la vez.
 */
