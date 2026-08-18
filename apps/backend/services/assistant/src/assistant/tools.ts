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
          'id de una columna de "tableros" del contexto. ⚠️ El proyecto puede tener ' +
          'VARIOS tableros y cada uno tiene sus propias columnas: elige primero el ' +
          'tablero y despues la columna DENTRO de ese tablero. Si no dicen cual, usa ' +
          'el tablero del que se venga hablando; si no hay ninguno claro y hay mas de ' +
          'uno, PREGUNTA en vez de elegir. Dentro del tablero, y salvo que digan otra ' +
          'cosa, la columna de menor "orden": una tarea nueva empieza por el principio.',
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
          'id de una columna de "tableros" del contexto, distinta de la que ya tiene ' +
          'la tarea. Nunca inventes uno. ⚠️ Puede estar en OTRO tablero: mover una ' +
          'tarea entre tableros es valido y es lo que se pide cuando dicen "pasalo al ' +
          'tablero de X". Cada tarea trae su tablero actual en "tablero".',
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
 * Escribir en el chat del equipo.
 *
 * ⚠️ **Solo el chat del proyecto que se está mirando, nunca uno privado.** El
 * asistente vive dentro de un proyecto y lo que sabe es de ese proyecto; darle
 * la capacidad de escribirle a alguien por privado sería dejarle mandar mensajes
 * a nombre de una persona en una conversación que el proyecto no contiene. Si
 * hace falta avisar a alguien, se le menciona aquí — que es público y queda a la
 * vista de todo el equipo.
 *
 * Cuelga de `canComment` por lo mismo que el chat: es el permiso de participar
 * en una conversación sin poder editar el trabajo de nadie.
 */
const PROPONER_MENSAJE: FunctionDeclaration = {
  name: 'proponer_mensaje',
  description:
    'Prepara un mensaje para el chat del equipo de ESTE proyecto. NO lo envia: ' +
    'la persona tiene que aceptarlo, y se enviara a SU nombre, no al tuyo. ' +
    'Usalo cuando haya algo que el equipo deba saber —un bloqueo, un ' +
    'vencimiento que se echa encima, una decision que se acaba de tomar— y la ' +
    'persona no lo haya pedido explicitamente: ofrecelo como pregunta.',
  parameters: {
    type: 'OBJECT',
    properties: {
      body: {
        type: 'STRING',
        description:
          'El mensaje, redactado en primera persona como lo escribiria quien lo ' +
          'envia. Corto y concreto. Para dirigirte a alguien del equipo usa ' +
          'EXACTAMENTE el formato @[Nombre](user:userId) con el userId de ' +
          '"PERSONAS DEL PROYECTO": la interfaz lo pinta como mencion. Para ' +
          'referirte a una tarea usa /[Titulo](task:taskId) con un id de ' +
          '"tareas". Nunca inventes un id. Maximo 2000 caracteres.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que el equipo deberia saber esto.',
      },
    },
    required: ['body', 'porQue'],
  },
};

/**
 * Marcar pasos de un checklist como hechos.
 *
 * ⚠️ Cuelga de **`canMoveTask`, no de `canEditTask`**, igual que su endpoint y
 * por el mismo motivo que mover una tarjeta: quien ejecuta el trabajo tiene que
 * poder decir que terminó un paso sin poder redefinir en qué consistía. Añadir o
 * quitar pasos sigue siendo `canEditTask` — eso sí es decidir el trabajo.
 *
 * Es la contrapartida natural de tener los pasos en el contexto: sin esto, el
 * asistente puede decir «te faltan dos pasos» y no puede hacer nada al respecto.
 */
