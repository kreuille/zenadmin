import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed tenant
  const tenant = await prisma.tenant.upsert({
    where: { siret: '12345678901234' },
    update: {},
    create: {
      name: 'Entreprise Test SARL',
      siret: '12345678901234',
      siren: '123456789',
      naf_code: '4399C',
      legal_form: 'SARL',
      plan: 'pro',
      address: {
        line1: '12 Rue de la Paix',
        zip_code: '75002',
        city: 'Paris',
        country: 'FR',
      },
    },
  });

  // Seed admin user (password: TestPassword1)
  await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email: 'admin@test.com' } },
    update: {},
    create: {
      tenant_id: tenant.id,
      email: 'admin@test.com',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder_hash',
      first_name: 'Admin',
      last_name: 'Test',
      role: 'owner',
    },
  });

  console.warn(`Seeded tenant: ${tenant.name} (${tenant.id})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
