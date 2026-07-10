import { serverError } from '../middleware/errorHandler.js';


import { Router } from 'express';
import { getPestelActivos, getSectoresActivos } from '../repositories/principal/catalogosRepository.js';

const router = Router();


router.get('/pestel', async (_req, res) => {
  try {
    const rows = await getPestelActivos();
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    serverError(res, err, 'GET /pestel');
  }
});


router.get('/sectores', async (_req, res) => {
  try {
    const rows = await getSectoresActivos();
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    serverError(res, err, 'GET /sectores');
  }
});

export default router;
