import { Router } from 'express';
import { serverError } from '../middleware/errorHandler.js';
import { requireSpecificAdmins } from '../middleware/roles.js';
import { getSchemaDiagram, getSchemaSizes } from '../repositories/principal/schemaRepository.js';

const router = Router();
const onlyDiagramAdmins = requireSpecificAdmins('acastroh@usil.edu.pe', 'mmontoyar@usil.edu.pe');

router.get('/admin/schema-diagrama', onlyDiagramAdmins, async (_req, res) => {
  try {
    res.json(await getSchemaDiagram());
  } catch (err) {
    serverError(res, err, 'GET /admin/schema-diagrama');
  }
});

router.get('/admin/schema-tamano', onlyDiagramAdmins, async (_req, res) => {
  try {
    res.json(await getSchemaSizes());
  } catch (err) {
    serverError(res, err, 'GET /admin/schema-tamano');
  }
});

export default router;
