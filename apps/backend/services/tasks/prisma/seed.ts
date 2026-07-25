/**
 * Seed: Tasks Service
 *
 * Creates sample tasks in the demo board:
 *   - Task 1: "Configurar entorno de desarrollo" (Backlog, MEDIUM)
 *   - Task 2: "Implementar autenticación" (En Progreso, HIGH) + checklist
 *   - Task 3: "Diseñar dashboard" (Completado, LOW)
 *
 * Idempotent: uses findUnique + create guard — safe to run multiple times.
 *
 * Run via root:
 *   pnpm prisma:seed
 */

import 'dotenv/config';
import { PrismaClient, Priority } from '../src/generated/prisma-client';
import { SEED_IDS } from './seed-ids';

const prisma = new PrismaClient();

// ─── Task definitions ───────────────────────────────────────────────────────

const TASKS = [
  {
    id:         SEED_IDS.TASK_1_ID,
    title:      'Configurar entorno de desarrollo',
    description: 'Instalar dependencias, levantar Docker, ejecutar migraciones y seeds.',
    status:     'Backlog',
    columnId:   SEED_IDS.COL_BACKLOG_ID,
    priority:   Priority.MEDIUM,
    order:      0,
  },
  {
    id:         SEED_IDS.TASK_2_ID,
    title:      'Implementar autenticación',
    description: 'Login, registro, JWT access/refresh tokens, guards.',
    status:     'En Progreso',
    columnId:   SEED_IDS.COL_PROGRESS_ID,
    priority:   Priority.HIGH,
    order:      0,
  },
  {
    id:         SEED_IDS.TASK_3_ID,
    title:      'Diseñar dashboard',
    description: 'Mockups del dashboard principal con métricas y navegación.',
    status:     'Completado',
    columnId:   SEED_IDS.COL_DONE_ID,
    priority:   Priority.LOW,
    order:      0,
  },
];

async function main() {
  console.log('📋  Seeding tasks…');

  // ── 1. Tasks ──────────────────────────────────────────────────────────────

  for (const task of TASKS) {
    const existing = await prisma.task.findUnique({ where: { id: task.id } });
    if (!existing) {
      await prisma.task.create({
        data: {
          ...task,
          boardId:    SEED_IDS.BOARD_ID,
          reporterId: SEED_IDS.ADMIN_USER_ID,
          projectId:  SEED_IDS.DEMO_PROJECT_ID,
        },
      });
    }
    console.log(`  ✅  Task "${task.title}" ready`);
  }

  // ── 2. Checklists for Task 2 ──────────────────────────────────────────────

  const checklists = [
    {
      id:     SEED_IDS.CHECKLIST_1_ID,
      taskId: SEED_IDS.TASK_2_ID,
      text:   'Crear endpoint POST /auth/login',
      order:  0,
      completed: true,
    },
    {
      id:     SEED_IDS.CHECKLIST_2_ID,
      taskId: SEED_IDS.TASK_2_ID,
      text:   'Implementar refresh token rotation',
      order:  1,
      completed: false,
    },
  ];

  for (const item of checklists) {
    const existing = await prisma.checklist.findUnique({ where: { id: item.id } });
    if (!existing) {
      await prisma.checklist.create({ data: item });
    }
    console.log(`  ✅  Checklist "${item.text}" ready`);
  }

  console.log('📋  Tasks seed complete.\n');
}

main()
  .catch((err) => {
    console.error('❌  Tasks seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
