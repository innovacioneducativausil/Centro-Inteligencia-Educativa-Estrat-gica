import { Router } from 'express';
import { adminOrAnalyst } from '../middleware/roles.js';
import { serverError } from '../middleware/errorHandler.js';
import { auditEvent } from '../services/auditService.js';
import { analizarImpacto } from '../services/motorImpactoCurricularService.js';
import { probarProveedores } from '../services/llmProviderService.js';
import {
  iniciarJob, estadoJob,
  iniciarJobMapa, estadoJobMapa,
  iniciarJobLote, estadoJobLote,
} from '../services/analisisImpactoJobs.js';
import { rankingEvidenciaCarreras } from '../services/resumenEvidenciaService.js';
import { analizarMapaCurricular, getEvidenciaCurso, limpiarAnalisisSinEvidencia, migrarSumillasCompetenciasHuerfanas } from '../services/analisisCurricularService.js';
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

// Corrida en segundo plano: responde 202 al instante y la pantalla consulta el
// avance con el endpoint de estado (ver services/analisisImpactoJobs.js).
router.post('/curricular/analizar-impacto-async/:idCarrera', adminOrAnalyst, async (req, res) => {
  try {
    const { id_malla_version, pesos } = req.body;
    if (!id_malla_version) return res.status(400).json({ error: 'id_malla_version es requerido' });

    const usuario = req.user?.nombre || req.user?.email || 'motor_automatico';
    const { iniciado, job } = iniciarJob(req.params.idCarrera, id_malla_version, pesos, usuario);
    res.status(iniciado ? 202 : 409).json(iniciado ? job : { ...job, error: 'Ya hay un analisis en curso para esta malla.' });
  } catch (err) {
    serverError(res, err, 'POST /curricular/analizar-impacto-async');
  }
});

router.get('/curricular/analizar-impacto-estado/:idCarrera', async (req, res) => {
  try {
    if (!req.query.id_malla) return res.status(400).json({ error: 'id_malla es requerido' });
    res.json(estadoJob(req.params.idCarrera, req.query.id_malla));
  } catch (err) {
    serverError(res, err, 'GET /curricular/analizar-impacto-estado');
  }
});

// ---- Mapa de estados de Vision 360 en segundo plano ----
router.post('/curricular/analizar-mapa-async/:idCarrera', adminOrAnalyst, async (req, res) => {
  try {
    const { id_malla_version } = req.body;
    if (!id_malla_version) return res.status(400).json({ error: 'id_malla_version es requerido' });
    const usuario = req.user?.nombre || req.user?.email || 'motor_automatico';
    const { iniciado, job } = iniciarJobMapa(req.params.idCarrera, id_malla_version, usuario);
    res.status(iniciado ? 202 : 409).json(iniciado ? job : { ...job, error: 'Ya hay un analisis del mapa en curso para esta malla.' });
  } catch (err) {
    serverError(res, err, 'POST /curricular/analizar-mapa-async');
  }
});

router.get('/curricular/analizar-mapa-estado/:idCarrera', async (req, res) => {
  try {
    if (!req.query.id_malla) return res.status(400).json({ error: 'id_malla es requerido' });
    res.json(estadoJobMapa(req.params.idCarrera, req.query.id_malla));
  } catch (err) {
    serverError(res, err, 'GET /curricular/analizar-mapa-estado');
  }
});

// Cuanta evidencia tiene cada carrera (malla vigente): para elegir donde el mapa
// de estados se va a ver mejor. Solo lectura.
router.get('/curricular/ranking-evidencia', adminOrAnalyst, async (_req, res) => {
  try {
    res.json(await rankingEvidenciaCarreras());
  } catch (err) {
    serverError(res, err, 'GET /curricular/ranking-evidencia');
  }
});

// Lote: corre el mapa de varias carreras una tras otra. Body: { items: [{id_carrera, id_malla, carrera?}] }
// o { top: N } para tomar las N carreras con mas cursos con evidencia.
router.post('/curricular/analizar-mapa-lote', adminOrAnalyst, async (req, res) => {
  try {
    let items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) {
      const top = Math.min(Math.max(Number(req.body?.top) || 0, 1), 40);
      const ranking = await rankingEvidenciaCarreras();
      items = ranking.filter(r => r.cursos_con_evidencia > 0).slice(0, top);
    }
    items = items.filter(it => it?.id_carrera && it?.id_malla).slice(0, 40);
    if (!items.length) return res.status(422).json({ error: 'No hay carreras con evidencia para analizar.' });

    const usuario = req.user?.nombre || req.user?.email || 'motor_automatico';
    const { iniciado, job } = iniciarJobLote(items, usuario);
    res.status(iniciado ? 202 : 409).json({
      ...(iniciado ? job : { ...job, error: 'Ya hay un lote en curso.' }),
      carreras: items.map(i => i.carrera || i.id_carrera),
    });
  } catch (err) {
    serverError(res, err, 'POST /curricular/analizar-mapa-lote');
  }
});

router.get('/curricular/analizar-mapa-lote-estado', async (_req, res) => {
  try {
    res.json(estadoJobLote());
  } catch (err) {
    serverError(res, err, 'GET /curricular/analizar-mapa-lote-estado');
  }
});

// Diagnostico del proveedor de IA: no corre ningun analisis ni escribe en BD,
// solo hace una llamada minima por key y devuelve el estado (sin las keys).
router.get('/curricular/diagnostico-llm', adminOrAnalyst, async (_req, res) => {
  try {
    res.json(await probarProveedores());
  } catch (err) {
    serverError(res, err, 'GET /curricular/diagnostico-llm');
  }
});

router.post('/curricular/analizar-mapa/:idCarrera', adminOrAnalyst, async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { id_malla_version } = req.body;
    if (!id_malla_version) return res.status(400).json({ error: 'id_malla_version es requerido' });

    const result = await analizarMapaCurricular(Number(idCarrera), Number(id_malla_version));
    if (!result.ok) return res.status(422).json({ error: result.error });
    res.json(result);
  } catch (err) {
    serverError(res, err, 'POST /curricular/analizar-mapa');
  }
});

router.post('/curricular/migrar-sumillas-huerfanas', adminOrAnalyst, async (req, res) => {
  try {
    const result = await migrarSumillasCompetenciasHuerfanas();
    await auditEvent(req, {
      evento: 'migracion_sumillas_huerfanas',
      accion: 'migrar_sumillas_competencias',
      modulo: 'curricular',
      detalle: { carreras: result.carreras },
    });
    res.json(result);
  } catch (err) {
    serverError(res, err, 'POST /curricular/migrar-sumillas-huerfanas');
  }
});

router.post('/curricular/limpiar-analisis-obsoletos', adminOrAnalyst, async (req, res) => {
  try {
    const result = await limpiarAnalisisSinEvidencia();
    await auditEvent(req, {
      evento: 'limpieza_analisis_obsoletos',
      accion: 'limpiar_analisis_obsoletos',
      modulo: 'curricular',
      detalle: { totalRemovidos: result.totalRemovidos, carreras: result.carreras.length },
    });
    res.json(result);
  } catch (err) {
    serverError(res, err, 'POST /curricular/limpiar-analisis-obsoletos');
  }
});

router.get('/curricular/mapa/curso/:idCurso/evidencia', async (req, res) => {
  try {
    const data = await getEvidenciaCurso(Number(req.params.idCurso));
    if (!data) return res.status(404).json({ error: 'Curso no encontrado' });
    res.json(data);
  } catch (err) {
    serverError(res, err, 'GET /curricular/mapa/curso/:idCurso/evidencia');
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
