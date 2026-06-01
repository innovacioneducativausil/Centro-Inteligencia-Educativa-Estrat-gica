import db from '../db.js';

async function ensureColumn(table, column, definition) {
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (rows.length) return;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
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
}
