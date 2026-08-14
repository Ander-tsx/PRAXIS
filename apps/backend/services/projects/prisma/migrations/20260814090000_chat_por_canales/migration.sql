-- Chat: canales de proyecto y conversaciones privadas, sobre un modelo común.
--
-- Un solo modelo para los dos porque responder, reaccionar, mencionar, silenciar
-- y contar lo no leído tienen que funcionar igual en ambos. Con dos estructuras
-- paralelas serían cinco cosas duplicadas que divergen a la primera corrección
-- que se aplique solo en una.
--
-- ⚠️ Quién participa se responde distinto según el tipo, y es a propósito:
--
--   PROJECT — los miembros del proyecto, y eso vive en `project_members`. NO se
--             copia aquí: duplicarlo obligaría a sincronizar cada alta y cada
--             baja, y un fallo de sincronización es alguien que sigue leyendo un
--             chat del que le echaron.
--   DIRECT  — exactamente las dos personas de `directUserA` y `directUserB`. Es
--             estructural: no hay tabla que consultar ni que mantener.
--
-- Por eso `chat_channel_states` NO dice quién participa: solo guarda el estado
-- de cada cual. Tratarla como control de acceso daría entrada a cualquiera que
-- haya abierto el chat una vez.
--
-- Todo es aditivo: no toca ninguna tabla existente.

-- CreateEnum
CREATE TYPE "projects"."ChatChannelKind" AS ENUM ('PROJECT', 'DIRECT');

-- CreateTable
CREATE TABLE "projects"."chat_channels" (
    "id" TEXT NOT NULL,
    "kind" "projects"."ChatChannelKind" NOT NULL,
    -- Solo en PROJECT. Único: un proyecto tiene un chat, y solo uno.
    "projectId" TEXT,
    -- Los dos participantes de un DIRECT, SIEMPRE ordenados (A < B).
    --
    -- ⚠️ El orden no es cosmético: es lo que hace que el par sea único. Sin
    -- ordenarlos, que Ana escriba a Juan y Juan escriba a Ana crearía dos
    -- conversaciones distintas y cada uno vería la mitad de lo hablado.
    "directUserA" TEXT,
    "directUserB" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Hasta dónde leyó cada cual y si lo silenció. Lo no leído es un INSTANTE, no
-- una marca por mensaje: mil mensajes por seis personas serían seis mil filas
-- para pintar un número.
CREATE TABLE "projects"."chat_channel_states" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- NULL = nunca lo ha abierto = todo está sin leer.
    "lastReadAt" TIMESTAMP(3),
    -- NULL = suena. Guarda el cuándo y no solo el si, como `notifications.readAt`.
    "mutedAt" TIMESTAMP(3),

    CONSTRAINT "chat_channel_states_pkey" PRIMARY KEY ("channelId","userId")
);

-- CreateTable
-- `authorId` sin clave foránea: el usuario vive en credentials-service, en otro
-- esquema. Misma regla que `project_members.userId`.
--
-- Las menciones y las referencias viven DENTRO de `body`, con el nombre incluido:
--     @[Juan Pérez](user:2222…)      /[Sprint 1](board:88ab…)
-- Es lo que hace que no se rompan: si sacan a Juan o borran el tablero, el
-- nombre ya está escrito y se pinta como texto plano, sin consultar nada.
CREATE TABLE "projects"."chat_messages" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- La clave primaria es el trío: la misma persona puede poner varias reacciones
-- distintas al mismo mensaje, pero la misma dos veces no. Eso hace que reaccionar
-- sea idempotente y que quitarla sea un borrado exacto.
CREATE TABLE "projects"."chat_reactions" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reactions_pkey" PRIMARY KEY ("messageId","userId","emoji")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_channels_projectId_key" ON "projects"."chat_channels"("projectId");

-- CreateIndex
-- La bandeja de conversaciones de alguien: las suyas, por los dos lados.
CREATE INDEX "chat_channels_directUserA_idx" ON "projects"."chat_channels"("directUserA");
CREATE INDEX "chat_channels_directUserB_idx" ON "projects"."chat_channels"("directUserB");

-- CreateIndex
-- El par, único. Con los ids ordenados al escribir, esto impide que existan dos
-- conversaciones para las mismas dos personas.
CREATE UNIQUE INDEX "chat_channels_directUserA_directUserB_key"
  ON "projects"."chat_channels"("directUserA", "directUserB");

-- CreateIndex
CREATE INDEX "chat_channel_states_userId_idx" ON "projects"."chat_channel_states"("userId");

-- CreateIndex
-- El único acceso que existe: los últimos mensajes de un canal, y los anteriores
-- a uno dado al subir por el historial. Las dos son este índice leído al revés.
CREATE INDEX "chat_messages_channelId_createdAt_idx"
  ON "projects"."chat_messages"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_replyToId_idx" ON "projects"."chat_messages"("replyToId");

-- CreateIndex
CREATE INDEX "chat_reactions_messageId_idx" ON "projects"."chat_reactions"("messageId");

-- AddForeignKey
ALTER TABLE "projects"."chat_channels"
  ADD CONSTRAINT "chat_channels_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"."projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects"."chat_channel_states"
  ADD CONSTRAINT "chat_channel_states_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "projects"."chat_channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects"."chat_messages"
  ADD CONSTRAINT "chat_messages_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "projects"."chat_channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- ⚠️ SET NULL y no CASCADE: borrar un mensaje no puede llevarse por delante las
-- respuestas que provocó, que son de otras personas y siguen teniendo sentido.
-- La respuesta se queda sin cita, no desaparece.
ALTER TABLE "projects"."chat_messages"
  ADD CONSTRAINT "chat_messages_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "projects"."chat_messages"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects"."chat_reactions"
  ADD CONSTRAINT "chat_reactions_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "projects"."chat_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
