import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CheckPermissionDto } from '@praxis/contracts';
import { PermissionsService } from './permissions.service';

@Controller()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @MessagePattern({ cmd: 'permissions_check' })
  checkPermission(@Payload() data: CheckPermissionDto) {
    return this.permissionsService.checkPermission(data);
  }
}
