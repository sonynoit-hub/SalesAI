import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: string;
};

const PRISMA_SCHEMA_VERSION = "company-address-field";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const cachedPrisma = globalForPrisma.prisma;
const needsFreshClient =
  cachedPrisma &&
  (!("searchGoal" in cachedPrisma) ||
    globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION);

export const prisma =
  cachedPrisma && !needsFreshClient ? cachedPrisma : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}
