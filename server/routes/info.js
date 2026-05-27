import { serverError } from '../middleware/errorHandler.js';
// server/routes/info.js
// Ruta de diagnóstico: lista las tablas disponibles en la BD.
// Cuando el usuario comparta el esquema, aquí agregaremos
// las rutas reales (señales, tendencias, carreras, etc.)
import { Router } from 'express';
import db from '../db.js';
import { adminOrAnalyst } from '../middleware/roles.js';

const router = Router();
router.use(adminOrAnalyst);

// GET /api/tables — devuelve todas las tablas de la BD
router.get('/tables', async (_req, res) => {
  try {
    const [rows] = await db.query('SHOW TABLES');
    const tables = rows.map(row => Object.values(row)[0]);
    res.json({ database: 'radar_carreras', tables });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/describe/:table — describe la estructura de una tabla
router.get('/describe/:table', async (req, res) => {
  try {
    const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, ''); // sanitize
    const [rows] = await db.query(`DESCRIBE \`${table}\``);
    res.json({ table, columns: rows });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
