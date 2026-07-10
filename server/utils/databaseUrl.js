function encodePart(value = '') {
  return encodeURIComponent(value);
}

//----------------TI-35 (dimensionamiento de conexiones)----------------
// Sin esto, cada PrismaClient abre su propio pool con el default de Prisma
// (num_cpus_fisicos * 2 + 1), y hay 3 PrismaClient + 3 pools mysql2 legacy
// apuntando al mismo host MySQL simultaneamente. connection_limit fija un
// techo por cliente. Con max_connections=151 confirmado en produccion
// (Railway MySQL, 2026-07-10), 3x8=24 Prisma + 30 mysql2 legacy = 54/151
// (~36%), con margen de sobra. Ajustar PRISMA_CONNECTION_LIMIT si cambia
// el plan/servidor de produccion.
const CONNECTION_LIMIT = process.env.PRISMA_CONNECTION_LIMIT || '8';
const POOL_TIMEOUT = process.env.PRISMA_POOL_TIMEOUT || '10';

export function buildDatabaseUrl(database) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  return `mysql://${encodePart(user)}:${encodePart(password)}@${host}:${port}/${database}?connection_limit=${CONNECTION_LIMIT}&pool_timeout=${POOL_TIMEOUT}`;
}

export function ensurePrismaDatabaseUrls() {
  process.env.RADAR_DATABASE_URL ||= buildDatabaseUrl(process.env.DB_NAME || 'radar_carreras');
  process.env.EMPLEABILIDAD_DATABASE_URL ||= buildDatabaseUrl('empleabilidad_usil');
  process.env.CURRICULAR_DATABASE_URL ||= buildDatabaseUrl('mallas_usil');
}