const PROPONER_MARCAR_PASOS: FunctionDeclaration = {
  name: 'proponer_marcar_pasos',
  description:
    'Prepara una propuesta para marcar como HECHOS uno o varios pasos del ' +
    'checklist de una tarea. NO los marca: la persona tiene que aceptarla. ' +
    'Usalo cuando cuenten que han terminado algo que corresponde a un paso ' +
    'concreto. Solo marca; no puede desmarcar ni borrar.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      itemIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'ids de los pasos, sacados del campo "pasos" de esa tarea. Incluye ' +
          'SOLO los que estan con "hecho": false — marcar uno ya hecho no hace ' +
          'nada y confunde a quien lo revise.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que se dan por hechos.',
      },
    },
    required: ['taskId', 'itemIds', 'porQue'],
  },
};

/**
 * Añadir un gráfico al lienzo de Análisis de quien pregunta.
 *
 * ## Es la única que no escribe en el proyecto
 *
 * Las otras ocho proponen tocar el tablero. Esta propone tocar **el lienzo de
 * quien está hablando**, que es suyo y de nadie más: aceptar no cambia ni una
 * tarea, ni un comentario, ni lo que ve ningún compañero. Por eso cuelga de
 * `canViewReports`, el permiso que ya hizo falta para llegar al asistente, y no
 * de ninguno de escritura — no hay ninguno que conceder porque no hay nada
 * ajeno que escribir.
 *
 * Sigue llegando **como propuesta con su tarjeta**, igual que las demás. No es
 * una formalidad: un gráfico que apareciera solo en la pantalla de alguien es
 * exactamente la clase de cosa que hace desconfiar de un asistente, por
 * inofensiva que sea.
 *
 * ## Lo que el modelo elige, y lo que no
 *
 * Elige **de un conjunto cerrado**: forma, métrica, recorte y rango. No escribe
 * consultas, no escribe código y no produce ni una cifra — los números salen de
 * los agregados que `reports-service` ya calcula, exactamente los mismos que
 * alimentan los gráficos del catálogo.
 *
 * Es la línea de la regla 1 del prompt aplicada a los gráficos: **inventar el
 * dato de partida está prohibido**. Un `SELECT` redactado por un modelo, o unas
 * cifras estimadas «para ilustrar», serían justo eso, y se leerían con la misma
 * autoridad que los medidos. `validarGrafico` rechaza además las combinaciones
 * que no se sostienen —una serie temporal pedida como dona, un rango sobre una
 * foto del momento—, porque un conjunto cerrado que admite combinaciones sin
 * sentido no es un conjunto cerrado.
 */
const PROPONER_GRAFICO: FunctionDeclaration = {
  name: 'proponer_grafico',
  description:
    'Prepara un grafico para anadirlo al panel de Analisis de quien te habla. NO lo ' +
    'anade: tiene que aceptarlo. El panel es SUYO y de nadie mas, asi que esto no ' +
    'cambia nada del proyecto ni lo ve el resto del equipo. Elige SOLO de las ' +
    'opciones de abajo: no puedes inventar una metrica, ni calcular tu los numeros, ' +
    'ni pedir un corte que no este en la lista. Usalo cuando te pidan ver algo de una ' +
    'forma concreta, o cuando lo que estas explicando se entienda mejor mirandolo.',
  parameters: {
    type: 'OBJECT',
    properties: {
      metrica: {
        type: 'STRING',
        enum: [
          'tareas_por_columna',
          'tareas_por_prioridad',
          'tareas_por_etiqueta',
          'carga_por_persona',
          'cerradas_por_persona',
          'vencidas_por_persona',
          'paradas_por_columna',
          'flujo_por_columna',
          'cierres_por_semana',
          'creadas_por_semana',
        ],
        description:
          'Que se cuenta. Las cuatro primeras y "paradas_por_columna" son una foto ' +
          'del momento; las tres ultimas son una evolucion en el tiempo.',
      },
      forma: {
        type: 'STRING',
        enum: ['barras', 'barras_horizontales', 'dona', 'lineas', 'area_apilada'],
        description:
          'Como se dibuja. Las metricas de foto admiten barras, barras_horizontales ' +
          'y dona. "flujo_por_columna" solo lineas o area_apilada. Las semanales ' +
          'admiten lineas, area_apilada y barras. Pedir otra combinacion se rechaza.',
      },
      dias: {
        type: 'INTEGER',
        description:
          'Opcional, de 1 a 365. SOLO para "paradas_por_columna" (ahi es el umbral: ' +
          'cuantos dias sin moverse), "flujo_por_columna" y las semanales. En las de ' +
          'foto NO se puede: cuentan lo que hay ahora, no un periodo.',
      },
      soloVencidas: {
        type: 'BOOLEAN',
        description: 'Opcional. SOLO para "paradas_por_columna". En el resto se rechaza.',
      },
      topN: {
        type: 'INTEGER',
        description:
          'Opcional, de 2 a 20. Quedarse con las N mayores y agrupar el resto en ' +
          '"Otras". Solo para etiquetas y personas, que son las que pueden ser muchas.',
      },
      titulo: {
        type: 'STRING',
        description:
          'Como se llamara la tarjeta. Corto y en el idioma de la conversacion. ' +
          'Maximo 80 caracteres. Que diga QUE se ve, no "Grafico 1".',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una frase sobre que pregunta responde este grafico y por que ' +
          'esa forma. La tarjeta lo enseña junto a la propuesta.',
      },
    },
    required: ['metrica', 'forma', 'titulo', 'porQue'],
  },
};

