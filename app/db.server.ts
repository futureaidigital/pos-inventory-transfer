import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function createPrismaClient(): PrismaClient {
  // In production, use Turso via libsql
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log("Using Turso database");
    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }

  // In development, use local SQLite file
  console.log("Using local SQLite database");
  return new PrismaClient();
}

// Use cached client in development to avoid connection exhaustion
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
}

const prisma = global.prismaGlobal ?? createPrismaClient();

export default prisma;
