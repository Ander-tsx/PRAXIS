import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  FindUsersDto,
  FindOneUserDto,
  FindUsersByIdsDto,
  UpdateUserDto,
  DeleteUserDto,
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

  @MessagePattern({ cmd: 'user_delete' })
  delete(@Payload() dto: DeleteUserDto) {
    return this.usersService.delete(dto.id);
  }
}
