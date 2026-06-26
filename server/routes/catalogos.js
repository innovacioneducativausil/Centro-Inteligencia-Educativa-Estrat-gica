import { serverError } from '../middleware/errorHandler.js';


import { Router } from 'express';
import db from '../db.js';

const router = Router();


router.get('/pestel', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id_pestel, nombre_pestel, slug_pestel, letra_codigo,
              desc_pestel, emoji, color, orden_display
       FROM pestel
       WHERE activo = 1
       ORDER BY orden_display ASC`
    );
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    console.error('[GET /pestel]', err);
    serverError(res, err);
  }
});


router.get('/sectores', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id_sector, nombre_sector, slug_sector,
              desc_sector, emoji, color, orden_display
       FROM sector
       WHERE activo = 1
       ORDER BY orden_display ASC`
    );
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    console.error('[GET /sectores]', err);
    serverError(res, err);
  }
});

export default router;
