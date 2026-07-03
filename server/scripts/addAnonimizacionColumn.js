

import db from '../db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

//----------------TI-41----------------
async function run() {
  const [columns] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuario'`,
    [process.env.DB_NAME]
  );

  const existing = columns.map(c => c.COLUMN_NAME);
  const toAdd = [];

  if (!existing.includes('eliminado_en')) toAdd.push('ADD COLUMN eliminado_en DATETIME NULL');

  if (toAdd.length === 0) {
    console.log('✅ Columna de anonimizacion ya existe, nada que hacer.');
    process.exit(0);
  }

  await db.query(`ALTER TABLE usuario ${toAdd.join(', ')}`);
  console.log('✅ Columna agregada:', toAdd.map(s => s.split(' ')[2]).join(', '));
  process.exit(0);
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
