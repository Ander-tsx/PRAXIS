-- El plan Pro, entre Gratis y Equipo.
--
-- Da menos inventario que Equipo (5 proyectos frente a 25) y más IA por persona
-- (150 frente a 100): compra intensidad, no tamaño. El catálogo con los números
-- y el porqué está en `commons/contracts/src/billing/plans.ts`; aquí solo vive
-- el identificador.
--
-- ⚠️ **No es `ALTER TYPE ... ADD VALUE`, y no por gusto.** Postgres no deja usar
-- un valor de enum recién añadido en la misma transacción en la que se añade, y
-- Prisma envuelve cada migración en una. Así que el tipo se recrea, igual que
-- hizo `20260826240000_cuatro_planes` — cuya cabecera explica además por qué
-- editar en su sitio la migración inicial estaba mal.
--
-- ⚠️ **Ninguna fila cambia de plan.** A diferencia de aquella migración, esta
-- solo añade un valor: no desaparece ningún tier, así que no hay a quién bajar
-- a FREE. El `USING` es una conversión por texto y todos los valores existentes
-- siguen existiendo en el tipo nuevo.
--
-- ⚠️ **Y no tiene nada que ver con el `PRO` viejo del asistente**, que vivía en
-- `assistant.assistant_subscriptions` —otro esquema, otro servicio— y se retiró
-- en este mismo commit. Aquel era un plan por persona; este es de la
-- organización, como el resto de la escalera.

ALTER TYPE "billing"."PlanTier" RENAME TO "PlanTier_sin_pro";

CREATE TYPE "billing"."PlanTier" AS ENUM ('FREE', 'PRO', 'TEAM', 'BUSINESS', 'ENTERPRISE');

ALTER TABLE "billing"."subscriptions"
    ALTER COLUMN "tier" DROP DEFAULT,
    ALTER COLUMN "tier" TYPE "billing"."PlanTier"
        USING ("tier"::text::"billing"."PlanTier"),
    ALTER COLUMN "tier" SET DEFAULT 'FREE';

DROP TYPE "billing"."PlanTier_sin_pro";
