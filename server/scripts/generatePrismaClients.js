import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import { buildDatabaseUrl } from '../utils/databaseUrl.js';

dotenv.config({ path: '../.env' });

const jobs = [
  ['radar', 'prisma/principal/schema.prisma', 'RADAR_DATABASE_URL', process.env.DB_NAME || 'radar_carreras'],
  ['empleabilidad', 'prisma/empleabilidad/schema.prisma', 'EMPLEABILIDAD_DATABASE_URL', 'empleabilidad_usil'],
  ['curricular', 'prisma/curricular/schema.prisma', 'CURRICULAR_DATABASE_URL', 'mallas_usil'],
];

for (const [name, schema, envName, database] of jobs) {
  const result = spawnSync('npx', ['prisma', 'generate', '--schema', schema], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      [envName]: process.env[envName] || buildDatabaseUrl(database),
    },
  });

  if (result.status !== 0) {
    console.error(`No se pudo generar Prisma Client para ${name}.`);
    process.exit(result.status || 1);
  }
}
