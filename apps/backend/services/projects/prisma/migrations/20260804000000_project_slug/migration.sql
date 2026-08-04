-- El proyecto gana un `slug`: el identificador legible que sale en la URL.
--
-- `/projects/rediseno-del-panel` en vez de
-- `/projects/a7382229-7142-409f-8257-cb2304626152`.
--
-- Es único GLOBAL, al contrario que `name`, que lo es por dueño. La razón es
-- que quien resuelve una URL es una persona que puede ver proyectos de varios
-- dueños —dos "Sprint 1" de equipos distintos en los que está—, así que el
-- nombre por sí solo no desambigua. Los choques llevan sufijo: `sprint-1-2`.
--
-- Esto NO devuelve el conflicto que quitó `20260730020000`: aquello era malo
-- porque el usuario escribía un nombre y recibía un error sobre una fila que no
-- podía ver. El slug no lo escribe nadie, se deriva, y el choque se resuelve
-- solo.

-- 1. La columna, de momento opcional para poder rellenarla.
ALTER TABLE "projects"."projects" ADD COLUMN "slug" TEXT;

-- 2. Backfill.
--
-- La expresión replica lo que hace `slugificar()` en TypeScript: quitar
-- acentos, minúsculas, todo lo que no sea alfanumérico a guion, sin guiones
-- colgando y recortado a 60. `translate` cubre los diacríticos del español y
-- algún francés suelto; en el backfill no hace falta más, y de aquí en adelante
-- los genera el servicio.
--
-- El `row_number()` reparte los sufijos igual que `generarSlugUnico`: el más
-- antiguo se queda el slug limpio y los siguientes reciben -2, -3…
UPDATE "projects"."projects" AS p
SET "slug" = s.slug
FROM (
  SELECT
    id,
    CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS slug
  FROM (
    SELECT
      id,
      base,
      row_number() OVER (PARTITION BY base ORDER BY "createdAt", id) AS rn
    FROM (
      SELECT
        id,
        "createdAt",
        COALESCE(
          NULLIF(
            trim(BOTH '-' FROM
              left(
                regexp_replace(
                  lower(translate(
                    name,
                    'áéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûçÀÈÌÒÙÂÊÎÔÛÇ',
                    'aeiounAEIOUNaeiouaeioucAEIOUAEIOUC'
                  )),
                  '[^a-z0-9]+', '-', 'g'
                ),
                60
              )
            ),
            ''
          ),
          'proyecto'
        ) AS base
      FROM "projects"."projects"
    ) AS normalizados
  ) AS numerados
) AS s
WHERE p.id = s.id;

-- 3. Ya se puede exigir. El índice único es quien manda de verdad: la
--    comprobación previa del servicio solo evita el reintento en el caso normal,
--    entre ella y el INSERT cabe otra petición.
ALTER TABLE "projects"."projects" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"."projects"("slug");
