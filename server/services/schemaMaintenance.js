import logger from '../logger.js';
import { radarPrisma } from '../prismaClient.js';

export async function ensureColumn(table, column, definition) {
  const rows = await radarPrisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    table,
    column
  );
  if (rows.length) return;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await radarPrisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      return;
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') return;
      if (err.code !== 'ER_LOCK_DEADLOCK' || attempt === 3) throw err;
      await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
  }
}

export async function ensureRadarSchemaSupport() {
  await ensureColumn('senal', 'autor', 'VARCHAR(160) NULL');
  await ensureColumn('senal', 'fecha_senal_articulo', 'DATE NULL');
  await ensureColumn('tendencia', 'autor', 'VARCHAR(160) NULL');
  await ensureColumn('escenario', 'autor', 'VARCHAR(160) NULL');
  await ensureColumn('escenario', 'referencias_escenario', 'TEXT NULL DEFAULT NULL');
  //----------------TI-41----------------
  await ensureColumn('usuario', 'eliminado_en', 'DATETIME NULL');
}

//----------------TI-08 / TI-23 / TI-31----------------
export async function ensureAlertasSupport() {
  await radarPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS regla_alerta (
      id_regla          VARCHAR(36)  NOT NULL PRIMARY KEY,
      nombre             VARCHAR(150) NOT NULL,
      metrica            VARCHAR(50)  NOT NULL,
      operador           VARCHAR(2)   NOT NULL,
      valor_umbral       DECIMAL(12,2) NOT NULL,
      activa             TINYINT(1)   NOT NULL DEFAULT 1,
      creado_por         VARCHAR(36)  NULL,
      fecha_creacion     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await radarPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS alerta_generada (
      id_alerta       BIGINT AUTO_INCREMENT PRIMARY KEY,
      id_regla        VARCHAR(36)  NOT NULL,
      metrica         VARCHAR(50)  NOT NULL,
      valor_medido    DECIMAL(12,2) NOT NULL,
      valor_umbral    DECIMAL(12,2) NOT NULL,
      mensaje         VARCHAR(500) NOT NULL,
      fecha_generada  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atendida        TINYINT(1)   NOT NULL DEFAULT 0,
      atendida_por    VARCHAR(36)  NULL,
      fecha_atendida  DATETIME     NULL,
      INDEX idx_regla (id_regla),
      INDEX idx_atendida (atendida)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn('alerta_generada', 'elementos_afectados', 'JSON NULL');

  //----------------TI-08 / TI-23 / TI-31: historial de metricas para tendencia----------------
  await radarPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS alerta_metrica_historial (
      id_historial   BIGINT AUTO_INCREMENT PRIMARY KEY,
      metrica        VARCHAR(50)  NOT NULL,
      valor          DECIMAL(12,2) NOT NULL,
      fecha_medicion DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_metrica_fecha (metrica, fecha_medicion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  logger.info('Tablas regla_alerta / alerta_generada / alerta_metrica_historial listas.', { context: 'ALERTAS' });
}