/**
 * Borrar una tarea.
 *
 * ## ⚠️ Esta herramienta no existía, y su ausencia estaba documentada tres veces
 *
 * El argumento era que el asistente no debía poder destruir nada, y que la
 * garantía tenía que ser **estructural**: una capacidad que no se declara no se
 * puede invocar, mientras que una regla del prompt que diga «nunca borres» se
 * rodea con la pregunta adecuada.
 *
 * Se añade el 2026-08-18 por decisión explícita, y el argumento que la vetaba no
 * se sostiene con el patrón de propuestas: **esto no borra nada**. Devuelve una
 * propuesta, la persona la revisa y, si acepta, quien llama a `DELETE /tasks/:id`
 * es el frontend con **su** sesión y **sus** permisos. Es técnicamente idéntico a
 * que lo borre desde el tablero. Sin `canDeleteTask`, aceptar falla igual que le
 * fallaría pulsando el botón a mano — y de hecho la herramienta ni se le declara.
 *
 * ## Lo que sí la hace distinta de las otras nueve
 *
 * **No se deshace.** Una tarea propuesta de más se borra; una borrada de más no
 * vuelve, y se lleva por delante sus subtareas, su checklist, sus comentarios y
 * sus adjuntos, que viven en otro microservicio. Por eso:
 *
 * - la descripción le prohíbe proponerlo por iniciativa propia;
 * - `porQue` no vale con una frase de relleno: la tarjeta lo enseña como el
 *   motivo por el que alguien va a perder trabajo;
 * - y la tarjeta es destructiva a la vista, con su propia confirmación. Ver
 *   `DeleteProposalCard`.
 */
