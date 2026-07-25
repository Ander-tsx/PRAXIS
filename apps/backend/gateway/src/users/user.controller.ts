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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  DeleteUserDto,
  FindUsersDto,
  UpdateUserDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buscar o listar usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios recuperada' })
  findAll(@Body() body: FindUsersDto) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_find_all' }, body),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de usuario por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del usuario recuperado' })
  findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_find_one' }, { id }),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar información de un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  update(@Param('id') id: string, @Body() body: Omit<UpdateUserDto, 'id'>) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_update' }, { id, ...body }),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_delete' }, { id } satisfies DeleteUserDto),
    );
  }
}
