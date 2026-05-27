import { ensureMercadoLaboralReady } from '../routes/mercadoLaboral.js';
import db from '../db_empl.js';

try {
  await ensureMercadoLaboralReady();
  console.log('Mercado Laboral: tablas y semilla listas en empleabilidad_usil.');
  await db.end();
  process.exit(0);
} catch (err) {
  console.error('Mercado Laboral: no se pudo preparar la BD.', err);
  await db.end().catch(() => {});
  process.exit(1);
}
