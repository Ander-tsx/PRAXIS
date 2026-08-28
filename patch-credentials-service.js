const fs = require('fs');

// Path 1: users.service.ts
const servicePath = 'apps/backend/services/credentials/src/users/users.service.ts';
let serviceCode = fs.readFileSync(servicePath, 'utf8');

const getCoverMethod = `
  async getCover(userId: string) {
    return this.prisma.userCover.findUnique({ where: { userId } });
  }
`;

const setCoverMethod = `
  async setCover(userId: string, mimeType: string, bytes: Uint8Array<ArrayBuffer>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    const version = Date.now();
    const [, actualizado] = await this.prisma.$transaction([
      this.prisma.userCover.upsert({
        where: { userId },
        create: { userId, mimeType, size: bytes.length, bytes },
        update: { mimeType, size: bytes.length, bytes },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { coverUrl: \`/users/\${userId}/cover?v=\${version}\` },
        include: { credential: { select: { email: true } } },
      }),
    ]);

    await this.redis.del(\`user:\${userId}\`);
    return actualizado;
  }
`;

const deleteCoverMethod = `
  async deleteCover(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await tx.userCover.delete({ where: { userId } }).catch(() => null);
      return tx.user.update({
        where: { id: userId },
        data: { coverUrl: null },
        include: { credential: { select: { email: true } } },
      });
    });

    await this.redis.del(\`user:\${userId}\`);
    return actualizado;
  }
`;

serviceCode = serviceCode.replace('async setAvatar', getCoverMethod + setCoverMethod + deleteCoverMethod + '\n  async setAvatar');
fs.writeFileSync(servicePath, serviceCode);

// Path 2: users.controller.ts
const controllerPath = 'apps/backend/services/credentials/src/users/users.controller.ts';
let controllerCode = fs.readFileSync(controllerPath, 'utf8');

const coverControllerMethods = `
  @MessagePattern({ cmd: 'user_get_cover' })
  async getCover(@Payload() dto: { userId: string }) {
    const cover = await this.users.getCover(dto.userId);
    if (!cover) return null;
    return {
      mimeType: cover.mimeType,
      size: cover.size,
      base64: cover.bytes.toString('base64'),
    };
  }

  @MessagePattern({ cmd: 'user_set_cover' })
  setCover(@Payload() dto: { userId: string; mimeType: string; base64: string }) {
    return this.users.setCover(dto.userId, dto.mimeType, Buffer.from(dto.base64, 'base64'));
  }

  @MessagePattern({ cmd: 'user_delete_cover' })
  deleteCover(@Payload() dto: { userId: string }) {
    return this.users.deleteCover(dto.userId);
  }
`;

controllerCode = controllerCode.replace('@MessagePattern({ cmd: \'user_get_avatar\' })', coverControllerMethods + '\n  @MessagePattern({ cmd: \'user_get_avatar\' })');
fs.writeFileSync(controllerPath, controllerCode);

console.log("Patched credentials service");
