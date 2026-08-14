import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  FindChatMessagesQueryDto,
  MuteChatBodyDto,
  ReactChatBodyDto,
  SendChatMessageBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { MentionablesService } from './mentionables.service';

/**
 * Conversaciones privadas entre dos personas.
 *
 * ## Por qué cuelga de `/me` y no lleva `ProjectPermissionGuard`
 *
 * Una conversación privada **no pertenece a ningún proyecto**, así que no hay
 * proyecto en la ruta contra el que el guard pueda comprobar nada. Es el mismo
 * caso que `/me/notifications` y `/me/invitations`.
 *
 * ⚠️ **La autorización la hace projects-service, y es una sola regla: solo
 * puedes escribir a quien comparta algún proyecto contigo.** Se comprueba en
 * `ChannelsService.directo()`, que es el único camino por el que se resuelve un
 * canal privado — no hay forma de saltárselo desde aquí. Sin esa regla, esto
 * sería mensajería abierta a toda la plataforma: cualquiera con un `userId`
 * podría escribir a cualquiera.
 *
 * El `requesterId` sale **siempre del token**. La ruta solo lleva con quién
 * hablas, nunca quién eres.
 */
@ApiTags('Direct Chat')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/chats')
export class DirectChatController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly mentionables: MentionablesService,
  ) {}

  /** Mis conversaciones, con el último mensaje y lo que llevo sin leer. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis conversaciones privadas' })
  @ApiResponse({ status: 200, description: 'Lista con último mensaje, no leídos y silenciado' })
  conversaciones(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'chat_my_conversations' }, { userId: req.user!.userId }),
    );
  }

  /**
   * A quién puedo escribir.
   *
   * Devuelve, por cada persona, **en qué proyectos coincidimos y con qué rol
   * está allí**. Es lo que convierte una lista de nombres en algo que se
   * entiende: «Juan, Administrador en Rediseño» dice mucho más que «Juan».
   *
   * Va antes que `:peerId` en el archivo **y en la clase**: Nest resuelve por
   * orden de declaración, y con la ruta dinámica delante, `/contacts` entraría
   * por ella y `ParseUUIDPipe` respondería 400.
   */
  @Get('contacts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quién comparte proyecto conmigo, con sus roles' })
  @ApiResponse({ status: 200, description: 'Contactos con sus proyectos en común' })
  contactos(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'chat_contacts' }, { userId: req.user!.userId }),
    );
  }

  /**
   * Mis chats de proyecto, para el centro de mensajes.
   *
   * Vive bajo `/me/chats` y no bajo `/projects` porque la pregunta es «los
   * míos», que cruza todos los proyectos: no hay uno en la ruta contra el que
   * `ProjectPermissionGuard` pueda comprobar nada. Es el mismo caso que
   * `/me/tasks` y `/me/invitations`.
   */
  @Get('projects')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis chats de proyecto, con último mensaje y no leídos' })
  @ApiResponse({ status: 200, description: 'Lista de chats de proyecto' })
  chatsDeProyecto(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'chat_my_project_channels' }, { userId: req.user!.userId }),
    );
  }

  @Get(':peerId/mentionables')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Qué se puede mencionar y referenciar en esta conversación' })
  @ApiResponse({ status: 200, description: '{ people, refs }' })
  mencionables(@Param('peerId', ParseUUIDPipe) peerId: string, @Request() req: Express.Request) {
    return this.mentionables.para({ peerId, requesterId: req.user!.userId });
  }

  @Get(':peerId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mensajes de una conversación privada' })
  @ApiResponse({ status: 200, description: 'Mensajes, si hay más arriba, no leídos y silenciado' })
  findAll(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @Query() query: FindChatMessagesQueryDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_find_all' },
        { ...query, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Escribe a alguien en privado' })
  @ApiResponse({ status: 201, description: 'Mensaje creado' })
  send(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @Body() body: SendChatMessageBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_send' },
        { ...body, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deja la conversación por leída' })
  @ApiResponse({ status: 200, description: 'Marca actualizada' })
  markRead(@Param('peerId', ParseUUIDPipe) peerId: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_mark_read' },
        { peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Silencia o reactiva los avisos de esta conversación' })
  @ApiResponse({ status: 200, description: '{ muted }' })
  mute(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @Body() body: MuteChatBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_mute' },
        { ...body, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/messages/:id/react')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pone o quita una reacción a un mensaje' })
  @ApiResponse({ status: 200, description: '{ messageId, reactions }' })
  react(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: ReactChatBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_react' },
        { ...body, messageId: id, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Borra un mensaje **propio**.
   *
   * En privado no hay moderación: no existe un rol por encima de una
   * conversación de dos. El servicio lo fija en `false` y no lo acepta por
   * payload, así que no hay forma de pedir borrar el de la otra persona.
   */
  @Delete(':peerId/messages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra un mensaje propio de la conversación' })
  @ApiResponse({ status: 200, description: 'Mensaje eliminado' })
  delete(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_delete' },
        { id, peerId, requesterId: req.user!.userId },
      ),
    );
  }
}
