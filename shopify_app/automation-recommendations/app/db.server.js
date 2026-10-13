import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL ||= "file:automation.sqlite";
global.automationPrisma ??= new PrismaClient();
export default global.automationPrisma;
