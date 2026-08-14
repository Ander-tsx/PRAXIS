import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ChannelsService } from './channels.service';
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
  ) {}

  /* ─── Chat de proyecto ────────────────────────────────────────────── */

  @MessagePattern({ cmd: 'chat_project_find_all' })
  async proyectoMensajes(@Payload() dto: DeProyecto & { limit?: number; before?: string }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.findAll({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_project_send' })
  async proyectoEnviar(@Payload() dto: DeProyecto & { body: string; replyToId?: string | null }) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.send({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_project_mark_read' })
  async proyectoLeido(@Payload() dto: DeProyecto) {
    const canal = await this.channels.deProyecto(dto.projectId);
    return this.chat.markRead({ ...dto, channelId: canal.id });
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

  /* ─── Chat privado ────────────────────────────────────────────────── */

  /**
   * ⚠️ Todos pasan por `channels.directo`, que **comprueba que compartís algún
   * proyecto** antes de crear o devolver nada. Sin eso, el chat privado sería
   * mensajería abierta a toda la plataforma: cualquiera con un `userId` podría
   * escribir a cualquiera.
   */
  @MessagePattern({ cmd: 'chat_direct_find_all' })
  async directoMensajes(@Payload() dto: Directo & { limit?: number; before?: string }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId);
    return this.chat.findAll({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_direct_send' })
  async directoEnviar(@Payload() dto: Directo & { body: string; replyToId?: string | null }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId);
    return this.chat.send({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_direct_mark_read' })
  async directoLeido(@Payload() dto: Directo) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId);
    return this.chat.markRead({ ...dto, channelId: canal.id });
  }

  @MessagePattern({ cmd: 'chat_direct_mute' })
  async directoSilenciar(@Payload() dto: Directo & { muted: boolean }) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId);
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
    const canal = await this.channels.directo(dto.requesterId, dto.peerId);
    return this.chat.delete({ ...dto, channelId: canal.id, canModerate: false });
  }

  @MessagePattern({ cmd: 'chat_direct_react' })
  async directoReaccionar(
    @Payload() dto: Directo & { messageId: string; emoji: string; on: boolean },
  ) {
    const canal = await this.channels.directo(dto.requesterId, dto.peerId);
    return this.chat.react({ ...dto, channelId: canal.id });
  }

  /* ─── Bandeja del chat privado ────────────────────────────────────── */

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
}
