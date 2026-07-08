

import db from '../db.js';

//----------------TI-35----------------
// Retencion de logs de operacion (centralizados en actividad_usuario):
// 365 dias por defecto, configurable con ACTIVIDAD_RETENTION_DAYS.
const RETENTION_DAYS = Math.max(30, Number(process.env.ACTIVIDAD_RETENTION_DAYS || 365));

//----------------TI-44 / TI-59----------------
export async function ensureActividadSupport() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS actividad_usuario (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_usuario    VARCHAR(36)  NOT NULL,
        correo        VARCHAR(255) NOT NULL,
        rol           VARCHAR(50)  NULL,
        evento        VARCHAR(100) NOT NULL,
        accion        VARCHAR(100) NULL,
        modulo        VARCHAR(100) NULL,
        entidad       VARCHAR(100) NULL,
        entidad_id    VARCHAR(100) NULL,
        elemento_uuid VARCHAR(36)  NULL,
        elemento_tipo VARCHAR(50)  NULL,
        elemento_titulo VARCHAR(500) NULL,
        detalle       TEXT         NULL,
        ip            VARCHAR(45)  NULL,
        user_agent    TEXT         NULL,
        metadata      JSON         NULL,
        fecha_hora    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_correo  (correo),
        INDEX idx_evento  (evento),
        INDEX idx_fecha   (fecha_hora)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [columns] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividad_usuario'`
    );
    const existing = new Set(columns.map(c => c.COLUMN_NAME));
    const toAdd = [];
    if (!existing.has('rol')) toAdd.push('ADD COLUMN rol VARCHAR(50) NULL AFTER correo');
    if (!existing.has('accion')) toAdd.push('ADD COLUMN accion VARCHAR(100) NULL AFTER evento');
    if (!existing.has('entidad')) toAdd.push('ADD COLUMN entidad VARCHAR(100) NULL AFTER modulo');
    if (!existing.has('entidad_id')) toAdd.push('ADD COLUMN entidad_id VARCHAR(100) NULL AFTER entidad');
    if (!existing.has('detalle')) toAdd.push('ADD COLUMN detalle TEXT NULL AFTER elemento_titulo');
    if (toAdd.length) {
      await db.query(`ALTER TABLE actividad_usuario ${toAdd.join(', ')}`);
    }
    await db.query(`ALTER TABLE actividad_usuario MODIFY id_usuario VARCHAR(36) NULL`);
    await db.query(`ALTER TABLE actividad_usuario MODIFY correo VARCHAR(255) NULL`);
    console.log('[ACTIVIDAD] Tabla actividad_usuario lista.');
  } catch (err) {
    console.error('[ACTIVIDAD] Error al preparar tabla:', err.message);
  }
}

//----------------TI-44 / TI-59 / TI-35----------------
// Limpieza periodica que aplica la retencion de logs de operacion.
export async function cleanupOldActividad() {
  try {
    const [result] = await db.query(
      `DELETE FROM actividad_usuario WHERE fecha_hora < DATE_SUB(NOW(), INTERVAL ${RETENTION_DAYS} DAY)`
    );
    const deleted = result.affectedRows || 0;
    if (deleted > 0) {
      console.log(`[ACTIVIDAD] Retencion: ${deleted} registros eliminados (> ${RETENTION_DAYS} dias)`);
    }
    return deleted;
  } catch (err) {
    console.error('[ACTIVIDAD] Error en limpieza de retencion:', err.message);
    return 0;
  }
}

export function getActividadRetentionDays() {
  return RETENTION_DAYS;
}
