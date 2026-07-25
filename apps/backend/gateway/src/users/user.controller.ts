import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Request,
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
import { GlobalRoleGuard } from '../common/guards/global-role.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';

@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  /** Lista todos los usuarios del sistema (solo Admin) */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireGlobalRole('Admin')
  @UseGuards(GlobalRoleGuard)
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

  /** Actualiza un usuario — solo el propio usuario puede editar su perfil */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: Omit<UpdateUserDto, 'id'>,
  ) {
    if (req.user!.userId !== id) {
      throw new ForbiddenException('Solo puedes editar tu propio perfil');
    }
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_update' }, { id, ...body }),
    );
  }

  /** Elimina un usuario del sistema (solo Admin) */
  @Delete(':id')
  @RequireGlobalRole('Admin')
  @UseGuards(GlobalRoleGuard)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_delete' }, { id } satisfies DeleteUserDto),
    );
  }
}
