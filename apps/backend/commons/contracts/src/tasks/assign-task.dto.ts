import { IsOptional, IsUUID } from 'class-validator';

/** Cuerpo que envía el cliente. El resto lo pone el gateway. */
export class AssignTaskBodyDto {
  @IsUUID('4')
  projectId: string;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class AssignTaskDto extends AssignTaskBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;
}
