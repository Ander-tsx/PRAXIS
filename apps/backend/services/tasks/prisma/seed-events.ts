/**
 * Semilla de **historial sintético** para poder ver la sección de Reportes.
 *
 * ## Por qué existe
 *
 * El historial de tareas solo se puede capturar hacia adelante: antes de que
 * existiera `TaskEvent` no se guardaba nada, así que el día que se implementó
 * había cero tiempos de ciclo y cero throughput. Sin esto, la sección de
 * Reportes enseña estados vacíos durante semanas y no hay nada que enseñar ni
 * que defender.
 *
 * ## Lo que NO hace
 *
 * **No retro-rellena el proyecto real.** No se puede: nadie guardó cuándo se
 * movió cada tarea de «Rediseño del panel», y fabricar ese dato encima del real
 * sería mentir sobre trabajo que de verdad ocurrió.
 *
 * En su lugar crea un **proyecto aparte**, con el nombre puesto para que se lea
 * de qué es, y ahí sí fabrica ocho semanas de flujo plausible. El proyecto de
 * demostración de siempre se queda intacto.
 *
 * ## Cómo queda marcado
 *
 * Todos los eventos llevan `actorId = ACTOR_SINTETICO` (el UUID de ceros), que
 * no puede colisionar con ninguna persona real. Con eso la API sabe contarlos y
 * la interfaz puede avisar de que ese proyecto no mide trabajo real.
 *
 * ## Cuándo se ejecuta
 *
 * **Va enganchado a `prisma:seed` de este servicio**, detrás del seed normal.
 * Antes se lanzaba a mano y el resultado era que una base recién sembrada
 * enseñaba Análisis vacío: el estado por defecto del producto era el estado
 * roto. Como el seed de tasks es el último de los cuatro, aquí ya existen las
 * personas y los proyectos de los que esto tira.
 *
 * Sigue valiendo suelto, que es lo cómodo para regenerar solo el historial:
 *   pnpm --filter @praxis/tasks-service exec ts-node -r tsconfig-paths/register prisma/seed-events.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma-client';

/**
 * Marca de «esto lo fabricó un script».
 *
 * Va en `actorId` y no en una columna nueva a propósito: añadir un booleano a
 * `TaskEvent` haría que **toda** la tabla cargue con un campo que solo importa
 * en la demostración, y el UUID de ceros no puede ser el id de nadie.
 */
const ACTOR_SINTETICO = '00000000-0000-0000-0000-000000000000';

/**
 * La cuenta de administración, fijada en `credentials/seed.ts`.
 *
 * Se repite aquí porque los seeders no se importan entre sí —cada uno corre con
 * su propio cliente de Prisma y contra su propio esquema— y es el mismo UUID que
 * ya está a fuego en los seeders de `permissions` y `projects`.
 */
const SUPERADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';

const NOMBRE_PROYECTO = 'Sprint histórico (datos de demostración)';

/**
 * El slug va escrito, no derivado del nombre.
 *
 * ⚠️ Este archivo inserta en `projects.projects` con **SQL crudo**, porque el
 * cliente tipado de este servicio solo conoce el esquema `tasks`. Eso significa
 * que TypeScript **no comprueba las columnas**: cuando `slug` pasó a ser
 * obligatorio, el seed normal dejó de compilar y avisó, pero este habría
 * reventado en ejecución con una violación de NOT NULL, ya con las tablas
 * recreadas y a mitad de la siembra.
 *
 * Si alguien vuelve a añadir una columna obligatoria a `Project`, hay que
 * acordarse de este INSERT: es el único sitio donde el compilador no ayuda.
 */
const SLUG_PROYECTO = 'sprint-historico-datos-de-demostracion';

/**
 * Cuánto historial se fabrica.
 *
 * **16 semanas y no 8.** `weekly` acepta hasta 52 y dibuja una serie: con ocho
 * puntos el gráfico es un boceto, y la mitad de esa ventana son las dos semanas
 * que `forecast` exige como mínimo, así que no quedaba margen para *ver* una
 * tendencia —solo para que el endpoint dejara de decir que no hay datos.
 *
 * Con 180 tareas, `cycle-time` tiene muestras de sobra para que p50 y p85 se
 * separen de verdad en vez de salir pegados por falta de cola, y la predicción
 * de Monte Carlo se remuestrea sobre ~110 días de ritmo observado.
 */
const SEMANAS = 16;
const TAREAS = 180;

const DIA = 86_400_000;

const COLUMNAS = [
  { name: 'Por hacer', color: 'primary', order: 0 },
  { name: 'En curso', color: 'accent', order: 1 },
  { name: 'En revisión', color: 'info', order: 2 },
  { name: 'Hecho', color: 'success', order: 3 }, // verde = columna de cierre
];

