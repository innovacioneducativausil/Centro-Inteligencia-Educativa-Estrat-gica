


import db from '../db.js';

async function run() {
  try {

    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'escenario'
         AND COLUMN_NAME  = 'referencias_escenario'`
    );

    if (cols.length > 0) {
      console.log('✅ La columna referencias_escenario ya existe. Nada que hacer.');
      process.exit(0);
    }

    await db.query(
      `ALTER TABLE escenario
       ADD COLUMN referencias_escenario TEXT NULL DEFAULT NULL
       COMMENT 'Referencias bibliográficas del bloque (JSON array de strings)'
       AFTER url_video_escenario`
    );

    console.log('✅ Columna referencias_escenario agregada correctamente a la tabla escenario.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  }
}

run();