const PROPONER_BORRADO: FunctionDeclaration = {
  name: 'proponer_borrado',
  description:
    'Prepara una propuesta para BORRAR una tarea. NO la borra: la persona tiene que ' +
    'aceptarla. ⚠️ Borrar NO SE DESHACE y se lleva las subtareas, el checklist, los ' +
    'comentarios y los adjuntos. Usala SOLO cuando te pidan explicitamente borrar, ' +
    'eliminar o quitar una tarea concreta. NUNCA la propongas por tu cuenta como ' +
    'limpieza, ni para duplicados, ni para tareas viejas o paradas: para eso propon ' +
    'moverlas o cerrarlas. Si tienes cualquier duda de CUAL es la tarea, PREGUNTA en ' +
    'vez de proponer.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description:
          'id de una tarea del inventario del contexto. Si lo que te han dicho encaja ' +
          'con varias, no elijas: pregunta cual.',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Por que se borra ESTA tarea, con lo que te hayan dicho. La ' +
          'tarjeta lo enseña junto al aviso de que no se puede deshacer, asi que una ' +
          'frase generica ahi no ayuda a nadie a decidir.',
      },
    },
    required: ['taskId', 'porQue'],
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
  if (permisos.canMoveTask) tools.push(PROPONER_MOVIMIENTO, PROPONER_MARCAR_PASOS);
  if (permisos.canComment) tools.push(PROPONER_COMENTARIO, PROPONER_MENSAJE);
  /**
   * El gráfico va con `canViewReports`, que **lo tiene todo el que llega aquí**
   * desde §29.1: las dos rutas del asistente lo exigen. No es una comprobación
   * de adorno — es la que dice de qué permiso depende esta capacidad el día que
   * alguien abra otra puerta al asistente, igual que `incluirPersonas` se dejó
   * puesta por eso mismo.
   *
   * Y es la única que le queda a un rol de solo lectura, que hasta ahora no
   * podía proponer absolutamente nada. Tiene sentido que sea justo esta: mirar
   * los datos de otra forma no es tocar el trabajo de nadie.
   */
  if (permisos.canViewReports) tools.push(PROPONER_GRAFICO);
  /**
   * El borrado cuelga de `canDeleteTask`, igual que su endpoint.
   *
   * ⚠️ **Y va aparte, no colgado de `canEditTask`.** `canDeleteTask` sí implica
   * `canEditTask`, `canMoveTask`, `canComment` y `canCreateTask` por jerarquía,
   * así que quien llega aquí ya tiene todas las demás. Lo que no pasa al revés:
   * quien edita **no** borra.
   */
  if (permisos.canDeleteTask) tools.push(PROPONER_BORRADO);
  return tools;
}

/**
 * ⚠️ **Aquí hay exactamente UNA herramienta destructiva, y solo una.**
 *
 * Este bloque decía que no había ninguna ni la iba a haber. Cambió el
 * 2026-08-18, y conviene que quede escrito **por qué el argumento de entonces no
 * se sostenía**, para que no se reabra cada seis meses:
 *
 * La regla de la casa nunca fue «el asistente no borra». Es **«el asistente
 * propone; ejecuta el código que ya existe»**. Y con el patrón de propuestas,
 * borrar cumple esa regla igual que crear: la herramienta devuelve una
 * propuesta, la persona la revisa, y quien llama a `DELETE /tasks/:id` es el
 * frontend con su sesión y sus permisos. Es indistinguible de que lo borre desde
 * el tablero.
 *
 * Las tres capas siguen intactas y ninguna depende de que el modelo obedezca:
 *
 * 1. las herramientas se declaran **filtradas por permiso**, así que lo que no
 *    te toca no se puede ni expresar;
 * 2. `validarPropuesta` descarta cualquier `call` fuera de la lista, y comprueba
 *    el `taskId` contra el inventario real del proyecto;
 * 3. las server actions solo saben llamar a los endpoints que tienen escritos, y
 *    el gateway vuelve a comprobar permisos en cada uno.
 *
 * Lo que **sí** es distinto del resto: un borrado **no se deshace**. Toda la
 * diferencia está en la interfaz —la tarjeta es destructiva, lleva confirmación
 * propia y dice qué se lleva por delante— y en la descripción de la herramienta,
 * que le prohíbe proponerlo por iniciativa propia.
 *
 * **`proponer_grafico` no es la excepción**, aunque sea la primera que no toca
 * el tablero. Solo **añade** al lienzo de quien habla; no existe la de quitar, y
 * no se va a añadir por lo mismo que las demás: quitar un gráfico es un clic en
 * su aspa, y darle al asistente la capacidad de vaciarle el panel a alguien solo
 * abre una forma de que se lo vacíe sin querer.
 */
