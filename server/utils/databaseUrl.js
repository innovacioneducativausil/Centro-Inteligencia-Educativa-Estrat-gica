function encodePart(value = '') {
  return encodeURIComponent(value);
}

export function buildDatabaseUrl(database) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  return `mysql://${encodePart(user)}:${encodePart(password)}@${host}:${port}/${database}`;
}

export function ensurePrismaDatabaseUrls() {
  process.env.RADAR_DATABASE_URL ||= buildDatabaseUrl(process.env.DB_NAME || 'radar_carreras');
  process.env.EMPLEABILIDAD_DATABASE_URL ||= buildDatabaseUrl('empleabilidad_usil');
  process.env.CURRICULAR_DATABASE_URL ||= buildDatabaseUrl('mallas_usil');
}
