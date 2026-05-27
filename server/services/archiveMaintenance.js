import db from '../db.js';

const ARCHIVED_STATE_ID = 4;
const RETENTION_DAYS = Math.max(1, Number(process.env.ARCHIVE_RETENTION_DAYS || 30));

const ARCHIVABLE_TABLES = [
  { table: 'senal', id: 'id_senal' },
  { table: 'tendencia', id: 'id_tendencia' },
  { table: 'escenario', id: 'id_escenario' },
];

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

export async function ensureArchiveSupport() {
  await db.query(
    `INSERT INTO estado
       (id_estado, nombre_estado, slug_estado, desc_estado, es_visible_publico,
        es_editable, permite_transicion_a, color, icono, orden_display, activo)
     VALUES
       (?, 'Archivado', 'archivado',
        'Contenido retirado a papelera antes de eliminacion definitiva.',
        0, 0, NULL, '#64748b', 'archive', 4, 1)
     ON DUPLICATE KEY UPDATE
       nombre_estado = VALUES(nombre_estado),
       slug_estado = VALUES(slug_estado),
       desc_estado = VALUES(desc_estado),
       es_visible_publico = VALUES(es_visible_publico),
       es_editable = VALUES(es_editable),
       color = VALUES(color),
       icono = VALUES(icono),
       orden_display = VALUES(orden_display),
       activo = VALUES(activo)`,
    [ARCHIVED_STATE_ID]
  );

  for (const { table } of ARCHIVABLE_TABLES) {
    if (!(await columnExists(table, 'fecha_archivado'))) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN fecha_archivado DATETIME NULL DEFAULT NULL`);
    }
  }
}

export async function cleanupExpiredArchives() {
  const deleted = {};

  for (const { table } of ARCHIVABLE_TABLES) {
    const [result] = await db.query(
      `DELETE FROM \`${table}\`
        WHERE id_estado = ?
          AND fecha_archivado IS NOT NULL
          AND fecha_archivado < DATE_SUB(NOW(), INTERVAL ${RETENTION_DAYS} DAY)`,
      [ARCHIVED_STATE_ID]
    );
    deleted[table] = result.affectedRows || 0;
  }

  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    console.log(`[ARCHIVE] Limpieza definitiva: ${total} registros eliminados`, deleted);
  }

  return deleted;
}

export function getArchiveRetentionDays() {
  return RETENTION_DAYS;
}
