import logger from '../logger.js';
import { radarPrisma } from '../prismaClient.js';

const ARCHIVED_STATE_ID = 4;
const RETENTION_DAYS = Math.max(1, Number(process.env.ARCHIVE_RETENTION_DAYS || 30));

const ARCHIVABLE_TABLES = [
  { table: 'senal', id: 'id_senal' },
  { table: 'tendencia', id: 'id_tendencia' },
  { table: 'escenario', id: 'id_escenario' },
];

async function columnExists(table, column) {
  const rows = await radarPrisma.$queryRawUnsafe(
    `SELECT 1
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    table,
    column
  );
  return rows.length > 0;
}

export async function ensureArchiveSupport() {
  await radarPrisma.estado.upsert({
    where: { id_estado: ARCHIVED_STATE_ID },
    create: {
      id_estado: ARCHIVED_STATE_ID,
      nombre_estado: 'Archivado',
      slug_estado: 'archivado',
      desc_estado: 'Contenido retirado a papelera antes de eliminacion definitiva.',
      es_visible_publico: false,
      es_editable: false,
      permite_transicion_a: null,
      color: '#64748b',
      icono: 'archive',
      orden_display: 4,
      activo: true,
    },
    update: {
      nombre_estado: 'Archivado',
      slug_estado: 'archivado',
      desc_estado: 'Contenido retirado a papelera antes de eliminacion definitiva.',
      es_visible_publico: false,
      es_editable: false,
      color: '#64748b',
      icono: 'archive',
      orden_display: 4,
      activo: true,
    },
  });

  for (const { table } of ARCHIVABLE_TABLES) {
    if (!(await columnExists(table, 'fecha_archivado'))) {
      await radarPrisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN fecha_archivado DATETIME NULL DEFAULT NULL`);
    }
  }
}

export async function cleanupExpiredArchives() {
  const deleted = {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const [senales, tendencias, escenarios] = await Promise.all([
    radarPrisma.senal.deleteMany({
      where: { id_estado: ARCHIVED_STATE_ID, fecha_archivado: { lt: cutoff } },
    }),
    radarPrisma.tendencia.deleteMany({
      where: { id_estado: ARCHIVED_STATE_ID, fecha_archivado: { lt: cutoff } },
    }),
    radarPrisma.escenario.deleteMany({
      where: { id_estado: ARCHIVED_STATE_ID, fecha_archivado: { lt: cutoff } },
    }),
  ]);

  deleted.senal = senales.count || 0;
  deleted.tendencia = tendencias.count || 0;
  deleted.escenario = escenarios.count || 0;

  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    logger.info(`Limpieza definitiva: ${total} registros eliminados`, { context: 'ARCHIVE', deleted });
  }

  return deleted;
}

export function getArchiveRetentionDays() {
  return RETENTION_DAYS;
}
