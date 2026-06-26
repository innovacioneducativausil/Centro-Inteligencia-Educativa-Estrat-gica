import { serverError } from '../middleware/errorHandler.js';


import { Router } from 'express';
import db from '../db.js';
import { adminOrAnalyst } from '../middleware/roles.js';

const router = Router();


router.get('/tables', adminOrAnalyst, async (_req, res) => {
  try {
    const [rows] = await db.query('SHOW TABLES');
    const tables = rows.map(row => Object.values(row)[0]);
    res.json({ database: 'radar_carreras', tables });
  } catch (err) {
    serverError(res, err);
  }
});


router.get('/describe/:table', adminOrAnalyst, async (req, res) => {
  try {
    const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, '');
    const [rows] = await db.query(`DESCRIBE \`${table}\``);
    res.json({ table, columns: rows });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
