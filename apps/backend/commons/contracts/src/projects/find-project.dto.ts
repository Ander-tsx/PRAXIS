import { IsUUID } from 'class-validator';

export class FindOneProjectDto {
  @IsUUID()
  id: string;
}

export class FindProjectsByOwnerDto {
  @IsUUID()
  ownerId: string;
}

export class DeleteProjectDto {
  @IsUUID()
  id: string;
}
