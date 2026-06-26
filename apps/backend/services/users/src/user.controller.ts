import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
    CreateUserDto,
    DeleteUserDto,
    FindOneUserDto,
    FindUsersDto,
    UpdateUserDto,
} from '@praxis/contracts';
import { UserService } from './user.service';

@Controller()
export class UserController {
    constructor(private readonly userService: UserService) {}

    @MessagePattern({ cmd: 'user_find_all' })
    findAll(@Payload() dto: FindUsersDto) {
        return this.userService.findAll(dto);
    }

    @MessagePattern({ cmd: 'user_find_one' })
    findOne(@Payload() dto: FindOneUserDto) {
        return this.userService.findOne(dto);
    }

    @MessagePattern({ cmd: 'user_create' })
    create(@Payload() dto: CreateUserDto) {
        return this.userService.createUser(dto);
    }

    @MessagePattern({ cmd: 'user_update' })
    update(@Payload() dto: UpdateUserDto) {
        return this.userService.updateUser(dto);
    }

    @MessagePattern({ cmd: 'user_delete' })
    delete(@Payload() dto: DeleteUserDto) {
        return this.userService.deleteUser(dto);
    }
}
