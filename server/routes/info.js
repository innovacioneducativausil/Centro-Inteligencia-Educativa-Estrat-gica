import { serverError } from '../middleware/errorHandler.js';


import { Router } from 'express';
import { adminOrAnalyst } from '../middleware/roles.js';
import { describeTable, getDatabaseTables } from '../repositories/principal/infoRepository.js';

const router = Router();


router.get('/tables', adminOrAnalyst, async (_req, res) => {
  try {
    const tables = await getDatabaseTables();
    res.json({ database: 'radar_carreras', tables });
  } catch (err) {
    serverError(res, err, 'GET /tables');
  }
});


router.get('/describe/:table', adminOrAnalyst, async (req, res) => {
  try {
    res.json(await describeTable(req.params.table));
  } catch (err) {
    serverError(res, err, 'GET /describe/:table');
  }
});

export default router;
