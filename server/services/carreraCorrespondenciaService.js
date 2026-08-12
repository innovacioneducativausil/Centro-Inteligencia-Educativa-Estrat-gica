import dbCurricular from '../db_curricular.js';
import logger from '../logger.js';

/**
 * mallas_usil y empleabilidad_usil mantienen catálogos de carrera
 * INDEPENDIENTES (IDs propios, distinto alcance: empleabilidad_usil cubre
 * todos los niveles académicos de USIL, mallas_usil solo pregrado con malla
 * digitalizada). No se fusionan — en su lugar, esta tabla de correspondencia
 * documenta explícitamente qué id_carrera de una corresponde a cuál de la
 * otra, en vez de que el resto del código dependa de comparar nombres.
 *
 * Vive en mallas_usil porque no se pueden crear FOREIGN KEY entre bases de
 * datos distintas en MySQL — las columnas quedan como IDs simples, sin FK.
 */
async function ensureCorrespondenciaSchema() {
  await dbCurricular.query(`
    CREATE TABLE IF NOT EXISTS carrera_correspondencia_empleabilidad (
      id_correspondencia INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_carrera_malla INT UNSIGNED NOT NULL,
      id_carrera_empleabilidad INT UNSIGNED NOT NULL,
      nombre_malla VARCHAR(200) NOT NULL,
      nombre_empleabilidad VARCHAR(200) NOT NULL,
      tipo_match ENUM('exacto', 'manual') NOT NULL DEFAULT 'exacto',
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_correspondencia),
      UNIQUE KEY uq_carrera_malla (id_carrera_malla),
      KEY idx_carrera_empleabilidad (id_carrera_empleabilidad)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Siembra (idempotente) las correspondencias que se pueden determinar sin
 * ambigüedad: mismo nombre de carrera exacto (insensible a mayúsculas/tildes
 * por la collation utf8mb4_unicode_ci) Y tipo_programa = PREGRADO del lado
 * de empleabilidad_usil — esto último para evitar emparejar contra una fila
 * de educación continua/CPEL que casualmente comparte nombre.
 *
 * Las carreras de mallas_usil sin equivalente exacto (ej. "Educación
 * Secundaria con Especialidad en Inglés", que en empleabilidad_usil solo
 * existe como "EDUCACIÓN SECUNDARIA" genérica) NO se siembran aquí a
 * propósito — requieren una decisión humana, no un match automático.
 */
async function seedExactMatches() {
  const [rows] = await dbCurricular.query(`
    SELECT mc.id_carrera AS id_carrera_malla, mc.nombre_carrera AS nombre_malla,
           ec.id_carrera AS id_carrera_empleabilidad, ec.nombre_carrera AS nombre_empleabilidad
    FROM mallas_usil.carrera mc
    JOIN empleabilidad_usil.carrera ec
      ON ec.nombre_carrera = mc.nombre_carrera AND ec.id_tipo_programa = 1
  `);

  let insertados = 0;
  for (const row of rows) {
    const [result] = await dbCurricular.query(
      `INSERT IGNORE INTO carrera_correspondencia_empleabilidad
        (id_carrera_malla, id_carrera_empleabilidad, nombre_malla, nombre_empleabilidad, tipo_match)
       VALUES (?, ?, ?, ?, 'exacto')`,
      [row.id_carrera_malla, row.id_carrera_empleabilidad, row.nombre_malla, row.nombre_empleabilidad]
    );
    if (result.affectedRows > 0) insertados++;
  }

  if (insertados > 0) {
    logger.info(`Correspondencia carrera malla<->empleabilidad: ${insertados} nuevas de ${rows.length} matches exactos.`, {
      context: 'CARRERA_CORRESPONDENCIA',
    });
  }
}

async function ensureCarreraCorrespondencia() {
  try {
    await ensureCorrespondenciaSchema();
    await seedExactMatches();
  } catch (error) {
    logger.error(error?.message || 'Error preparando correspondencia de carreras.', {
      context: 'CARRERA_CORRESPONDENCIA',
      stack: error?.stack,
    });
  }
}

/** id_carrera de empleabilidad_usil correspondiente a un id_carrera de mallas_usil, o null si no hay correspondencia registrada. */
async function getIdCarreraEmpleabilidad(idCarreraMalla) {
  const [[row]] = await dbCurricular.query(
    'SELECT id_carrera_empleabilidad FROM carrera_correspondencia_empleabilidad WHERE id_carrera_malla = ?',
    [idCarreraMalla]
  );
  return row?.id_carrera_empleabilidad ?? null;
}

export { ensureCarreraCorrespondencia, getIdCarreraEmpleabilidad };
