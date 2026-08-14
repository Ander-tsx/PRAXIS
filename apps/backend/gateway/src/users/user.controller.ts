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
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeleteUserDto, FindUsersQueryDto, UpdateUserBodyDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { AccountOwnerGuard } from '../common/guards/account-owner.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(@Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy) {}

  /**
   * Filtros por **query params**, no por body: `fetch` no puede enviar cuerpo
   * en un GET y esta ruta era inalcanzable desde el navegador.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buscar o listar usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios recuperada' })
  findAll(@Query() query: FindUsersQueryDto) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_find_all' }, query.toFindUsersDto()),
    );
  }

  /**
   * El perfil de quien pregunta.
   *
   * ⚠️ Va **antes** de `@Get(':id')`: Nest resuelve por orden de declaración y
   * la ruta con parámetro se comería «me» tratándolo como un id —que además
   * fallaría en `ParseUUIDPipe` con un 400 de lo más confuso.
   *
   * Existe para que el frontend no tenga que sacar el `sub` del JWT y pedir
   * `/users/:id` por su cuenta: eso obligaba a cada zona a saber leer un token
   * que, por diseño, es una cookie httpOnly que el navegador no puede abrir.
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perfil de quien hace la petición' })
  @ApiResponse({ status: 200, description: 'Perfil recuperado' })
  findMe(@Request() req: Express.Request) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_find_one' }, { id: req.user!.userId }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de usuario por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del usuario recuperado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'user_find_one' }, { id }));
  }

  /**
   * Solo el dueño de la cuenta o un administrador global (`AccountOwnerGuard`).
   *
   * ⚠️ El `id` va **después** del spread: si fuera `{ id, ...body }`, un `id`
   * colado en el cuerpo pisaría al de la ruta y se saltaría el guard, que
   * comprueba el parámetro de ruta.
   */
  @Patch(':id')
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Actualizar información de un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo puedes modificar tu propia cuenta' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserBodyDto) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'user_update' }, { ...body, id }));
  }

  @Delete(':id')
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo puedes eliminar tu propia cuenta' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_delete' }, { id } satisfies DeleteUserDto),
    );
  }
}
