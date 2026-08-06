import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';

const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const MARIA_USER_ID = '22222222-2222-4222-8222-222222222221';
const CARLOS_USER_ID = '33333333-3333-4333-8333-333333333331';

const PROJECT_ID = 'bbbb1111-1111-4111-8111-111111111111';
const BOARD_ID = 'dddd1111-1111-4111-8111-111111111111';

const COLUMN_TODO_ID = 'eeee1111-1111-4111-8111-111111111111';
const COLUMN_PROGRESS_ID = 'eeee2222-2222-4222-8222-222222222222';
const COLUMN_REVIEW_ID = 'eeee3333-3333-4333-8333-333333333333';
const COLUMN_DONE_ID = 'eeee4444-4444-4444-8444-444444444444';

const SEED_LABELS = [
  { id: 'lbl0001-0001-0001-0001-000000000001', name: 'Frontend', color: 'primary' },
  { id: 'lbl0002-0002-0002-0002-000000000002', name: 'Backend', color: 'accent' },
  { id: 'lbl0003-0003-0003-0003-000000000003', name: 'Bug', color: 'error' },
  { id: 'lbl0004-0004-0004-0004-000000000004', name: 'Mejora', color: 'info' },
] as const;

const COLUMN_STATUS: Record<string, string> = {
  [COLUMN_TODO_ID]: 'Por hacer',
  [COLUMN_PROGRESS_ID]: 'En progreso',
  [COLUMN_REVIEW_ID]: 'En revisión',
  [COLUMN_DONE_ID]: 'Completado',
};

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('Iniciando seed de tasks…\n');

  try {
    // 1. Etiquetas
    console.log('Creando etiquetas…');
    const labelMap = new Map<string, string>();

    for (const lbl of SEED_LABELS) {
      const label = await prisma.label.upsert({
        where: { projectId_name: { projectId: PROJECT_ID, name: lbl.name } },
        update: { color: lbl.color },
        create: {
          id: lbl.id,
          projectId: PROJECT_ID,
          name: lbl.name,
          color: lbl.color,
        },
      });
      labelMap.set(lbl.name, label.id);
    }

    console.log('\nCreando tareas…');

    async function upsertTask(data: {
      id: string;
      title: string;
      columnId: string;
      assigneeId: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      labelNames?: string[];
      dueDate?: Date;
      completedAt?: Date;
    }) {
      const existing = await prisma.task.findFirst({
        where: { projectId: PROJECT_ID, title: data.title },
      });

      const status = COLUMN_STATUS[data.columnId];

      if (existing) {
        console.log(`  ℹ️   Tarea "${data.title}" ya existe (${existing.id}). Omitida.`);
        return existing;
      }

      const task = await prisma.task.create({
        data: {
          id: data.id,
          title: data.title,
          status,
          boardId: BOARD_ID,
          columnId: data.columnId,
          reporterId: ADMIN_USER_ID,
          projectId: PROJECT_ID,
          priority: data.priority,
          dueDate: data.dueDate,
          completedAt: data.completedAt ?? null,
          assignees: {
            create: [
              {
                userId: data.assigneeId,
                assignedBy: ADMIN_USER_ID,
              },
            ],
          },
          ...(data.labelNames &&
            data.labelNames.length > 0 && {
              labels: {
                create: data.labelNames.map((name) => ({
                  labelId: labelMap.get(name)!,
                })),
              },
            }),
        },
      });

      console.log(`Tarea "${task.title}"  →  ${task.id}`);
      return task;
    }

    const now = new Date();
    const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

    const tarea1 = await upsertTask({
      id: 'task0001-0001-0001-0001-000000000001',
      title: 'Diseñar la pantalla de login',
      columnId: COLUMN_TODO_ID,
      assigneeId: MARIA_USER_ID,
      priority: 'HIGH',
      labelNames: ['Frontend'],
      dueDate: inDays(5),
    });

    const tarea2 = await upsertTask({
      id: 'task0002-0002-0002-0002-000000000002',
      title: 'Implementar endpoint de autenticación',
      columnId: COLUMN_PROGRESS_ID,
      assigneeId: CARLOS_USER_ID,
      priority: 'HIGH',
      labelNames: ['Backend'],
      dueDate: inDays(3),
    });

    const tarea3 = await upsertTask({
      id: 'task0003-0003-0003-0003-000000000003',
      title: 'Corregir error en el dashboard',
      columnId: COLUMN_PROGRESS_ID,
      assigneeId: MARIA_USER_ID,
      priority: 'URGENT',
      labelNames: ['Bug', 'Frontend'],
      dueDate: inDays(1),
    });

    const tarea4 = await upsertTask({
      id: 'task0004-0004-0004-0004-000000000004',
      title: 'Agregar filtros de búsqueda',
      columnId: COLUMN_REVIEW_ID,
      assigneeId: CARLOS_USER_ID,
      priority: 'MEDIUM',
      labelNames: ['Frontend'],
      dueDate: inDays(7),
    });

    await upsertTask({
      id: 'task0005-0005-0005-0005-000000000005',
      title: 'Optimizar consultas SQL',
      columnId: COLUMN_DONE_ID,
      assigneeId: ADMIN_USER_ID,
      priority: 'MEDIUM',
      labelNames: ['Backend'],
      dueDate: inDays(-2),
      completedAt: inDays(-1),
    });

    await upsertTask({
      id: 'task0006-0006-0006-0006-000000000006',
      title: 'Configurar pipeline de CI/CD',
      columnId: COLUMN_TODO_ID,
      assigneeId: CARLOS_USER_ID,
      priority: 'LOW',
      labelNames: ['Mejora'],
      dueDate: inDays(14),
    });

    console.log('\nCreando checklists…');

    async function upsertChecklist(
      taskId: string,
      text: string,
      completed: boolean,
      order: number,
    ) {
      const existing = await prisma.checklist.findFirst({ where: { taskId, text } });
      if (!existing) {
        await prisma.checklist.create({ data: { taskId, text, completed, order } });
      }
    }

    await upsertChecklist(tarea1.id, 'Crear wireframes', true, 0);
    await upsertChecklist(tarea1.id, 'Diseñar en Figma', false, 1);
    await upsertChecklist(tarea1.id, 'Revisión con el equipo', false, 2);
    console.log(`  ✅  Checklists de "${tarea1.title}"`);

    await upsertChecklist(tarea2.id, 'Definir DTOs', true, 0);
    await upsertChecklist(tarea2.id, 'Implementar servicio', true, 1);
    await upsertChecklist(tarea2.id, 'Escribir pruebas unitarias', false, 2);
    console.log(`  ✅  Checklists de "${tarea2.title}"`);

    console.log('\n  💬  Creando comentarios…');

    async function upsertComment(taskId: string, authorId: string, body: string) {
      const existing = await prisma.taskComment.findFirst({ where: { taskId, authorId, body } });
      if (!existing) {
        await prisma.taskComment.create({ data: { taskId, authorId, body } });
      }
    }

    // Tarea 2
    await upsertComment(
      tarea2.id,
      ADMIN_USER_ID,
      'Ya está el endpoint base, falta agregar la validación del token.',
    );
    await upsertComment(
      tarea2.id,
      CARLOS_USER_ID,
      'Listo, comienzo con los guards de NestJS esta tarde.',
    );
    console.log(`  ✅  Comentarios de "${tarea2.title}"`);

    // Tarea 3
    await upsertComment(
      tarea3.id,
      MARIA_USER_ID,
      'Reproduje el error: es un null pointer en el reducer de estado.',
    );
    await upsertComment(
      tarea3.id,
      ADMIN_USER_ID,
      'Buena captura. Revisa también el middleware de autenticación, puede estar relacionado.',
    );
    console.log(`  ✅  Comentarios de "${tarea3.title}"`);

    // 5. Subtarea
    console.log('\n  🔗  Creando subtarea…');
    const subtareaExisting = await prisma.task.findFirst({
      where: { projectId: PROJECT_ID, title: 'Maquetado HTML del formulario' },
    });

    if (!subtareaExisting) {
      await prisma.task.create({
        data: {
          id: 'task0007-0007-0007-0007-000000000007',
          title: 'Maquetado HTML del formulario',
          status: COLUMN_STATUS[COLUMN_TODO_ID],
          boardId: BOARD_ID,
          columnId: COLUMN_TODO_ID,
          reporterId: ADMIN_USER_ID,
          projectId: PROJECT_ID,
          priority: 'MEDIUM',
          parentTaskId: tarea1.id,
          dueDate: inDays(3),
          assignees: {
            create: [{ userId: MARIA_USER_ID, assignedBy: ADMIN_USER_ID }],
          },
        },
      });
      console.log(`  ✅  Subtarea de "${tarea1.title}" creada`);
    } else {
      console.log(`  ℹ️   Subtarea de "${tarea1.title}" ya existe. Omitida.`);
    }

    console.log('\n✅  Seed de tasks completado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌  Seed falló:', err);
  process.exit(1);
});
