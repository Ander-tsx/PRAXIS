import {
  COLUMN_COLORS,
  LABEL_COLORS,
  PLANTILLA_LIMITES,
  type PlantillaColumna,
  type PlantillaDeProyecto,
  type PlantillaEspacio,
  type PlantillaEtiqueta,
  type PlantillaRol,
  type PlantillaTablero,
  ProjectPermission,
} from '@praxis/contracts';

import type { FunctionDeclaration } from './tools';

/**
 * La plantilla de arranque: una herramienta aparte, con su prompt aparte.
 *
 * ## Por qué no entra en `herramientasPara`
 *
 * Las seis de `tools.ts` son turnos de conversación **sobre un proyecto que ya
 * existe**: se filtran por los permisos de esa persona en ese proyecto, rellenan
 * ids sacados de un briefing y se guardan como propuestas de un hilo. Aquí no
 * hay nada de eso — no hay proyecto, no hay briefing, no hay permisos que
 * consultar y no hay conversación—, así que meterla en aquella lista habría
 * significado declarársela al modelo en **todos** los turnos normales, con el
 * resultado de que a mitad de una charla sobre tareas pudiera proponer rehacer
 * el proyecto entero. Es justo la capacidad que el pie de `tools.ts` pide no
 * añadir a la ligera.
 *
 * ## La invariante se mantiene
 *
 * **La IA propone; ejecuta el código que ya existe.** Esto devuelve un objeto
 * con nombres, y nada más. Quien lo materializa es el frontend, llamando una a
 * una a las rutas que ya usa el formulario de cada cosa, con la sesión de quien
 * pulsa y bajo las validaciones de siempre. Este servicio sigue sin escribir en
 * ninguna base que no sea la suya.
 *
 * Y sigue sin haber borrado: una plantilla solo **añade** sobre un proyecto
 * recién creado, que por definición está vacío.
 */

/**
 * Los permisos que el modelo puede repartir entre los roles que proponga.
 *
 * Sale del enum, no de una lista escrita a mano: un permiso nuevo entra solo, y
 * lo que no está en el enum no se puede nombrar. Se excluye `canDeleteProject`
 * —el proyecto entero, sin vuelta atrás— porque una plantilla de arranque no
 * tiene ningún motivo para repartir eso, y un rol que lo lleve por descuido es
 * el peor regalo posible el primer día.
 */
const PERMISOS_REPARTIBLES: string[] = Object.values(ProjectPermission).filter(
  (permiso) => permiso !== ProjectPermission.CAN_DELETE_PROJECT,
);

const COLUMNA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    nombre: { type: 'STRING', description: 'Maximo 40 caracteres.' },
    color: {
      type: 'STRING',
      enum: [...COLUMN_COLORS],
      description:
        'Opcional. ⚠️ "success" NO es un color, es un significado: marca la columna ' +
        'de cierre y una tarea que entra ahi se da por terminada. Ponlo SOLO en la ' +
        'ultima columna del tablero, la de trabajo acabado, y en ninguna otra.',
    },
  },
  required: ['nombre'],
};

