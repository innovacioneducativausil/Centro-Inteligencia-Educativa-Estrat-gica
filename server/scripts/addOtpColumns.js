

import db from '../db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

async function run() {
  const [columns] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuario'`,
    [process.env.DB_NAME]
  );

  const existing = columns.map(c => c.COLUMN_NAME);
  const toAdd = [];

  if (!existing.includes('otp_hash'))     toAdd.push('ADD COLUMN otp_hash VARCHAR(64) NULL');
  if (!existing.includes('otp_expires'))  toAdd.push('ADD COLUMN otp_expires DATETIME NULL');
  if (!existing.includes('otp_attempts')) toAdd.push('ADD COLUMN otp_attempts TINYINT NOT NULL DEFAULT 0');
  if (!existing.includes('otp_purpose'))  toAdd.push('ADD COLUMN otp_purpose VARCHAR(20) NULL');

  if (toAdd.length === 0) {
    console.log('✅ Columnas OTP ya existen, nada que hacer.');
    process.exit(0);
  }

  await db.query(`ALTER TABLE usuario ${toAdd.join(', ')}`);
  console.log('✅ Columnas OTP agregadas:', toAdd.map(s => s.split(' ')[2]).join(', '));
  process.exit(0);
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
