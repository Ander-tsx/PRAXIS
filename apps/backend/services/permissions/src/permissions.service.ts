import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Logger } from '@praxis/observability';
import { CheckPermissionDto } from '@praxis/contracts';

const VALID_ROLES = ['admin', 'user'] as const;

@Injectable()
export class PermissionsService {
  constructor(private readonly logger: Logger) {}

  checkPermission(data: CheckPermissionDto): { allowed: boolean } {
    this.logger.log(
      `Checking permission — userId: ${data.userId} | role: ${data.role}`,
    );

    if (!VALID_ROLES.includes(data.role)) {
      this.logger.warn(
        `Permission check failed: unknown role '${data.role}' for userId: ${data.userId}`,
      );
      throw new RpcException(`Unknown role: ${data.role}`);
    }

    const allowed = data.role === 'admin' || data.role === 'user';

    this.logger.debug(
      `Permission result — userId: ${data.userId} | role: ${data.role} | allowed: ${allowed}`,
    );

    if (!allowed) {
      this.logger.warn(
        `Permission denied — userId: ${data.userId} | role: ${data.role}`,
      );
    } else {
      this.logger.log(
        `Permission granted — userId: ${data.userId} | role: ${data.role}`,
      );
    }

    return { allowed };
  }
}