export const PROPONER_PLANTILLA: FunctionDeclaration = {
  name: 'proponer_plantilla',
  description:
    'Prepara la estructura de arranque de un proyecto NUEVO a partir de lo que la ' +
    'persona cuenta sobre el: su sector, su equipo, como trabajan y que necesitan. ' +
    'NO crea nada: es una propuesta que la persona revisa, edita y acepta. Llamala ' +
    'SIEMPRE, una sola vez, con la plantilla entera.',
  parameters: {
    type: 'OBJECT',
    properties: {
      nombre: {
        type: 'STRING',
        description:
          'Nombre del proyecto, maximo 60 caracteres. Si la persona ya lo ha dicho, ' +
          'usa el suyo tal cual y no lo mejores.',
      },
      descripcion: {
        type: 'STRING',
        description:
          'De que va el proyecto, en dos o tres frases: que se persigue, para quien y ' +
          'que lo delimita. Se guarda como descripcion del proyecto y la lee todo el ' +
          'equipo al entrar, asi que escribela para alguien que se incorpora manana y ' +
          'no estuvo en la conversacion. Maximo 500 caracteres.',
      },
      etiquetas: {
        type: 'ARRAY',
        description:
          `Vocabulario para clasificar tareas. Como mucho ${PLANTILLA_LIMITES.etiquetas}. ` +
          'Del sector de la persona, no genericas: para una constructora "obra civil" o ' +
          '"licencias", no "tarea importante".',
        items: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING', description: 'Maximo 40 caracteres.' },
            color: { type: 'STRING', enum: [...LABEL_COLORS] },
          },
          required: ['nombre', 'color'],
        },
      },
      roles: {
        type: 'ARRAY',
        description:
          `Perfiles del equipo. Como mucho ${PLANTILLA_LIMITES.roles}. ⚠️ NO incluyas ` +
          'un rol de administracion: el proyecto ya nace con uno y con su dueno dentro. ' +
          'Da a cada rol lo MINIMO que necesita para su trabajo; un rol que lo puede ' +
          'todo no es un rol.',
        items: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING', description: 'Maximo 40 caracteres.' },
            permisos: {
              type: 'ARRAY',
              description: 'Claves exactas de la lista. No inventes ninguna.',
              items: { type: 'STRING', enum: PERMISOS_REPARTIBLES },
            },
          },
          required: ['nombre', 'permisos'],
        },
      },
      espacios: {
        type: 'ARRAY',
        description:
          `Como se divide el trabajo. Como mucho ${PLANTILLA_LIMITES.espacios}. Un ` +
          'espacio agrupa tableros; un tablero es un flujo con sus columnas. Si el ' +
          'proyecto es sencillo, UN espacio con UN tablero es la respuesta correcta: ' +
          'no infles la estructura para parecer completo.',
        items: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING', description: 'Maximo 60 caracteres.' },
            tableros: {
              type: 'ARRAY',
              description: `Como mucho ${PLANTILLA_LIMITES.tablerosPorEspacio} por espacio.`,
              items: {
                type: 'OBJECT',
                properties: {
                  nombre: { type: 'STRING', description: 'Maximo 60 caracteres.' },
                  columnas: {
                    type: 'ARRAY',
                    description:
                      `Entre 3 y ${PLANTILLA_LIMITES.columnasPorTablero}, EN ORDEN, de ` +
                      'lo que empieza a lo que acaba. Con los nombres del sector de la ' +
                      'persona cuando los tenga.',
                    items: COLUMNA,
                  },
                },
                required: ['nombre', 'columnas'],
              },
            },
          },
          required: ['nombre', 'tableros'],
        },
      },
      porQue: {
        type: 'STRING',
        description:
          'OBLIGATORIO. Por que ESTA estructura y no otra, atado a lo que la persona ' +
          'ha contado. Nombra tus decisiones de verdad: por que ese reparto de ' +
          'espacios, por que esas columnas y cual cierra el trabajo, por que esos ' +
          'roles. Cita lo que te dijeron ("como llevais tres obras a la vez, un ' +
          'tablero por obra"). Tres o cuatro frases. NO repitas la lista de lo que ' +
          'propones —esa ya se ve—: explica el criterio.',
      },
    },
    required: ['nombre', 'descripcion', 'etiquetas', 'roles', 'espacios', 'porQue'],
  },
};

/**
 * La instrucción de sistema del borrador.
 *
 * Propia y no la de `prompt.ts`: aquella arranca describiendo un proyecto con
 * sus tareas y sus métricas, y aquí no hay ninguna de las dos cosas. Reutilizarla
 * habría sido darle al modelo un contexto vacío y pedirle que lo ignore.
 */
