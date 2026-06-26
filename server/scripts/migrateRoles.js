


import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const { default: db } = await import('../db.js');

console.log('🔄  Migrando roles legacy → usuario...\n');

const [result] = await db.query(
  `UPDATE usuario SET rol = 'usuario' WHERE rol IN ('editor', 'analista', 'lector')`
);

console.log(`✅  ${result.affectedRows} usuario(s) migrado(s) al rol "usuario".\n`);

const [rows] = await db.query(
  `SELECT rol, COUNT(*) AS total FROM usuario GROUP BY rol ORDER BY rol`
);
console.log('Distribución de roles actual:');
rows.forEach(r => console.log(`  ${r.rol.padEnd(12)} ${r.total} usuario(s)`));
console.log('');

process.exit(0);
