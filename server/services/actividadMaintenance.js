

import db from '../db.js';

export async function ensureActividadSupport() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS actividad_usuario (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_usuario    VARCHAR(36)  NOT NULL,
        correo        VARCHAR(255) NOT NULL,
        evento        VARCHAR(100) NOT NULL,
        modulo        VARCHAR(100) NULL,
        elemento_uuid VARCHAR(36)  NULL,
        elemento_tipo VARCHAR(50)  NULL,
        elemento_titulo VARCHAR(500) NULL,
        ip            VARCHAR(45)  NULL,
        user_agent    TEXT         NULL,
        metadata      JSON         NULL,
        fecha_hora    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_correo  (correo),
        INDEX idx_evento  (evento),
        INDEX idx_fecha   (fecha_hora)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[ACTIVIDAD] Tabla actividad_usuario lista.');
  } catch (err) {
    console.error('[ACTIVIDAD] Error al preparar tabla:', err.message);
  }
}
