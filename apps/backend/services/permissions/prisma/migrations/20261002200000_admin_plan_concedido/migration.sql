-- Conceder y retirar un plan a una organización desde administración
-- (sin Stripe). Solo se añaden valores: ninguna fila cambia.
ALTER TYPE "permissions"."AdminActionType" ADD VALUE 'ORGANIZATION_PLAN_GRANTED';
ALTER TYPE "permissions"."AdminActionType" ADD VALUE 'ORGANIZATION_PLAN_REVOKED';
ALTER TYPE "permissions"."AdminTargetType" ADD VALUE 'ORGANIZATION';