const TITULOS = [
  'Ajustar el contraste de los estados deshabilitados',
  'Migrar el selector de fechas a la versión nueva',
  'Cachear el listado del tablero',
  'Corregir el desbordamiento en pantallas de 320 px',
  'Añadir el índice que faltaba en la consulta de vencimientos',
  'Revisar los textos de los estados vacíos',
  'Unificar los espaciados de las tarjetas',
  'Quitar la dependencia muerta del paquete de iconos',
  'Documentar el flujo de invitaciones',
  'Reducir el tamaño del paquete de la landing',
  'Arreglar el foco al cerrar el diálogo',
  'Normalizar los saltos de línea en los comentarios',
  'Paginar el listado de actividad del proyecto',
  'Separar el cliente de Redis en su propio módulo',
  'Traducir los mensajes de error del formulario de alta',
  'Añadir reintento con espera al cliente del gateway',
  'Medir el tiempo de respuesta del tablero en producción',
  'Recortar el tamaño de las imágenes del onboarding',
  'Revisar los contrastes del tema claro',
  'Cerrar la sesión al caducar el refresh token',
  'Agrupar las migraciones sueltas del último mes',
  'Cachear el conteo de avisos sin leer',
  'Quitar el scroll horizontal de la tabla de miembros',
  'Validar el tamaño del adjunto antes de subirlo',
  'Extraer los tokens de color a un único archivo',
  'Ordenar las columnas por posición y no por id',
  'Escribir las pruebas del guard de permisos',
  'Documentar el flujo de renovación de sesión',
  'Corregir el huso horario en las fechas de vencimiento',
];

const PRIORIDADES = ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'URGENT'] as const;

/**
 * El vocabulario del proyecto sembrado.
 *
 * Sin etiquetas, «de qué trata cada tarea» no está en ninguna parte: el
 * historial sabe cuándo se movió cada cosa y quién la llevaba, pero no de qué
 * era. El asistente recomienda a alguien cruzando **experiencia y carga**, y la
 * experiencia solo existe si las tareas dicen de qué son.
 */
const ETIQUETAS = [
  { name: 'frontend', color: 'primary' },
  { name: 'backend', color: 'accent' },
  { name: 'diseño', color: 'info' },
  { name: 'infra', color: 'warning' },
  { name: 'datos', color: 'error' },
] as const;

/**
 * A qué se dedica cada persona, por orden en la lista de miembros.
 *
 * ⚠️ **El sesgo es el punto de todo esto, no un adorno.** Con las etiquetas
 * repartidas al azar todo el mundo acaba con más o menos lo mismo de cada cosa,
 * y entonces «¿a quién le encaja esta tarea?» no tiene respuesta: cualquiera
 * vale, así que la recomendación no recomienda nada. Cada persona tiene una
 * especialidad clara y una segunda ocupación, que es como se reparte el trabajo
 * en un equipo de verdad —nadie hace solo una cosa.
 *
 * Los pesos son «de cada 10 tareas suyas, cuántas de esta etiqueta».
 */
const ESPECIALIDAD: Record<string, number>[] = [
  { frontend: 6, diseño: 3, backend: 1 },
  { backend: 6, datos: 3, infra: 1 },
  { diseño: 6, frontend: 3, datos: 1 },
  { infra: 6, backend: 3, datos: 1 },
  { datos: 5, backend: 3, frontend: 2 },
];

const azar = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];
const entre = (min: number, max: number) => min + Math.random() * (max - min);

/** Saca una clave del reparto respetando sus pesos. */
function azarConPesos(pesos: Record<string, number>): string {
  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  let tirada = Math.random() * total;
  for (const [clave, peso] of Object.entries(pesos)) {
    tirada -= peso;
    if (tirada <= 0) return clave;
  }
  return Object.keys(pesos)[0];
}

/**
 * Reparte los cierres de forma **desigual**, que es como ocurren de verdad.
 *
 * Con un ritmo constante la predicción de Monte Carlo sale con un intervalo
 * absurdamente estrecho y el gráfico parece de mentira — que es exactamente lo
 * que es. Los fines de semana bajan y hay semanas mejores que otras.
 */
