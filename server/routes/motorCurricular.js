import { Router } from 'express';
import { adminOrAnalyst } from '../middleware/roles.js';
import { serverError } from '../middleware/errorHandler.js';
import { analizarImpacto } from '../services/motorImpactoCurricularService.js';
import {
  createMallaVersionPropuesta,
  createPropuestaCurricular,
  ensureMotorSchema,
  getBrechasCurriculares,
  getEvidenciasImpacto,
  getImpactosCurriculares,
  getKpisImpacto,
  getMallaVersionName,
  getPropuestaForVersion,
  getPropuestasCurriculares,
  updatePropuestaEstado,
} from '../repositories/curricular/motorCurricularRepository.js';

const router = Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureMotorSchema();
    next();
  } catch (err) {
    next(err);
  }
});

router.post('/curricular/analizar-impacto/:idCarrera', adminOrAnalyst, async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { id_malla_version, pesos } = req.body;
    if (!id_malla_version) return res.status(400).json({ error: 'id_malla_version es requerido' });

    const usuario = req.user?.nombre || req.user?.email || 'motor_automatico';
    const result = await analizarImpacto(Number(idCarrera), Number(id_malla_version), pesos ?? {}, usuario);
    if (!result.ok) return res.status(422).json({ error: result.error });
    res.json(result);
  } catch (err) {
    serverError(res, err, 'POST /curricular/analizar-impacto');
  }
});

router.get('/curricular/impactos/:idCarrera', async (req, res) => {
  try {
    const rows = await getImpactosCurriculares({
      idCarrera: req.params.idCarrera,
      idMalla: req.query.id_malla,
    });
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'GET /curricular/impactos');
  }
});

router.get('/curricular/brechas/:idCarrera', async (req, res) => {
  try {
    const rows = await getBrechasCurriculares({
      idCarrera: req.params.idCarrera,
      idMalla: req.query.id_malla,
      prioridad: req.query.prioridad,
    });
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'GET /curricular/brechas');
  }
});

router.get('/curricular/propuestas/:idCarrera', async (req, res) => {
  try {
    const rows = await getPropuestasCurriculares({
      idCarrera: req.params.idCarrera,
      estado: req.query.estado,
      idMalla: req.query.id_malla,
    });
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'GET /curricular/propuestas');
  }
});

router.post('/curricular/propuestas', adminOrAnalyst, async (req, res) => {
  try {
    const {
      id_brecha,
      id_carrera,
      id_malla_version_origen,
      tipo_propuesta,
      titulo_propuesta,
      descripcion_propuesta,
      justificacion,
      impacto_esperado,
    } = req.body;

    if (!id_brecha || !id_carrera || !id_malla_version_origen || !tipo_propuesta
      || !titulo_propuesta?.trim() || !descripcion_propuesta?.trim() || !justificacion?.trim()) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const usuario = req.user?.nombre || req.user?.email || 'usuario';
    const id = await createPropuestaCurricular({
      id_brecha,
      id_carrera,
      id_malla_version_origen,
      tipo_propuesta,
      titulo_propuesta: titulo_propuesta.trim(),
      descripcion_propuesta: descripcion_propuesta.trim(),
      justificacion: justificacion.trim(),
      impacto_esperado,
      usuario,
    });
    res.status(201).json({ id });
  } catch (err) {
    serverError(res, err, 'POST /curricular/propuestas');
  }
});

router.put('/curricular/propuestas/:id/estado', adminOrAnalyst, async (req, res) => {
  try {
    const { estado_revision, observacion } = req.body;
    const estados = ['pendiente', 'aprobada', 'rechazada', 'observada'];
    if (!estados.includes(estado_revision)) {
      return res.status(400).json({ error: `estado_revision debe ser uno de: ${estados.join(', ')}` });
    }

    const usuario = req.user?.nombre || req.user?.email || 'revisor';
    await updatePropuestaEstado({
      id: req.params.id,
      estadoRevision: estado_revision,
      observacion,
      usuario,
    });
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'PUT /curricular/propuestas/:id/estado');
  }
});

router.post('/curricular/propuestas/:id/generar-version-malla', adminOrAnalyst, async (req, res) => {
  try {
    const { id } = req.params;
    const prop = await getPropuestaForVersion(id);
    if (!prop) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (prop.estado_revision !== 'aprobada') {
      return res.status(422).json({ error: 'Solo se puede generar version de una propuesta aprobada' });
    }

    const nombreMalla = await getMallaVersionName(prop.id_malla_version_origen);
    const nuevaVersion = `${nombreMalla ?? 'V?'}-Prop${id}-${new Date().getFullYear()}`;
    const nombreFinal = (req.body.nombre_version ?? nuevaVersion).substring(0, 199);
    const descripcionCambios =
      `Version propuesta basada en: ${prop.titulo_propuesta}. Brecha: ${prop.descripcion_brecha?.substring(0, 200)}.`;

    const idVersion = await createMallaVersionPropuesta({
      idMallaVersionOrigen: prop.id_malla_version_origen,
      idPropuesta: id,
      nombreVersion: nombreFinal,
      descripcionCambios,
    });

    res.status(201).json({ id: idVersion, nombre_version: nombreFinal });
  } catch (err) {
    serverError(res, err, 'POST /curricular/propuestas/:id/generar-version-malla');
  }
});

router.get('/curricular/evidencias/:idImpacto', async (req, res) => {
  try {
    res.json(await getEvidenciasImpacto(req.params.idImpacto));
  } catch (err) {
    serverError(res, err, 'GET /curricular/evidencias/:idImpacto');
  }
});

router.get('/curricular/kpis-impacto/:idCarrera', async (req, res) => {
  try {
    res.json(await getKpisImpacto({
      idCarrera: req.params.idCarrera,
      idMalla: req.query.id_malla,
    }));
  } catch (err) {
    serverError(res, err, 'GET /curricular/kpis-impacto');
  }
});

export default router;
