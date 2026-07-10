import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient as RadarPrismaClient } from './generated/prisma/radar/index.js';
import { PrismaClient as EmpleabilidadPrismaClient } from './generated/prisma/empleabilidad/index.js';
import { PrismaClient as CurricularPrismaClient } from './generated/prisma/curricular/index.js';
import { ensurePrismaDatabaseUrls } from './utils/databaseUrl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
ensurePrismaDatabaseUrls();

export const radarPrisma = new RadarPrismaClient();
export const empleabilidadPrisma = new EmpleabilidadPrismaClient();
export const curricularPrisma = new CurricularPrismaClient();
