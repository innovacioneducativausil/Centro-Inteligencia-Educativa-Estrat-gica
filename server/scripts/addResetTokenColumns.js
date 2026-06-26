
import db from '../db.js';

console.log('⏳ Verificando columnas de reset token...\n');

const DB_NAME = process.env.DB_NAME || 'radar_carreras';


const [cols] = await db.query(
  `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuario'
     AND COLUMN_NAME IN ('reset_token','reset_token_expires')`,
  [DB_NAME]
);

const existing = cols.map(c => c.COLUMN_NAME);
const toAdd    = [];

if (!existing.includes('reset_token'))
  toAdd.push('ADD COLUMN reset_token         VARCHAR(64)  NULL DEFAULT NULL');
if (!existing.includes('reset_token_expires'))
  toAdd.push('ADD COLUMN reset_token_expires DATETIME     NULL DEFAULT NULL');

if (toAdd.length === 0) {
  console.log('ℹ️  Las columnas ya existen. Nada que hacer.\n');
  process.exit(0);
}

await db.query(`ALTER TABLE usuario ${toAdd.join(', ')}`);

console.log('✅ Columnas agregadas:');
toAdd.forEach(s => console.log('  ', s));
console.log();
process.exit(0);