function pesoDelDia(fecha: Date): number {
  const dia = fecha.getDay();
  if (dia === 0 || dia === 6) return 0.15;
  return entre(0.6, 1.4);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  /**
   * El dueño es **siempre la cuenta de administración**, y esto era un bug.
   *
   * Antes salía de `SELECT DISTINCT "userId" FROM projects.project_members
   * LIMIT 5` y se tomaba el primero. Sin `ORDER BY`, Postgres no promete ningún
   * orden: el proyecto histórico acababa siendo de María o de Carlos según cómo
   * hubiera quedado la tabla, y el resultado cambiaba entre dos sembrados de la
   * misma base. Ahora es fijo.
   *
   * Es el mismo UUID que fija `credentials/seed.ts` para la cuenta de
   * administración, y el que `permissions/seed.ts` promueve a SuperAdmin.
   */
  const dueno = SUPERADMIN_USER_ID;

  /**
   * Quién más hay para repartir el trabajo.
   *
   * El dueño va primero y siempre; los demás salen de lo que haya en la base,
   * **ordenados** para que dos sembrados den lo mismo. En una instalación recién
   * creada no habrá nadie más, y entonces el reparto es solo suyo — o de nadie,
   * si se pidió no asignar.
   */
  const otros = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT "userId" FROM projects.project_members
     WHERE "userId" <> ${dueno}::text
     ORDER BY "userId" LIMIT 4
  `;
  const personas = [{ userId: dueno }, ...otros];

  /**
   * Sin encargados, a propósito.
   *
   * Se activa con `SEED_SIN_ASIGNAR=1` y sirve para arrancar una instalación
   * limpia en la que las cuentas todavía no existen: se siembra el historial y
   * el reparto se hace después, a mano, desde la interfaz.
   *
   * ⚠️ **Lo que cuesta, dicho antes de usarlo:** las tres consultas por persona
   * salen de `tasks.task_assignees`, así que mientras no se asigne nada el
   * reparto por persona sale vacío y la instantánea dirá que ninguna tarea tiene
   * a nadie. Lo demás —flujo, tiempos, ciclo y predicción— no mira los
   * encargados y sale igual.
   *
   * Y lo que **no** cuesta: asignar después no falsea nada. Las medianas por
   * persona se calculan con el `createdAt` y el `completedAt` fabricados de cada
   * tarea, no con la fecha en que se asignó, así que en cuanto se reparta el
   * informe sale correcto y con los tiempos del histórico.
   */
  const sinAsignar = process.env.SEED_SIN_ASIGNAR === '1';

  /* El esquema `projects` se toca con SQL crudo: el cliente tipado de este
     servicio solo conoce el esquema `tasks`. Es la misma conexión y la misma
     base, así que no hace falta un segundo cliente. */
  /**
   * ⚠️ Las fechas se calculan **en JavaScript** y se pasan como parámetro.
   *
   * Escribir `interval '${SEMANAS} weeks'` no funciona: el template etiquetado
   * de Prisma convierte cualquier `${}` en un bind, así que eso genera
   * `interval '$4 weeks'` —un texto literal con un dólar dentro— y Postgres
   * rechaza la consulta por número de parámetros. No es un problema de comillas:
   * es que ahí dentro no se puede interpolar nada.
   */
  const arranque = new Date(Date.now() - SEMANAS * 7 * DIA);

  const existentes = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM projects.projects WHERE name = ${NOMBRE_PROYECTO}
  `;

  let projectId: string;

  if (existentes.length > 0) {
    projectId = existentes[0].id;
    console.log(`Reutilizando el proyecto ${projectId} y limpiando su historial…`);
    await prisma.taskEvent.deleteMany({ where: { projectId } });
    await prisma.task.deleteMany({ where: { projectId } });
  } else {
    const creado = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.projects (id, name, slug, description, "ownerId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${NOMBRE_PROYECTO}, ${SLUG_PROYECTO},
              ${'Historial fabricado para poder enseñar los reportes. No mide trabajo real.'},
              ${dueno}, ${arranque}, now())
      RETURNING id
    `;
    projectId = creado[0].id;
    console.log(`Proyecto creado: ${projectId}`);

    const rol = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.project_roles (id, name, "projectId", permissions)
      VALUES (gen_random_uuid(), 'Administrador', ${projectId}::text,
              ${JSON.stringify({
                canViewProject: true,
                canCreateTask: true,
                canEditTask: true,
                canDeleteTask: true,
                canMoveTask: true,
                canComment: true,
                canCreateBoard: true,
                canEditBoard: true,
                canDeleteBoard: true,
                canCreateColumn: true,
                canEditColumn: true,
                canDeleteColumn: true,
                canManageMembers: true,
                canManageRoles: true,
                canManageLabels: true,
                canEditProject: true,
                canViewReports: true,
                canDeleteProject: true,
              })}::jsonb)
      RETURNING id
    `;

    for (const persona of personas) {
      await prisma.$executeRaw`
        INSERT INTO projects.project_members (id, "projectId", "userId", "projectRoleId", "joinedAt")
        VALUES (gen_random_uuid(), ${projectId}::text, ${persona.userId}::text, ${rol[0].id}::text,
                ${arranque})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  /* Espacio, tablero y columnas: se recrean solo si no están. */
  let columnas = await prisma.$queryRaw<{ id: string; name: string; order: number }[]>`
    SELECT c.id, c.name, c."order" FROM projects.board_columns c
      JOIN projects.boards b ON b.id = c."boardId"
      JOIN projects.workspaces w ON w.id = b."workspaceId"
     WHERE w."projectId" = ${projectId}::text
     ORDER BY c."order"
  `;

  let boardId: string;

  if (columnas.length === 0) {
    const ws = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.workspaces (id, name, "projectId", "createdAt")
      VALUES (gen_random_uuid(), 'Sprint', ${projectId}::text, ${arranque}) RETURNING id
    `;
    const board = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.boards (id, name, "workspaceId", "createdAt")
      VALUES (gen_random_uuid(), 'Tablero del sprint', ${ws[0].id}::text, ${arranque}) RETURNING id
    `;
    boardId = board[0].id;
    for (const col of COLUMNAS) {
      await prisma.$executeRaw`
        INSERT INTO projects.board_columns (id, name, "order", color, "boardId")
        VALUES (gen_random_uuid(), ${col.name}, ${col.order}, ${col.color}, ${boardId}::text)
      `;
    }
    columnas = await prisma.$queryRaw`
      SELECT id, name, "order" FROM projects.board_columns
       WHERE "boardId" = ${boardId}::text ORDER BY "order"
    `;
  } else {
    const b = await prisma.$queryRaw<{ boardId: string }[]>`
      SELECT c."boardId" FROM projects.board_columns c
        JOIN projects.boards b ON b.id = c."boardId"
        JOIN projects.workspaces w ON w.id = b."workspaceId"
       WHERE w."projectId" = ${projectId}::text LIMIT 1
    `;
    boardId = b[0].boardId;
  }

  const cierre = columnas[columnas.length - 1];
  const inicio = new Date(Date.now() - SEMANAS * 7 * DIA);

  /* Las etiquetas se crean una vez y sobreviven a las re-ejecuciones: borrar las
     tareas se lleva sus `task_labels` por cascada, pero no las etiquetas, que
     son del proyecto. `upsert` sobre la clave (projectId, name). */
  const etiquetasPorNombre = new Map<string, string>();
  for (const etiqueta of ETIQUETAS) {
    const fila = await prisma.label.upsert({
      where: { projectId_name: { projectId, name: etiqueta.name } },
      update: { color: etiqueta.color },
      create: { projectId, name: etiqueta.name, color: etiqueta.color, createdAt: arranque },
    });
    etiquetasPorNombre.set(etiqueta.name, fila.id);
  }

  let creadas = 0;
  let cerradas = 0;

  for (let i = 0; i < TAREAS; i++) {
    /**
     * Nacimiento repartido por **toda** la ventana, hasta anteayer.
     *
     * ⚠️ Antes se cortaba al 75 % del periodo. Con 8 semanas eso dejaba dos sin
     * altas, que pasaba desapercibido; con 16 son cuatro, y el resultado era que
     * `weekly` —la tarjeta de «cómo fue la semana»— salía con la semana en curso
     * y la anterior a cero, `variacion` a `null` y el ritmo diario plano. Es
     * decir: justo el estado vacío que este archivo existe para evitar, solo que
     * cuatro semanas más tarde.
     *
     * El colchón de dos días es para que las últimas tareas creadas tengan
     * margen de moverse una vez y no nazcan ya paradas en la primera columna.
     */
    const nacida = new Date(inicio.getTime() + entre(0, SEMANAS * 7 - 2) * DIA);
    const titulo = `${azar(TITULOS)} (${i + 1})`;
    const prioridad = azar(PRIORIDADES);

    /**
     * El recorrido: hasta dónde llega la tarea.
     *
     * **Sesgado hacia terminar.** Con un destino uniforme solo una cuarta parte
     * llegaba a la columna de cierre, y salía un tablero donde nada acaba: el
     * ritmo daba 0,25 tareas/día y la predicción, seis meses. Aritméticamente
     * correcto y pésimo como demostración, porque lo que se quiere enseñar es
     * cómo se lee un equipo que funciona.
     *
     * Dos tercios llegan al final; el resto se queda por el camino, que es lo
     * que da volumen a las bandas intermedias del flujo acumulado.
     */
    const llegaAlFinal = Math.random() < 0.66;
    const hasta = llegaAlFinal ? columnas.length : 1 + Math.floor(entre(1, columnas.length - 1));
    const paradas = columnas.slice(1, hasta);
    const eventos: {
      type: string;
      fromColumnId?: string;
      toColumnId?: string;
      occurredAt: Date;
    }[] = [{ type: 'CREATED', toColumnId: columnas[0].id, occurredAt: nacida }];

    let momento = nacida;
    let actual = columnas[0];

    for (const parada of paradas) {
      /* El tiempo en cada columna sale de una distribución con cola: casi
         siempre poco, a veces mucho. Es lo que hace que los percentiles 50 y 85
         se separen, que es justo lo que la pantalla quiere enseñar. */
      const espera = Math.exp(entre(0, 2.2)) * pesoDelDia(momento);
      momento = new Date(momento.getTime() + espera * DIA);
      if (momento.getTime() > Date.now()) break;

      eventos.push({
        type: 'MOVED',
        fromColumnId: actual.id,
        toColumnId: parada.id,
        occurredAt: momento,
      });
      actual = parada;
    }

    const estaCerrada = actual.id === cierre.id;

    /**
     * El encargado se elige **antes** que la etiqueta, y no al revés.
     *
     * La etiqueta sale del reparto de esa persona, así que la correlación entre
     * quién lleva algo y de qué es queda en el dato. Sorteadas por separado no
     * habría nada que aprender: todo el mundo tendría de todo.
     */
    const indiceEncargado = Math.floor(Math.random() * personas.length);
    const encargado = personas[indiceEncargado];
    /* El sesgo de etiquetas se conserva **también sin encargados**: quien mira
       el reparto por etiqueta tiene que ver una mezcla creíble, y con un sorteo
       uniforme saldrían las cuatro iguales, que es lo que delata un dato
       inventado. Lo que se pierde sin asignar es la correlación entre persona y
       especialidad, no la forma del reparto. */
    const reparto = ESPECIALIDAD[indiceEncargado % ESPECIALIDAD.length];

    /* Casi siempre una etiqueta, a veces dos: una tarea puede ser de frontend y
       de diseño a la vez, y el modelo tiene que ver que eso pasa. Un 15 % se
       queda sin etiquetar, que también es la realidad de cualquier tablero. */
    const etiquetas = new Set<string>();
    if (Math.random() > 0.15) {
      etiquetas.add(azarConPesos(reparto));
      if (Math.random() < 0.25) etiquetas.add(azarConPesos(reparto));
    }

    const tarea = await prisma.task.create({
      data: {
        title: titulo,
        status: actual.name,
        boardId,
        columnId: actual.id,
        reporterId: dueno,
        projectId,
        priority: prioridad,
        order: i,
        createdAt: nacida,
        completedAt: estaCerrada ? momento : null,
        dueDate: new Date(nacida.getTime() + entre(3, 20) * DIA),
        assignees: sinAsignar
          ? undefined
          : {
              create: [{ userId: encargado.userId, assignedBy: dueno, assignedAt: nacida }],
            },
        labels: {
          create: [...etiquetas].map((nombre) => ({
            labelId: etiquetasPorNombre.get(nombre)!,
          })),
        },
      },
    });

    if (estaCerrada) {
      eventos.push({ type: 'COMPLETED', toColumnId: cierre.id, occurredAt: momento });
      cerradas++;
    }

    await prisma.taskEvent.createMany({
      data: eventos.map((evento) => ({
        taskId: tarea.id,
        projectId,
        boardId,
        type: evento.type as never,
        fromColumnId: evento.fromColumnId ?? null,
        toColumnId: evento.toColumnId ?? null,
        actorId: ACTOR_SINTETICO,
        taskTitle: titulo,
        occurredAt: evento.occurredAt,
      })),
    });

    creadas++;
  }

  console.log(`\n  ${creadas} tareas, ${cerradas} cerradas, ${SEMANAS} semanas de historial.`);
  console.log(`  ${ETIQUETAS.length} etiquetas repartidas con sesgo.`);
  console.log(`  Proyecto: ${NOMBRE_PROYECTO}`);
  console.log(`  Dueño: ${dueno}`);
  if (sinAsignar) {
    console.log('  ⚠️  SIN ENCARGADOS (SEED_SIN_ASIGNAR=1): el reparto por persona saldrá vacío');
    console.log('      hasta que se asigne a mano. Los tiempos por persona serán correctos');
    console.log('      cuando se asigne, porque salen de las fechas de la tarea.');
  }
  console.log(`  ⚠️  Todos los eventos llevan actorId=${ACTOR_SINTETICO}: son fabricados.`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
