import { PrismaClient } from "@prisma/client";

// Preserve the original local database unless a deployment supplies another path.
process.env.DATABASE_URL ||= "file:dev.sqlite";

// Reuse the client across HMR reloads in development; create a fresh one in production.
global.prismaGlobal ??= new PrismaClient();

/** @type {PrismaClient} */
const prisma = global.prismaGlobal;

export default prisma;