export function instruccionDePlantilla(): string {
  return [
    'Eres el asistente de PRAXIS, una herramienta de gestion de proyectos con',
    'tableros tipo kanban. Alguien va a crear un proyecto nuevo y te cuenta de que',
    'va. Tu trabajo es proponerle la estructura de arranque.',
    '',
    'REGLAS:',
    '1. Llama a "proponer_plantilla" SIEMPRE y UNA SOLA VEZ, con la plantilla entera.',
    '   No respondas solo con texto: sin la llamada no se pinta nada.',
    '2. NO creas nada. Es una propuesta que la persona revisa y edita antes de aceptar.',
    '3. Ajustate a lo que te cuentan. Si dicen que son tres personas, no propongas',
    '   seis roles; si su sector tiene nombres propios para las fases, usalos en las',
    '   columnas en vez de "Por hacer / En curso / Hecho".',
    '4. Si te dan poca informacion, propon algo sencillo y honesto en vez de inventar',
    '   un organigrama. Un espacio, un tablero y cuatro columnas es una respuesta',
    '   perfectamente buena.',
    '5. Los permisos, al minimo. Un rol tiene lo que necesita para su trabajo y nada',
    '   mas. No repartas permisos de gestion —miembros, roles, borrar— salvo que la',
    '   persona describa a alguien que de verdad coordina.',
    '6. NO propongas un rol de administracion: el proyecto nace con uno y con su',
    '   dueno dentro.',
    '7. Explicate. La pantalla enseña tu plan entero y alguien decide si lo acepta:',
    '   "porQue" es lo unico que le dice de donde sale. Sin criterio, no revisa: confia.',
    '8. Escribe en el idioma en el que te hablen.',
  ].join('\n');
}

/* ─── Validación ──────────────────────────────────────────────────────── */

const COLORES_ETIQUETA = new Set<string>(LABEL_COLORS);
const COLORES_COLUMNA = new Set<string>(COLUMN_COLORS);
const PERMISOS = new Set<string>(PERMISOS_REPARTIBLES);

function texto(valor: unknown, maximo: number): string {
  return String(valor ?? '')
    .trim()
    .slice(0, maximo);
}

/**
 * Convierte lo que devolvió el modelo en una plantilla utilizable, o `null`.
 *
 * Se recorta en vez de rechazar cuando el exceso es de cantidad —trece etiquetas
 * en vez de doce— y se rechaza solo lo que no se puede arreglar: sin nombre o
 * sin ningún espacio no hay proyecto que crear. Un plan un poco recortado es
 * mucho mejor que un error, porque además la persona lo va a editar.
 */
export function validarPlantilla(call: {
  name: string;
  args: Record<string, unknown>;
}): PlantillaDeProyecto | null {
  if (call.name !== PROPONER_PLANTILLA.name) return null;

  const args = call.args ?? {};
  const nombre = texto(args.nombre, 60);
  if (!nombre) return null;

  const espacios = validarEspacios(args.espacios);
  if (espacios.length === 0) return null;

  return {
    nombre,
    descripcion: texto(args.descripcion, 500),
    etiquetas: validarEtiquetas(args.etiquetas),
    roles: validarRoles(args.roles),
    espacios,
    porQue: texto(args.porQue, 900),
  };
}

