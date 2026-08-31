import { PrismaClient } from './src/generated/prisma-client';
const prisma = new PrismaClient();
async function main() {
  const userId = '11111111-1111-4111-8111-111111111111';
  const orgs = await prisma.organization.findMany({ where: { ownerUserId: userId } });
  console.log('Orgs owned:', orgs);
  const mems = await prisma.organizationMember.findMany({ where: { userId } });
  console.log('Memberships:', mems);
}
main().catch(console.error).finally(() => prisma.$disconnect());
