-- Cuatro planes en una sola escalera: FREE, TEAM, BUSINESS y ENTERPRISE.
--
-- 🔴 Esto empezó siendo una edición en su sitio de la migración inicial, y
-- estaba mal. Una migración ya aplicada no se vuelve a ejecutar: la base de
-- quien ya tenía el esquema se quedaba con 'PLUS' y 'PRO' vivos y **sin
-- 'ENTERPRISE'**, mientras el código creía lo contrario. El síntoma habría
-- salido en runtime, la primera vez que alguien eligiera Empresa, con un error
-- de tipo de Postgres lejos de la causa. Editar en su sitio solo vale cuando
-- todo el mundo parte de cero, y aquí no era el caso.
--
-- Postgres no sabe quitar valores de un enum con un ALTER TYPE, así que el tipo
-- se recrea. Y ALTER TYPE ... ADD VALUE no sirve: no se puede usar el valor
-- nuevo en la misma transacción en la que se añade, y Prisma envuelve cada
-- migración en una.

-- Las suscripciones que apuntaban a un plan que desaparece caen a FREE.
--
-- ⚠️ **Hacia abajo, nunca hacia arriba.** Mapearlas a TEAM habría regalado un
-- plan de pago a quien no lo contrató, que es justo lo que la invariante de
-- «fallo de billing = FREE» existe para impedir. Lo desplegado eran cuentas de
-- prueba, así que no hay a quién conservarle nada.
UPDATE "billing"."subscriptions"
   SET "tier" = 'FREE'
 WHERE "tier" IN ('PLUS', 'PRO');

ALTER TYPE "billing"."PlanTier" RENAME TO "PlanTier_viejo";
CREATE TYPE "billing"."PlanTier" AS ENUM ('FREE', 'TEAM', 'BUSINESS', 'ENTERPRISE');

ALTER TABLE "billing"."subscriptions"
    ALTER COLUMN "tier" DROP DEFAULT,
    ALTER COLUMN "tier" TYPE "billing"."PlanTier"
        USING ("tier"::text::"billing"."PlanTier"),
    ALTER COLUMN "tier" SET DEFAULT 'FREE';

DROP TYPE "billing"."PlanTier_viejo";
