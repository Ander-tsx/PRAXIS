import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  DeleteUserDto,
  FindUsersDto,
  UpdateUserDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Body() body: FindUsersDto) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_find_all' }, body),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_find_one' }, { id }),
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Omit<UpdateUserDto, 'id'>) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_update' }, { id, ...body }),
    );
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_delete' }, { id } satisfies DeleteUserDto),
    );
  }
}
