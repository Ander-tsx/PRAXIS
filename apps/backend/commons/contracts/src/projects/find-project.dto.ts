import { IsNotEmpty, IsUUID } from 'class-validator';

export class FindOneProjectDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;
}

export class FindProjectsByOwnerDto {
  @IsUUID('4')
  @IsNotEmpty()
  ownerId: string;
}

export class DeleteProjectDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;
}
