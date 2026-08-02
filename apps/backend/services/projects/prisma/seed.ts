/**
 * Seed: Proyecto de demostración
 *
 * Crea un proyecto completo con toda su jerarquía para poder probar la
 * aplicación desde el primer arranque:
 *
 *   Project "Proyecto PRAXIS Demo"
 *     └── ProjectRole "Administrador"  (permisos completos)
 *     └── ProjectRole "Miembro"        (permisos básicos)
 *     └── ProjectMember admin  → Administrador
 *     └── ProjectMember maría  → Miembro
 *     └── ProjectMember carlos → Miembro
 *     └── Workspace "Sprint 1"
 *           └── Board "Tablero principal"
 *                 ├── BoardColumn "Por hacer"    (order=0, color=primary)
 *                 ├── BoardColumn "En progreso"  (order=1, color=accent)
 *                 ├── BoardColumn "En revisión"  (order=2, color=info)
 *                 └── BoardColumn "Completado"   (order=3, color=success)
 *
 * Los UUIDs de columnas son compartidos con tasks/seed.ts para que las
 * tareas puedan referenciarse sin cruzar schemas.
 *
 * Es idempotente: re-ejecutar no duplica ni destruye datos.
 *
 * Orden recomendado: 1) credentials → 2) permissions → 3) projects → 4) tasks
 *
 * Run with:
 *   npm run prisma:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';

// ─── UUIDs fijos compartidos entre seeders ────────────────────────────────────

// Usuarios (definidos en credentials/seed.ts)
const ADMIN_USER_ID  = '11111111-1111-1111-1111-111111111111';
const MARIA_USER_ID  = '22222222-2222-2222-2222-222222222221';
const CARLOS_USER_ID = '33333333-3333-3333-3333-333333333331';

// Proyecto
export const PROJECT_ID   = 'bbbb1111-1111-1111-1111-111111111111';
export const WORKSPACE_ID = 'cccc1111-1111-1111-1111-111111111111';
export const BOARD_ID     = 'dddd1111-1111-1111-1111-111111111111';

// Columnas (compartidas con tasks/seed.ts)
export const COLUMN_TODO_ID     = 'eeee1111-1111-1111-1111-111111111111';
export const COLUMN_PROGRESS_ID = 'eeee2222-2222-2222-2222-222222222222';
export const COLUMN_REVIEW_ID   = 'eeee3333-3333-3333-3333-333333333333';
export const COLUMN_DONE_ID     = 'eeee4444-4444-4444-4444-444444444444';

// Roles del proyecto
export const PROJECT_ROLE_ADMIN_ID  = 'ffff1111-1111-1111-1111-111111111111';
export const PROJECT_ROLE_MEMBER_ID = 'ffff2222-2222-2222-2222-222222222222';

// ─── Permisos de roles ────────────────────────────────────────────────────────

/** Administrador del proyecto: acceso completo */
const ADMIN_PERMISSIONS: Record<string, boolean> = {
  canViewProject:   true,
  canCreateBoard:   true,
  canEditBoard:     true,
  canDeleteBoard:   true,
  canCreateColumn:  true,
  canEditColumn:    true,
  canDeleteColumn:  true,
  canCreateTask:    true,
  canMoveTask:      true,
  canEditTask:      true,
  canDeleteTask:    true,
  canManageMembers: true,
  canManageRoles:   true,
  canComment:       true,
  canManageLabels:  true,
  canEditProject:   true,
  canViewReports:   true,
  canDeleteProject: true,
};

