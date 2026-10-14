import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateChatAttachmentDto,
  DeleteChatAttachmentDto,
  GetChatAttachmentContentDto,
} from '@praxis/contracts';
import type { ChatMessageOrigin } from '../generated/prisma-client';
import { ChannelsService } from './channels.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatService } from './chat.service';

/** Lo que trae toda operación sobre el chat de un proyecto. */
interface DeProyecto {
  projectId: string;
  requesterId: string;
}

/** Lo que trae toda operación sobre una conversación privada. */
interface Directo {
  /** Con quién hablas. */
  peerId: string;
  requesterId: string;
  isAdmin?: boolean;
}

/**
 * El chat, por TCP.
 *
 * ## Por qué dos familias de comandos y no una con `channelId`
 *
 * El gateway no conoce canales: conoce proyectos y personas. Si tuviera que
 * resolver el canal antes de cada operación serían **dos viajes de red por
 * petición** —uno para saber el canal y otro para actuar—, y además obligaría a
 * exponer un `chat_channel_resolve` que cualquiera con acceso al 3003 podría
 * usar para descubrir canales. Aquí la resolución va incluida.
 *
 * ⚠️ **`requesterId` sale siempre del token en el gateway, nunca del cuerpo.**
 * Este servicio no distingue quién le habla por TCP, y por eso el 3003 no sale
 * de la red privada.
 */
