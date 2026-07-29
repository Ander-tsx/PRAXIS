import { IsUUID } from 'class-validator';

/** Cuerpo que envía el cliente. El resto lo pone el gateway. */
export class DeleteTaskBodyDto {
  @IsUUID('4')
  projectId: string;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class DeleteTaskDto extends DeleteTaskBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;
}
