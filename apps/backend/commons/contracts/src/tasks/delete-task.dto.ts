import { IsNotEmpty, IsUUID } from 'class-validator';

export class DeleteTaskDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;
}
