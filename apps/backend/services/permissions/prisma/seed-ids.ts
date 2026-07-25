/**
 * Deterministic UUIDs for seed data.
 *
 * These fixed IDs allow each microservice's seed to reference entities
 * from other services without querying their schemas directly.
 * All seeds use these same values so the data is consistent across services.
 */
export const SEED_IDS = {
  // ── Permissions ─────────────────────────────────────────────────────
  ADMIN_ROLE_ID:       '00000000-0000-4000-a000-000000000010',
  USER_ROLE_ID:        '00000000-0000-4000-a000-000000000011',
  ADMIN_USER_ROLE_ID:  '00000000-0000-4000-a000-000000000020',

  // ── Credentials ─────────────────────────────────────────────────────
  ADMIN_CREDENTIAL_ID: '00000000-0000-4000-a000-000000000002',
  ADMIN_USER_ID:       '00000000-0000-4000-a000-000000000001',

  // ── Projects ────────────────────────────────────────────────────────
  DEMO_PROJECT_ID:     '00000000-0000-4000-a000-000000000100',
  MANAGER_ROLE_ID:     '00000000-0000-4000-a000-000000000110',
  DEVELOPER_ROLE_ID:   '00000000-0000-4000-a000-000000000111',
  WORKSPACE_ID:        '00000000-0000-4000-a000-000000000200',
  BOARD_ID:            '00000000-0000-4000-a000-000000000300',
  COL_BACKLOG_ID:      '00000000-0000-4000-a000-000000000310',
  COL_PROGRESS_ID:     '00000000-0000-4000-a000-000000000311',
  COL_REVIEW_ID:       '00000000-0000-4000-a000-000000000312',
  COL_DONE_ID:         '00000000-0000-4000-a000-000000000313',
  MEMBER_ADMIN_ID:     '00000000-0000-4000-a000-000000000400',

  // ── Tasks ───────────────────────────────────────────────────────────
  TASK_1_ID:           '00000000-0000-4000-a000-000000000500',
  TASK_2_ID:           '00000000-0000-4000-a000-000000000501',
  TASK_3_ID:           '00000000-0000-4000-a000-000000000502',
  CHECKLIST_1_ID:      '00000000-0000-4000-a000-000000000600',
  CHECKLIST_2_ID:      '00000000-0000-4000-a000-000000000601',
} as const;
