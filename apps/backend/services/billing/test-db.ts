import { PrismaClient } from './src/generated/prisma-client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.organizationMember.findMany();
  console.log('Memberships:', users.length);
  const orgs = await prisma.organization.findMany();
  console.log('Organizations:', orgs.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
