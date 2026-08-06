import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { UserStatus } from '../admin/admin-user.dto';
import { QueryOptionsDto } from '../pagination.dto';

class FindUsersFilter {
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Estado de la cuenta. Lo usa el panel de administración para responder
   * «quién está suspendido» sin traerse todas las páginas y filtrar en el
   * cliente.
   *
   * Estaba aquí comentado como TODO. El `roleId` que lo acompañaba sigue sin
   * existir a propósito: los roles globales viven en **otro servicio**, así que
   * filtrar por rol desde aquí exigiría que credentials consultara a
   * permissions en cada listado. El panel cruza las dos listas en el gateway,
   * que es donde ya se cruzan las demás.
   */
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;
}

export class FindUsersDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FindUsersFilter)
  filters?: FindUsersFilter;
}
