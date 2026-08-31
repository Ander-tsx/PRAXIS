-- Un proyecto pertenece a una organización.
--
-- 🔴 Es la pieza que convierte PRAXIS en un producto de equipos: antes el
-- proyecto colgaba de una persona y la organización solo repartía topes más
-- altos, así que cuando alguien se iba de la empresa su trabajo se iba con él.
--
-- ⚠️ NOT NULL desde el primer día y sin fase nullable. Se puede porque la base
-- se reinicia: lo que habría sido un script de relleno de un solo uso está en
-- las semillas, donde se lee y se mantiene. Si algún día hubiera datos que
-- conservar, esto serían tres migraciones (columna, relleno, restricción) y no
-- una.
--
-- ⚠️ Sin clave foránea: las organizaciones viven en el esquema de
-- billing-service, bajo otro dueño. Es la regla que ya siguen ownerId,
-- assigneeId y task_events.
--
-- El DEFAULT existe solo para que la restricción se pueda aplicar sobre las
-- filas que hubiera, y se quita acto seguido: dejarlo puesto haría que un
-- proyecto creado sin organización acabara silenciosamente en una que no
-- existe, que es exactamente el fallo que esta columna viene a impedir.
ALTER TABLE "projects"."projects"
    ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';

ALTER TABLE "projects"."projects" ALTER COLUMN "organizationId" DROP DEFAULT;

CREATE INDEX "projects_organizationId_idx" ON "projects"."projects"("organizationId");