/** Miembro: puede ver, crear y mover tareas, comentar */
const MEMBER_PERMISSIONS: Record<string, boolean> = {
  canViewProject:   true,
  canCreateBoard:   false,
  canEditBoard:     false,
  canDeleteBoard:   false,
  canCreateColumn:  false,
  canEditColumn:    false,
  canDeleteColumn:  false,
  canCreateTask:    true,
  canMoveTask:      true,
  canEditTask:      true,
  canDeleteTask:    false,
  canManageMembers: false,
  canManageRoles:   false,
  canComment:       true,
  canManageLabels:  false,
  canEditProject:   false,
  canViewReports:   false,
  canDeleteProject: false,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('🌱  Iniciando seed de projects…\n');

  try {
    // 1. Proyecto
    const project = await prisma.project.upsert({
      where:  { ownerId_name: { ownerId: ADMIN_USER_ID, name: 'Proyecto PRAXIS Demo' } },
      update: { description: 'Proyecto de demostración para pruebas y desarrollo.' },
      create: {
        id:          PROJECT_ID,
        name:        'Proyecto PRAXIS Demo',
        description: 'Proyecto de demostración para pruebas y desarrollo.',
        ownerId:     ADMIN_USER_ID,
      },
    });
    console.log(`  ✅  Proyecto: "${project.name}"  →  ${project.id}`);

    // 2. Roles del proyecto
    const adminRole = await prisma.projectRole.upsert({
      where:  { projectId_name: { projectId: project.id, name: 'Administrador' } },
      update: { permissions: ADMIN_PERMISSIONS },
      create: {
        id:          PROJECT_ROLE_ADMIN_ID,
        name:        'Administrador',
        projectId:   project.id,
        permissions: ADMIN_PERMISSIONS,
      },
    });
    console.log(`  ✅  ProjectRole "Administrador"  →  ${adminRole.id}`);

    const memberRole = await prisma.projectRole.upsert({
      where:  { projectId_name: { projectId: project.id, name: 'Miembro' } },
      update: { permissions: MEMBER_PERMISSIONS },
      create: {
        id:          PROJECT_ROLE_MEMBER_ID,
        name:        'Miembro',
        projectId:   project.id,
        permissions: MEMBER_PERMISSIONS,
      },
    });
    console.log(`  ✅  ProjectRole "Miembro"        →  ${memberRole.id}`);

    // 3. Miembros del proyecto
    const memberships = [
      { userId: ADMIN_USER_ID,  roleId: adminRole.id,  label: 'admin'  },
      { userId: MARIA_USER_ID,  roleId: memberRole.id, label: 'maría'  },
      { userId: CARLOS_USER_ID, roleId: memberRole.id, label: 'carlos' },
    ];

    console.log('\n  👥  Asignando miembros…');
    for (const m of memberships) {
      await prisma.projectMember.upsert({
        where:  { projectId_userId: { projectId: project.id, userId: m.userId } },
        update: { projectRoleId: m.roleId },
        create: {
          projectId:     project.id,
          userId:        m.userId,
          projectRoleId: m.roleId,
        },
      });
      console.log(`  ✅  ${m.label}  →  rol: ${m.roleId}`);
    }

    // 4. Workspace
    const workspace = await prisma.workspace.upsert({
      where:  { projectId_name: { projectId: project.id, name: 'Sprint 1' } },
      update: {},
      create: {
        id:        WORKSPACE_ID,
        name:      'Sprint 1',
        projectId: project.id,
      },
    });
    console.log(`\n  ✅  Workspace: "${workspace.name}"  →  ${workspace.id}`);

    // 5. Board
    const board = await prisma.board.upsert({
      where:  { id: BOARD_ID },
      update: {},
      create: {
        id:          BOARD_ID,
        name:        'Tablero principal',
        workspaceId: workspace.id,
      },
    });
    console.log(`  ✅  Board: "${board.name}"  →  ${board.id}`);

    // 6. Columnas
    const columns = [
      { id: COLUMN_TODO_ID,     name: 'Por hacer',   order: 0, color: 'primary' },
      { id: COLUMN_PROGRESS_ID, name: 'En progreso', order: 1, color: 'accent'  },
      { id: COLUMN_REVIEW_ID,   name: 'En revisión', order: 2, color: 'info'    },
      { id: COLUMN_DONE_ID,     name: 'Completado',  order: 3, color: 'success' },
    ];

    console.log('\n  📋  Creando columnas del board…');
    for (const col of columns) {
      await prisma.boardColumn.upsert({
        where:  { id: col.id },
        update: { name: col.name, order: col.order, color: col.color },
        create: {
          id:      col.id,
          name:    col.name,
          order:   col.order,
          color:   col.color,
          boardId: board.id,
        },
      });
      console.log(`  ✅  Columna "${col.name}"  (order=${col.order}, color=${col.color})`);
    }

    console.log('\n✅  Seed de projects completado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌  Seed falló:', err);
  process.exit(1);
});
