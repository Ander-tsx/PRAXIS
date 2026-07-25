/**
 * Seed: Projects Service
 *
 * Creates a demo project with a complete structure:
 *   - Project "PRAXIS Demo"
 *   - Project roles: Manager (full permissions), Developer (create/edit tasks)
 *   - Workspace "Sprint 1"
 *   - Board "Kanban Principal"
 *   - Columns: Backlog, En Progreso, En Revisión, Completado
 *   - Admin as project member with Manager role
 *
 * Idempotent: uses upsert — safe to run multiple times.
 *
 * Run via root:
 *   pnpm prisma:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';
import { SEED_IDS } from './seed-ids';

const prisma = new PrismaClient();

// ─── Permission maps ───────────────────────────────────────────────────────

const MANAGER_PERMISSIONS = {
  canCreateBoard:  true,
  canEditBoard:    true,
  canDeleteBoard:  true,
  canCreateColumn: true,
  canEditColumn:   true,
  canDeleteColumn: true,
  canCreateTask:   true,
  canEditTask:     true,
  canDeleteTask:   true,
  canManageRoles:  true,
  canManageMembers: true,
};

const DEVELOPER_PERMISSIONS = {
  canCreateBoard:  false,
  canEditBoard:    false,
  canDeleteBoard:  false,
  canCreateColumn: false,
  canEditColumn:   false,
  canDeleteColumn: false,
  canCreateTask:   true,
  canEditTask:     true,
  canDeleteTask:   false,
  canManageRoles:  false,
  canManageMembers: false,
};

async function main() {
  console.log('📁  Seeding projects…');

  // ── 1. Project ────────────────────────────────────────────────────────────

  const project = await prisma.project.upsert({
    where: { name: 'PRAXIS Demo' },
    update: {},
    create: {
      id:          SEED_IDS.DEMO_PROJECT_ID,
      name:        'PRAXIS Demo',
      description: 'Proyecto de demostración creado por el seeder inicial',
      ownerId:     SEED_IDS.ADMIN_USER_ID,
    },
  });
  console.log(`  ✅  Project "${project.name}" ready (${project.id})`);

  // ── 2. Project Roles ──────────────────────────────────────────────────────

  const managerRole = await prisma.projectRole.upsert({
    where: { projectId_name: { projectId: project.id, name: 'Manager' } },
    update: {},
    create: {
      id:          SEED_IDS.MANAGER_ROLE_ID,
      name:        'Manager',
      projectId:   project.id,
      permissions: MANAGER_PERMISSIONS,
    },
  });
  console.log(`  ✅  ProjectRole "${managerRole.name}" ready`);

  await prisma.projectRole.upsert({
    where: { projectId_name: { projectId: project.id, name: 'Developer' } },
    update: {},
    create: {
      id:          SEED_IDS.DEVELOPER_ROLE_ID,
      name:        'Developer',
      projectId:   project.id,
      permissions: DEVELOPER_PERMISSIONS,
    },
  });
  console.log('  ✅  ProjectRole "Developer" ready');

  // ── 3. Workspace ──────────────────────────────────────────────────────────

  const workspace = await prisma.workspace.upsert({
    where: { projectId_name: { projectId: project.id, name: 'Sprint 1' } },
    update: {},
    create: {
      id:        SEED_IDS.WORKSPACE_ID,
      name:      'Sprint 1',
      projectId: project.id,
    },
  });
  console.log(`  ✅  Workspace "${workspace.name}" ready`);

  // ── 4. Board ──────────────────────────────────────────────────────────────

  // Board doesn't have a natural unique constraint beyond id,
  // so we use a raw upsert on the id.
  const existingBoard = await prisma.board.findUnique({ where: { id: SEED_IDS.BOARD_ID } });
  if (!existingBoard) {
    await prisma.board.create({
      data: {
        id:          SEED_IDS.BOARD_ID,
        name:        'Kanban Principal',
        workspaceId: workspace.id,
      },
    });
  }
  console.log('  ✅  Board "Kanban Principal" ready');

  // ── 5. Columns ────────────────────────────────────────────────────────────

  const columns = [
    { id: SEED_IDS.COL_BACKLOG_ID,  name: 'Backlog',      order: 0 },
    { id: SEED_IDS.COL_PROGRESS_ID, name: 'En Progreso',  order: 1 },
    { id: SEED_IDS.COL_REVIEW_ID,   name: 'En Revisión',  order: 2 },
    { id: SEED_IDS.COL_DONE_ID,     name: 'Completado',   order: 3 },
  ];

  for (const col of columns) {
    const existing = await prisma.boardColumn.findUnique({ where: { id: col.id } });
    if (!existing) {
      await prisma.boardColumn.create({
        data: { ...col, boardId: SEED_IDS.BOARD_ID },
      });
    }
    console.log(`  ✅  Column "${col.name}" ready`);
  }

  // ── 6. Project Member ─────────────────────────────────────────────────────

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId:    SEED_IDS.ADMIN_USER_ID,
      },
    },
    update: {},
    create: {
      id:            SEED_IDS.MEMBER_ADMIN_ID,
      projectId:     project.id,
      userId:        SEED_IDS.ADMIN_USER_ID,
      projectRoleId: managerRole.id,
    },
  });
  console.log('  ✅  Admin added as project member (Manager)');

  console.log('📁  Projects seed complete.\n');
}

main()
  .catch((err) => {
    console.error('❌  Projects seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