@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly channels: ChannelsService,
    private readonly attachments: ChatAttachmentsService,
  ) {}

  /* ─── Chat de proyecto ────────────────────────────────────────────── */

  @MessagePattern({ cmd: 'chat_project_find_all' })
  async proyectoMensajes(
    @Payload() dto: DeProyecto & {
      limit?: number;
      before?: string;
      after?: string;
      pinned?: boolean;
      q?: string;
    },
  ) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.findAll({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_project_send' })
  async proyectoEnviar(
    @Payload() dto: DeProyecto & {
      body: string;
      replyToId?: string | null;
      attachmentIds?: string[];
      enHilo?: boolean;
      /* Solo por TCP (D13): automation-service y el gateway cuando habla PRAX. */
      origin?: ChatMessageOrigin;
      originMeta?: Record<string, unknown> | null;
      authorName?: string | null;
    },
  ) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.send({ ...dto, channelId: canal.id });
  }

  /** El hilo de un mensaje del chat de proyecto: el raíz y sus respuestas. */
  @MessagePattern({ cmd: 'chat_project_thread' })
  async proyectoHilo(@Payload() dto: DeProyecto & { messageId: string }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.thread({ ...dto, channelId: canal.id });
  }

  /**
   * Sube un adjunto al chat de un proyecto y lo deja en borrador.
   *
   * El permiso lo aplica el gateway (canComment) antes de llegar aquí; este
   * handler solo resuelve el canal y guarda. El `projectId` sale de la ruta,
   * nunca del cuerpo.
   */
  @MessagePattern({ cmd: 'chat_project_attachment_create' })
  async proyectoAdjuntar(@Payload() dto: CreateChatAttachmentDto) {
    return this.attachments.create(dto);
  }

  @MessagePattern({ cmd: 'chat_project_attachment_get_content' })
  async proyectoContenido(@Payload() dto: GetChatAttachmentContentDto) {
    return this.attachments.getContent(dto);
  }

  /** Borra un adjunto propio, o cualquiera si `canModerate`. */
  @MessagePattern({ cmd: 'chat_project_attachment_delete' })
  async proyectoQuitarAdjunto(@Payload() dto: DeleteChatAttachmentDto) {
    return this.attachments.delete(dto);
  }

  @MessagePattern({ cmd: 'chat_project_mark_read' })
  async proyectoLeido(@Payload() dto: DeProyecto) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.markRead({ ...dto, channelId: canal.id });
  }

  /** Quién ha leído hasta dónde. Para las burbujas de «visto». */
  @MessagePattern({ cmd: 'chat_project_receipts' })
  async proyectoAcuses(@Payload() dto: DeProyecto) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.receipts({ channelId: canal.id, requesterId: dto.requesterId });
  }

  @MessagePattern({ cmd: 'chat_project_mute' })
  async proyectoSilenciar(@Payload() dto: DeProyecto & { muted: boolean }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.setMuted({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_project_delete' })
  async proyectoBorrar(@Payload() dto: DeProyecto & { id: string; canModerate: boolean }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.delete({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_project_react' })
  async proyectoReaccionar(
    @Payload() dto: DeProyecto & { messageId: string; emoji: string; on: boolean },
  ) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.react({ ...dto, channelId: canal.id });
  }

  /** Fija o desfija un mensaje del chat del proyecto. */
  @MessagePattern({ cmd: 'chat_project_pin' })
  async proyectoFijar(@Payload() dto: DeProyecto & { messageId: string; on: boolean }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.pin({ ...dto, channelId: canal.id });
  }

  /** Edita el texto de un mensaje propio del chat del proyecto. */
  @MessagePattern({ cmd: 'chat_project_edit' })
  async proyectoEditar(@Payload() dto: DeProyecto & { id: string; body: string }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.edit({ ...dto, channelId: canal.id });
  }

  /* ─── Chat privado ────────────────────────────────────────────────── */

  /**
   * ⚠️ Todos pasan por `channels.directo`, que **comprueba que compartís algún
   * proyecto** antes de crear o devolver nada. Sin eso, el chat privado sería
   * mensajería abierta a toda la plataforma: cualquiera con un `userId` podría
   * escribir a cualquiera.
   */
  @MessagePattern({ cmd: 'chat_direct_find_all' })
  async directoMensajes(
    @Payload() dto: Directo & {
      limit?: number;
      before?: string;
      after?: string;
      pinned?: boolean;
      q?: string;
    },
  ) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.findAll({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_direct_send' })
  async directoEnviar(
    @Payload()
    dto: Directo & {
      body: string;
      replyToId?: string | null;
      attachmentIds?: string[];
      enHilo?: boolean;
      origin?: ChatMessageOrigin;
      originMeta?: Record<string, unknown> | null;
      authorName?: string | null;
    },
  ) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.send({ ...dto, channelId: canal.id });
  }

  /** El hilo de un mensaje de una conversación privada. */
  @MessagePattern({ cmd: 'chat_direct_thread' })
  async directoHilo(@Payload() dto: Directo & { messageId: string }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.thread({ ...dto, channelId: canal.id });
  }

  /**
   * Sube un adjunto a una conversación privada.
   *
   * ⚠️ Pasa por `channels.directo`, que comprueba que compartís algún proyecto
   * antes de crear o devolver nada. Sin eso, adjuntar sería mensajería abierta.
   */
  @MessagePattern({ cmd: 'chat_direct_attachment_create' })
  async directoAdjuntar(@Payload() dto: CreateChatAttachmentDto) {
    return this.attachments.create(dto);
  }

  @MessagePattern({ cmd: 'chat_direct_attachment_get_content' })
  async directoContenido(@Payload() dto: GetChatAttachmentContentDto) {
    return this.attachments.getContent(dto);
  }

  /** En privado no hay moderación: cada cual borra lo suyo. */
  @MessagePattern({ cmd: 'chat_direct_attachment_delete' })
  async directoQuitarAdjunto(@Payload() dto: DeleteChatAttachmentDto) {
    return this.attachments.delete({ ...dto, canModerate: false });
  }

  @MessagePattern({ cmd: 'chat_direct_mark_read' })
  async directoLeido(@Payload() dto: Directo) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.markRead({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_direct_receipts' })
  async directoAcuses(@Payload() dto: Directo) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.receipts({ channelId: canal.id, requesterId: dto.requesterId });
  }

  @MessagePattern({ cmd: 'chat_direct_mute' })
  async directoSilenciar(@Payload() dto: Directo & { muted: boolean }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.setMuted({ ...dto, channelId: canal.id });
  }

  /**
   * En privado **no hay moderación**: cada cual borra lo suyo.
   *
   * No existe un rol por encima de una conversación de dos, así que
   * `canModerate` va en `false` fijo y no como parámetro — dejarlo entrar por el
   * payload sería una forma de borrar mensajes ajenos mandando un `true`.
   */
  @MessagePattern({ cmd: 'chat_direct_delete' })
  async directoBorrar(@Payload() dto: Directo & { id: string }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.delete({ ...dto, channelId: canal.id, canModerate: false });
  }

  @MessagePattern({ cmd: 'chat_direct_react' })
  async directoReaccionar(
    @Payload() dto: Directo & { messageId: string; emoji: string; on: boolean },
  ) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.react({ ...dto, channelId: canal.id });
  }

  /** Fija o desfija un mensaje de una conversación privada. */
  @MessagePattern({ cmd: 'chat_direct_pin' })
  async directoFijar(@Payload() dto: Directo & { messageId: string; on: boolean }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.pin({ ...dto, channelId: canal.id });
  }

  /** Edita el texto de un mensaje propio de una conversación privada. */
  @MessagePattern({ cmd: 'chat_direct_edit' })
  async directoEditar(@Payload() dto: Directo & { id: string; body: string }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.edit({ ...dto, channelId: canal.id });
  }

  /* ─── Bandeja del chat privado ────────────────────────────────────── */

  @MessagePattern({ cmd: 'chat_direct_hide_conversation' })
  async directoOcultar(@Payload() dto: Directo) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId, dto.isAdmin);
    return this.chat.hideConversation(canal.id, dto.requesterId);
  }

  @MessagePattern({ cmd: 'chat_my_conversations' })
  misConversaciones(@Payload() dto: { userId: string }) {
    return this.chat.misConversaciones(dto.userId);
  }

  /** Los chats de proyecto de esta persona, para el centro de mensajes. */
  @MessagePattern({ cmd: 'chat_my_project_channels' })
  misChatsDeProyecto(@Payload() dto: { userId: string }) {
    return this.chat.misChatsDeProyecto(dto.userId);
  }

  /**
   * Qué se puede mencionar y referenciar desde un canal.
   *
   * Resuelve el canal igual que el resto —desde `projectId` o desde `peerId`—,
   * así que **hereda la misma comprobación de acceso**: no hay forma de pedir el
   * catálogo de un canal en el que no estás.
   */
  @MessagePattern({ cmd: 'chat_mentionables' })
  async mencionables(@Payload() dto: { requesterId: string; projectId?: string; peerId?: string }) {
    const canal = dto.projectId
      ? await this.channels.deProyecto(dto.projectId)
      : await this.channels.directo(dto.requesterId, dto.peerId as string);

    return this.channels.mencionables(canal.id, dto.requesterId);
  }

  /** A quién puedo escribir: quien comparta proyecto conmigo, con sus roles. */
  @MessagePattern({ cmd: 'chat_contacts' })
  contactos(@Payload() dto: { userId: string }) {
    return this.channels.contactos(dto.userId);
  }

  /**
   * Los mismos, pero solo los ids.
   *
   * Para el anuncio de presencia del gateway, que con la respuesta completa de
   * `chat_contacts` solo usaba la columna `userId`. Ver `idsDeContactos`.
   */
  @MessagePattern({ cmd: 'chat_peer_ids' })
  idsDeContactos(@Payload() dto: { userId: string }) {
    return this.channels.idsDeContactos(dto.userId);
  }
}
