import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  FindUsersDto,
  FindOneUserDto,
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

  @MessagePattern({ cmd: 'user_update' })
  update(@Payload() dto: UpdateUserDto) {
    return this.usersService.update(dto);
  }

  @MessagePattern({ cmd: 'user_delete' })
  delete(@Payload() dto: DeleteUserDto) {
    return this.usersService.delete(dto.id);
  }
}
