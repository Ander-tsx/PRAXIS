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

  @MessagePattern({ cmd: 'user_delete' })
  delete(@Payload() dto: DeleteUserDto) {
    return this.usersService.delete(dto.id);
  }
}
