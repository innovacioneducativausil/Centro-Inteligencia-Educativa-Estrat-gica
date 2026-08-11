import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { randomUUID } from 'crypto';
import { adminOrAnalyst } from '../middleware/roles.js';
import { validateExcelUpload, validateWorkbookShape } from '../utils/security.js';
import { auditEvent } from '../services/auditService.js';
import { serverError } from '../middleware/errorHandler.js';
import {
  createSilabo,
  ensureSilaboSupport,
  getCursoById,
  getCurricularFiltros,
  getMallaKpis,
  getMallaMapaRows,
  getMallaVision360,
  getMallasCurriculares,
  getSilaboById,
  getSilabos,
  importCurricularRows,
  searchCursos,
  updateSilabo,
  updateSilaboEstado,
} from '../repositories/curricular/curricularRepository.js';

export { ensureSilaboSupport };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const error = validateExcelUpload(file);
    cb(error ? new Error(error) : null, !error);
  },
});

const router = Router();

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function workbookRows(file) {
  const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: null, raw: false });
}

function rowColumn(row, ...keys) {
  for (const key of keys) {
    const value = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    if (value !== null && value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

router.get('/curricular/filtros', async (_req, res) => {
  try {
    res.json(await getCurricularFiltros());
  } catch (err) {
    serverError(res, err, 'GET /curricular/filtros');
  }
});

router.get('/curricular/mallas', async (req, res) => {
  try {
    res.json(await getMallasCurriculares(req.query));
  } catch (err) {
    serverError(res, err, 'GET /curricular/mallas');
  }
});

router.get('/curricular/kpis/:idMalla', async (req, res) => {
  try {
    const row = await getMallaKpis(req.params.idMalla);
    const total = Number(row.total_cursos) || 0;
    const enRiesgo = Number(row.en_riesgo) || 0;
    const alineados = Number(row.alineados) || 0;
    res.json({
      totalCursos: total,
      pctRiesgo: total ? Math.round(enRiesgo / total * 100) : 0,
      pctAlineado: total ? Math.round(alineados / total * 100) : 0,
      oportunidades: Number(row.oportunidades) || 0,
      criticos: Number(row.criticos) || 0,
      pctAlineacionPromedio: row.pct_alineacion_promedio,
    });
  } catch (err) {
    serverError(res, err, 'GET /curricular/kpis/:idMalla');
  }
});

router.get('/curricular/mapa/:idMalla', async (req, res) => {
  try {
    const rows = await getMallaMapaRows(req.params.idMalla);
    const ciclosMap = {};
    for (const row of rows) {
      const numeroCiclo = row.numero_ciclo;
      if (!ciclosMap[numeroCiclo]) ciclosMap[numeroCiclo] = [];
      ciclosMap[numeroCiclo].push({
        id: row.id_curso,
        nombre: row.nombre_curso,
        codigo: row.codigo_curso,
        ciclo: numeroCiclo,
        orden: row.nro_orden,
        creditos: row.creditos,
        tipoCurso: row.tipo_curso,
        horasTeoria: row.horas_teoria,
        horasPractica: row.horas_practica,
        horasLab: row.horas_lab,
        prerequisito: row.prerequisito,
        clasSunedu: row.clas_sunedu,
        mencion: row.mencion,
        creditosMinimos: row.creditos_minimos,
        estado: row.estado_alineacion || null,
        pct: row.score_alineacion ? Number(row.score_alineacion) : null,
        tendencias: parseJsonArray(row.tendencias_impacto),
        gaps: parseJsonArray(row.brechas_detectadas),
        recomendaciones: parseJsonArray(row.recomendaciones_ia),
        analizadoEn: row.analizado_en,
      });
    }

    const ciclos = Object.entries(ciclosMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([num, cursos]) => ({ label: `Ciclo ${num}`, numero: Number(num), cursos }));

    res.json(ciclos);
  } catch (err) {
    serverError(res, err, 'GET /curricular/mapa/:idMalla');
  }
});

router.get('/curricular/mallas/:idMalla/vision360', async (req, res) => {
  try {
    const data = await getMallaVision360(req.params.idMalla);
    if (!data) return res.status(404).json({ error: 'Malla no encontrada' });
    res.json(data);
  } catch (err) {
    serverError(res, err, 'GET /curricular/mallas/:idMalla/vision360');
  }
});

router.post('/curricular/preview', adminOrAnalyst, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio archivo' });
    const rows = workbookRows(req.file);
    const shapeError = validateWorkbookShape(rows);
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (!rows.length) return res.status(400).json({ error: 'Archivo vacio' });

    const headers = Object.keys(rows[0]);
    const carreras = [...new Set(rows.map(r => String(r.CARRERA ?? r.Carrera ?? '')).filter(Boolean))];
    const facultades = [...new Set(rows.map(r => String(r.FACULTAD ?? r.Facultad ?? '')).filter(Boolean))];
    const preview = rows.slice(0, 5).map(r => ({
      facultad: r.FACULTAD ?? r.Facultad ?? '',
      carrera: r.CARRERA ?? r.Carrera ?? '',
      version: r.VERSION_MALLA ?? r.Version_Malla ?? '',
      ciclo: r.CICLO ?? r.Ciclo ?? '',
      curso: r.NOMBRE_CURSO ?? r.Nombre_Curso ?? '',
    }));
    res.json({ totalRows: rows.length, headers, facultades: facultades.length, carreras: carreras.length, preview });
  } catch (err) {
    serverError(res, err, 'POST /curricular/preview');
  }
});

router.post('/curricular/importar', adminOrAnalyst, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio archivo' });
    const rows = workbookRows(req.file);
    const shapeError = validateWorkbookShape(rows);
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (!rows.length) return res.status(400).json({ error: 'Archivo vacio' });

    const { imported, skipped, errors } = await importCurricularRows(rows, rowColumn);

    await auditEvent(req, {
      evento: 'importacion_curricular',
      accion: 'importar',
      modulo: 'curricular',
      entidad: 'malla_curricular',
      detalle: `Importacion curricular: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, skipped, total: rows.length, errors: errors.length },
    });

    res.json({ success: true, imported, skipped, total: rows.length, errors });
  } catch (err) {
    serverError(res, err, 'POST /curricular/importar');
  }
});

router.get('/curricular/silabos', adminOrAnalyst, async (req, res) => {
  try {
    res.json({ data: await getSilabos({ q: String(req.query.q || '').trim() }) });
  } catch (err) {
    serverError(res, err, 'GET /curricular/silabos');
  }
});

router.get('/curricular/cursos-buscar', adminOrAnalyst, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ data: [] });
    res.json({ data: await searchCursos(q) });
  } catch (err) {
    serverError(res, err, 'GET /curricular/cursos-buscar');
  }
});

router.post('/curricular/silabos', adminOrAnalyst, async (req, res) => {
  try {
    const { idCurso, titulo, urlArchivo, contenido } = req.body;
    if (!idCurso || !titulo?.trim()) return res.status(400).json({ error: 'Curso y titulo son requeridos.' });
    const curso = await getCursoById(idCurso);
    if (!curso) return res.status(400).json({ error: 'Curso no encontrado.' });

    const id = randomUUID();
    const tituloFinal = titulo.trim();
    await createSilabo({
      id,
      idCurso,
      titulo: tituloFinal,
      urlArchivo: urlArchivo?.trim() || null,
      contenido: contenido?.trim() || null,
    });

    await auditEvent(req, {
      evento: 'silabo_creado',
      accion: 'crear_silabo',
      modulo: 'curricular',
      entidad: 'silabo',
      entidadId: id,
      elementoTitulo: tituloFinal,
      detalle: `Silabo creado: ${tituloFinal}`,
    });
    res.status(201).json({ id });
  } catch (err) {
    serverError(res, err, 'POST /curricular/silabos');
  }
});

router.put('/curricular/silabos/:id', adminOrAnalyst, async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, urlArchivo, contenido } = req.body;
    const existing = await getSilaboById(id);
    if (!existing) return res.status(404).json({ error: 'Silabo no encontrado.' });
    if (!titulo?.trim()) return res.status(400).json({ error: 'Titulo es requerido.' });

    const tituloFinal = titulo.trim();
    await updateSilabo({
      id,
      titulo: tituloFinal,
      urlArchivo: urlArchivo?.trim() || null,
      contenido: contenido?.trim() || null,
    });
    await auditEvent(req, {
      evento: 'silabo_actualizado',
      accion: 'editar_silabo',
      modulo: 'curricular',
      entidad: 'silabo',
      entidadId: id,
      elementoTitulo: tituloFinal,
      detalle: `Silabo actualizado: ${tituloFinal}`,
    });
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'PUT /curricular/silabos/:id');
  }
});

router.patch('/curricular/silabos/:id/estado', adminOrAnalyst, async (req, res) => {
  try {
    const { id } = req.params;
    const activo = req.body.activo ? 1 : 0;
    const existing = await getSilaboById(id);
    if (!existing) return res.status(404).json({ error: 'Silabo no encontrado.' });

    await updateSilaboEstado({ id, activo });
    await auditEvent(req, {
      evento: 'silabo_estado',
      accion: activo ? 'activar_silabo' : 'archivar_silabo',
      modulo: 'curricular',
      entidad: 'silabo',
      entidadId: id,
      elementoTitulo: existing.titulo,
      detalle: `Silabo ${activo ? 'activado' : 'archivado'}: ${existing.titulo}`,
    });
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'PATCH /curricular/silabos/:id/estado');
  }
});

export default router;
