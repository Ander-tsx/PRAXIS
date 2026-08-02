-- Este script solo se ejecuta la primera vez que se inicializa el volumen.
--
-- Los schemas de los microservicios (credentials, permissions, projects,
-- tasks) los crea Prisma al aplicar las migraciones, gracias a la propiedad
-- `schemas` del datasource. No hace falta declararlos aquí.

CREATE SCHEMA IF NOT EXISTS alexa;
