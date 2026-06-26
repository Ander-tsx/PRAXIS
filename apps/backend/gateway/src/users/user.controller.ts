import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateUserDto, DeleteUserDto, FindOneUserDto, FindUsersDto, UpdateUserDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

@Controller('user')
export class UserController {
  constructor(@Inject('USER_SERVICE') private readonly userClient: ClientProxy) {}

  @Get('find-all')
  @HttpCode(HttpStatus.OK)
  findAll(@Body() body: FindUsersDto) {
    return firstValueFrom(this.userClient.send({ cmd: 'user_find_all' }, body));
  }

  @Get('find-one')
  findOne(@Body() body: FindOneUserDto) {
    return firstValueFrom(this.userClient.send({ cmd: 'user_find_one ' }, body));
  }

  @Post('create')
  create(@Body() body: CreateUserDto) {
    return firstValueFrom(this.userClient.send({ cmd: 'user_create' }, body))
  }

  @Put('update')
  update(@Body() body: UpdateUserDto) {
    return firstValueFrom(this.userClient.send({ cmd: 'user_update' }, body))
  }

  @Delete('delete')
  delete(@Body() body: DeleteUserDto) {
    return firstValueFrom(this.userClient.send({ cmd: 'user_delete' }, body))
  }
}
