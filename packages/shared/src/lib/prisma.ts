import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client.
 * Each service (ingestion is the exception — see note below) imports this
 * instead of creating its own PrismaClient, which matters a lot on
 * serverless/Neon where connections are expensive.
 *
 * NOTE: The ingestion server should generally NOT import this directly for
 * hot-path request handling — it should only ever enqueue jobs. Only the
 * worker and dashboard server talk to Postgres.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