function validarEtiquetas(crudas: unknown): PlantillaEtiqueta[] {
  if (!Array.isArray(crudas)) return [];

  const vistas = new Set<string>();

  return crudas
    .map((cruda) => {
      const item = (cruda ?? {}) as Record<string, unknown>;
      const nombre = texto(item.nombre, 40);
      const color = String(item.color ?? '');
      /* Un color inventado no tumba la etiqueta: cae al de por defecto, que es
         lo que haría el formulario si nadie tocara el desplegable. */
      return { nombre, color: COLORES_ETIQUETA.has(color) ? color : 'primary' };
    })
    .filter((etiqueta) => {
      if (!etiqueta.nombre) return false;
      /* `POST /projects/:id/labels` rechaza el nombre repetido con un 409, y en
         una plantilla eso saldría como «se crearon 7 de 9» sin decir por qué. */
      const clave = etiqueta.nombre.toLowerCase();
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .slice(0, PLANTILLA_LIMITES.etiquetas);
}

/**
 * Los roles, con sus permisos **normalizados a diccionario**.
 *
 * ⚠️ Es la trampa 8 de CLAUDE.md, y aquí muerde seguro: el esquema declara
 * `permisos` como `ARRAY` porque es lo que un modelo rellena bien, y el endpoint
 * exige un diccionario de booleanos. La conversión va aquí, en el borde, y no en
 * el frontend: un array llegaría a `POST /projects/:id/roles` como un 400 que
 * nadie sabría de dónde sale.
 */
function validarRoles(crudos: unknown): PlantillaRol[] {
  if (!Array.isArray(crudos)) return [];

  const vistos = new Set<string>();

  return crudos
    .map((crudo) => {
      const item = (crudo ?? {}) as Record<string, unknown>;
      const lista = Array.isArray(item.permisos) ? item.permisos : [];
      const permisos: Record<string, boolean> = {};

      for (const clave of lista) {
        const nombre = String(clave ?? '');
        if (PERMISOS.has(nombre)) permisos[nombre] = true;
      }

      return { nombre: texto(item.nombre, 40), permisos };
    })
    .filter((rol) => {
      /* Un rol sin ni un permiso válido no es un rol: al aceptarlo saldría una
         fila que no habilita nada, y el endpoint además lo rechaza. */
      if (!rol.nombre || Object.keys(rol.permisos).length === 0) return false;
      const clave = rol.nombre.toLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, PLANTILLA_LIMITES.roles);
}

function validarEspacios(crudos: unknown): PlantillaEspacio[] {
  if (!Array.isArray(crudos)) return [];

  return crudos
    .map((crudo) => {
      const item = (crudo ?? {}) as Record<string, unknown>;
      return {
        nombre: texto(item.nombre, 60),
        tableros: validarTableros(item.tableros),
      };
    })
    .filter((espacio) => espacio.nombre.length > 0 && espacio.tableros.length > 0)
    .slice(0, PLANTILLA_LIMITES.espacios);
}

function validarTableros(crudos: unknown): PlantillaTablero[] {
  if (!Array.isArray(crudos)) return [];

  return crudos
    .map((crudo) => {
      const item = (crudo ?? {}) as Record<string, unknown>;
      return {
        nombre: texto(item.nombre, 60),
        columnas: validarColumnas(item.columnas),
      };
    })
    .filter((tablero) => tablero.nombre.length > 0 && tablero.columnas.length > 0)
    .slice(0, PLANTILLA_LIMITES.tablerosPorEspacio);
}

/**
 * Las columnas, en orden y con **una sola** de cierre.
 *
 * ⚠️ El `success` se recorta a la última que lo pida. Repartido por varias
 * columnas convertiría el tablero en uno donde una tarea se da por terminada a
 * mitad del flujo, que es un fallo de datos y no de estética — y el modelo lo
 * hace: pedirle un color «de acabado» y darle una lista de fases invita a
 * pintar de verde todo lo que suene a terminado.
 */
function validarColumnas(crudas: unknown): PlantillaColumna[] {
  if (!Array.isArray(crudas)) return [];

  const columnas = crudas
    .map((cruda) => {
      const item = (cruda ?? {}) as Record<string, unknown>;
      const color = String(item.color ?? '');
      return {
        nombre: texto(item.nombre, 40),
        ...(COLORES_COLUMNA.has(color) ? { color } : {}),
      };
    })
    .filter((columna) => columna.nombre.length > 0)
    .slice(0, PLANTILLA_LIMITES.columnasPorTablero);

  const ultimaDeCierre = columnas.reduce(
    (encontrada, columna, indice) => (columna.color === 'success' ? indice : encontrada),
    -1,
  );

  return columnas.map((columna, indice) =>
    columna.color === 'success' && indice !== ultimaDeCierre ? { nombre: columna.nombre } : columna,
  );
}
