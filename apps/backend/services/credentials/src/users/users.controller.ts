import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  DeleteUserDto,
  FindOneUserDto,
  FindUsersByIdsDto,
  FindUsersDto,
  SetUserStatusDto,
  UpdateUserDto,
} from '@praxis/contracts';

import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'user_find_all' })
  findAll(@Payload() dto: FindUsersDto) {
    return this.usersService.findAll(dto);
  }

  @MessagePattern({ cmd: 'user_find_one' })
  findOne(@Payload() dto: FindOneUserDto) {
    return this.usersService.findOne(dto.id);
  }

  /** Resuelve varios perfiles en una sola llamada */
  @MessagePattern({ cmd: 'user_find_by_ids' })
  findByIds(@Payload() dto: FindUsersByIdsDto) {
    return this.usersService.findByIds(dto.ids);
  }

  @MessagePattern({ cmd: 'user_update' })
  update(@Payload() dto: UpdateUserDto) {
    return this.usersService.update(dto);
  }

  /**
   * Cambia el estado de la cuenta. Comando **aparte** de `user_update`.
   *
   * No es un campo más del actualizador porque su ruta HTTP tampoco lo es:
   * `PATCH /users/:id` deja pasar al dueño de la cuenta, así que `status` ahí
   * sería auto-editable y un suspendido se reactivaría solo. Separarlo aquí
   * también evita que un `user_update` cualquiera pueda tocarlo por descuido.
   */
  @MessagePattern({ cmd: 'user_set_status' })
  setStatus(@Payload() dto: SetUserStatusDto) {
    return this.usersService.setStatus(dto);
  }

  /**
   * La foto llega **en base64**, no como `Buffer`.
   *
   * ⚠️ El transporte TCP de Nest serializa el payload a JSON, y un `Buffer`
   * cruza como `{ type: 'Buffer', data: [...] }` —un array de miles de números
   * que ocupa cinco veces más—. En base64 viaja como una cadena y se
   * reconstruye aquí.
   */
  @MessagePattern({ cmd: 'user_set_avatar' })
  setAvatar(@Payload() dto: { userId: string; mimeType: string; base64: string }) {
    return this.usersService.setAvatar(
      dto.userId,
      dto.mimeType,
      /* `Uint8Array<ArrayBuffer>` explícito: el `Buffer` de Node declara
         `ArrayBufferLike`, que Prisma no acepta para un campo `Bytes`. */
      Uint8Array.from(Buffer.from(dto.base64, 'base64')) as Uint8Array<ArrayBuffer>,
    );
  }

  @MessagePattern({ cmd: 'user_delete_avatar' })
  deleteAvatar(@Payload() dto: { userId: string }) {
    return this.usersService.deleteAvatar(dto.userId);
  }

  /** Devuelve los bytes en base64, por el mismo motivo que los recibe así. */
  
  @MessagePattern({ cmd: 'user_get_cover' })
  async getCover(@Payload() dto: { userId: string }) {
    const cover = await this.usersService.getCover(dto.userId);
    if (!cover) return null;
    return {
      mimeType: cover.mimeType,
      size: cover.size,
      base64: Buffer.from(cover.bytes).toString('base64'),
    };
  }

  @MessagePattern({ cmd: 'user_set_cover' })
  setCover(@Payload() dto: { userId: string; mimeType: string; base64: string }) {
    return this.usersService.setCover(dto.userId, dto.mimeType, Buffer.from(dto.base64, 'base64'));
  }

  @MessagePattern({ cmd: 'user_delete_cover' })
  deleteCover(@Payload() dto: { userId: string }) {
    return this.usersService.deleteCover(dto.userId);
  }

  @MessagePattern({ cmd: 'user_get_avatar' })
  async getAvatar(@Payload() dto: { userId: string }) {
    const avatar = await this.usersService.getAvatar(dto.userId);
    if (!avatar) return null;
    return {
      mimeType: avatar.mimeType,
      size: avatar.size,
      base64: Buffer.from(avatar.bytes).toString('base64'),
    };
  }

  @MessagePattern({ cmd: 'user_delete' })
  delete(@Payload() dto: DeleteUserDto) {
    return this.usersService.delete(dto.id);
  }
}
