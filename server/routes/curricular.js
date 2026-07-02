
import { Router } from 'express';
import multer from 'multer';
import xlsx   from 'xlsx';
import db from '../db_curricular.js';
import { adminOrAnalyst } from '../middleware/roles.js';
import { validateExcelUpload, validateWorkbookShape } from '../utils/security.js';
import { auditEvent } from '../services/auditService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const error = validateExcelUpload(file);
    cb(error ? new Error(error) : null, !error);
  },
});

const router = Router();

const serverError = (res, e) => {
  console.error('[curricular]', e);
  res.status(500).json({ error: e.message });
};


router.get('/curricular/filtros', async (_req, res) => {
  try {
    const [[facultades], [carreras]] = await Promise.all([
      db.query(`
        SELECT DISTINCT f.id_facultad, f.nombre_facultad
        FROM facultad f
        JOIN carrera ca ON ca.id_facultad = f.id_facultad
        ORDER BY f.nombre_facultad
      `),
      db.query(`
        SELECT ca.id_carrera, ca.nombre_carrera, f.id_facultad, f.nombre_facultad
        FROM carrera ca
        JOIN facultad f ON ca.id_facultad = f.id_facultad
        ORDER BY ca.nombre_carrera
      `),
    ]);
    res.json({ facultades, carreras });
  } catch (e) { serverError(res, e); }
});


router.get('/curricular/mallas', async (req, res) => {
  try {
    const { carrera, facultad } = req.query;
    const where = [];
    const params = [];
    if (carrera)  { where.push('ca.nombre_carrera = ?');  params.push(carrera); }
    if (facultad) { where.push('f.nombre_facultad = ?');  params.push(facultad); }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.query(`
      SELECT mv.id_malla, mv.nombre_version, mv.anio_inicio, mv.es_vigente,
             ca.nombre_carrera, f.nombre_facultad,
             COUNT(c.id_curso) AS total_cursos
      FROM malla_version mv
      JOIN carrera  ca ON mv.id_carrera  = ca.id_carrera
      JOIN facultad f  ON ca.id_facultad = f.id_facultad
      LEFT JOIN curso c ON c.id_malla = mv.id_malla
      ${whereSQL}
      GROUP BY mv.id_malla, mv.nombre_version, mv.anio_inicio, mv.es_vigente,
               ca.nombre_carrera, f.nombre_facultad
      ORDER BY mv.es_vigente DESC, mv.anio_inicio DESC
    `, params);
    res.json(rows);
  } catch (e) { serverError(res, e); }
});


router.get('/curricular/kpis/:idMalla', async (req, res) => {
  try {
    const { idMalla } = req.params;
    const [[row]] = await db.query(`
      SELECT
        COUNT(c.id_curso)  AS total_cursos,
        SUM(CASE WHEN ac.estado_alineacion IN ('critico','riesgo') THEN 1 ELSE 0 END) AS en_riesgo,
        SUM(CASE WHEN ac.estado_alineacion = 'alineado'            THEN 1 ELSE 0 END) AS alineados,
        SUM(CASE WHEN ac.estado_alineacion = 'oportunidad'         THEN 1 ELSE 0 END) AS oportunidades,
        SUM(CASE WHEN ac.score_alineacion IS NOT NULL
                  AND ac.score_alineacion < 60                     THEN 1 ELSE 0 END) AS criticos,
        ROUND(AVG(ac.score_alineacion), 1) AS pct_alineacion_promedio
      FROM curso c
      LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
      WHERE c.id_malla = ?
    `, [idMalla]);

    const total    = Number(row.total_cursos) || 0;
    const enRiesgo = Number(row.en_riesgo)    || 0;
    const alineados = Number(row.alineados)   || 0;
    res.json({
      totalCursos:           total,
      pctRiesgo:             total ? Math.round(enRiesgo  / total * 100) : 0,
      pctAlineado:           total ? Math.round(alineados / total * 100) : 0,
      oportunidades:         Number(row.oportunidades) || 0,
      criticos:              Number(row.criticos)      || 0,
      pctAlineacionPromedio: row.pct_alineacion_promedio,
    });
  } catch (e) { serverError(res, e); }
});


router.get('/curricular/mapa/:idMalla', async (req, res) => {
  try {
    const { idMalla } = req.params;
    const [rows] = await db.query(`
      SELECT
        c.id_curso, c.nombre_curso, c.codigo_curso, c.numero_ciclo, c.nro_orden,
        c.creditos, c.tipo_curso, c.horas_teoria, c.horas_practica, c.horas_lab,
        c.prerequisito, c.clas_sunedu, c.mencion, c.creditos_minimos,
        ac.score_alineacion,  ac.estado_alineacion,
        ac.tendencias_impacto, ac.brechas_detectadas, ac.recomendaciones_ia,
        ac.analizado_en
      FROM curso c
      LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
      WHERE c.id_malla = ?
      ORDER BY c.numero_ciclo, COALESCE(c.nro_orden, 999), c.nombre_curso
    `, [idMalla]);


    const ciclosMap = {};
    for (const row of rows) {
      const n = row.numero_ciclo;
      if (!ciclosMap[n]) ciclosMap[n] = [];
      ciclosMap[n].push({
        id:               row.id_curso,
        nombre:           row.nombre_curso,
        codigo:           row.codigo_curso,
        ciclo:            n,
        orden:            row.nro_orden,
        creditos:         row.creditos,
        tipoCurso:        row.tipo_curso,
        horasTeoria:      row.horas_teoria,
        horasPractica:    row.horas_practica,
        horasLab:         row.horas_lab,
        prerequisito:     row.prerequisito,
        clasSunedu:       row.clas_sunedu,
        mencion:          row.mencion,
        creditosMinimos:  row.creditos_minimos,
        estado:           row.estado_alineacion || null,
        pct:              row.score_alineacion  ? Number(row.score_alineacion) : null,
        tendencias:       row.tendencias_impacto  ? JSON.parse(row.tendencias_impacto)  : [],
        gaps:             row.brechas_detectadas  ? JSON.parse(row.brechas_detectadas)  : [],
        recomendaciones:  row.recomendaciones_ia  ? JSON.parse(row.recomendaciones_ia)  : [],
        analizadoEn:      row.analizado_en,
      });
    }

    const ciclos = Object.entries(ciclosMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([num, cursos]) => ({ label: `Ciclo ${num}`, numero: Number(num), cursos }));

    res.json(ciclos);
  } catch (e) { serverError(res, e); }
});


router.post('/curricular/preview', adminOrAnalyst, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });
    const shapeError = validateWorkbookShape(rows);
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (!rows.length) return res.status(400).json({ error: 'Archivo vacío' });

    const headers   = Object.keys(rows[0]);
    const totalRows = rows.length;
    const carreras  = [...new Set(rows.map(r => String(r['CARRERA'] ?? r['Carrera'] ?? '')).filter(Boolean))];
    const facultades= [...new Set(rows.map(r => String(r['FACULTAD'] ?? r['Facultad'] ?? '')).filter(Boolean))];
    const preview   = rows.slice(0, 5).map(r => ({
      facultad: r['FACULTAD'] ?? r['Facultad'] ?? '',
      carrera:  r['CARRERA']  ?? r['Carrera']  ?? '',
      version:  r['VERSION_MALLA'] ?? r['Version_Malla'] ?? '',
      ciclo:    r['CICLO']    ?? r['Ciclo']    ?? '',
      curso:    r['NOMBRE_CURSO'] ?? r['Nombre_Curso'] ?? '',
    }));
    res.json({ totalRows, headers, facultades: facultades.length, carreras: carreras.length, preview });
  } catch (e) { serverError(res, e); }
});


router.post('/curricular/importar', adminOrAnalyst, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });
    const shapeError = validateWorkbookShape(rows);
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (!rows.length) return res.status(400).json({ error: 'Archivo vacío' });


    const col = (row, ...keys) => {
      for (const k of keys) {
        const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
      return null;
    };


    const facCache   = {};
    const carCache   = {};
    const mallaCache = {};

    let imported = 0, skipped = 0;
    const errors = [];


    const setVigente = async (idMalla, idCarrera) => {
      await db.query('UPDATE malla_version SET es_vigente=0 WHERE id_carrera=? AND id_malla!=?', [idCarrera, idMalla]);
      await db.query('UPDATE malla_version SET es_vigente=1 WHERE id_malla=?', [idMalla]);
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const nomFac     = col(row, 'FACULTAD', 'Facultad');
        const nomCar     = col(row, 'CARRERA',  'Carrera');
        const nomVersion = col(row, 'VERSION_MALLA', 'Version_Malla', 'VERSION MALLA');
        const anioInicio = parseInt(col(row, 'ANIO_INICIO', 'Anio_Inicio', 'AÑO_INICIO') ?? '0');
        const esVigente  = /^(si|sí|s|yes|1|true)$/i.test(col(row, 'ES_VIGENTE', 'Es_Vigente') ?? '') ? 1 : 0;
        const numeroCiclo= parseInt(col(row, 'CICLO', 'Ciclo') ?? '0');
        const nomCurso   = col(row, 'NOMBRE_CURSO', 'Nombre_Curso', 'NOMBRE CURSO');
        const tipoCurso  = col(row, 'TIPO_CURSO', 'Tipo_Curso', 'TIPO CURSO') ?? 'Obligatorio';
        const creditos   = parseInt(col(row, 'CREDITOS', 'Créditos', 'Creditos') ?? '0') || null;

        if (!nomFac || !nomCar || !nomVersion || !nomCurso || !numeroCiclo) { skipped++; continue; }


        const facKey = nomFac;
        if (!facCache[facKey]) {
          const [rows_] = await db.query('SELECT id_facultad FROM facultad WHERE nombre_facultad=? LIMIT 1', [nomFac]);
          if (rows_.length) {
            facCache[facKey] = rows_[0].id_facultad;
          } else {
            const [r] = await db.query('INSERT INTO facultad SET ?', { nombre_facultad: nomFac });
            facCache[facKey] = r.insertId;
          }
        }
        const idFac = facCache[facKey];


        const carKey = `${nomCar}|${idFac}`;
        if (!carCache[carKey]) {
          const [rows_] = await db.query('SELECT id_carrera FROM carrera WHERE nombre_carrera=? AND id_facultad=? LIMIT 1', [nomCar, idFac]);
          if (rows_.length) {
            carCache[carKey] = rows_[0].id_carrera;
          } else {
            const [r] = await db.query('INSERT INTO carrera SET ?', { nombre_carrera: nomCar, id_facultad: idFac });
            carCache[carKey] = r.insertId;
          }
        }
        const idCar = carCache[carKey];


        const mallaKey = `${idCar}|${nomVersion}`;
        if (!mallaCache[mallaKey]) {
          const [rows_] = await db.query('SELECT id_malla FROM malla_version WHERE id_carrera=? AND nombre_version=? LIMIT 1', [idCar, nomVersion]);
          if (rows_.length) {
            mallaCache[mallaKey] = rows_[0].id_malla;
          } else {
            const [r] = await db.query('INSERT INTO malla_version SET ?', {
              id_carrera: idCar, nombre_version: nomVersion,
              anio_inicio: anioInicio || new Date().getFullYear(), es_vigente: esVigente,
              fuente_carga: 'EXCEL',
            });
            mallaCache[mallaKey] = r.insertId;
            if (esVigente) await setVigente(r.insertId, idCar);
          }
        }
        const idMalla = mallaCache[mallaKey];


        const [existCurso] = await db.query(
          'SELECT id_curso FROM curso WHERE id_malla=? AND nombre_curso=? AND numero_ciclo=? LIMIT 1',
          [idMalla, nomCurso, numeroCiclo]
        );
        if (existCurso.length) {
          await db.query('UPDATE curso SET creditos=?, tipo_curso=? WHERE id_curso=?',
            [creditos, tipoCurso, existCurso[0].id_curso]);
        } else {
          await db.query('INSERT INTO curso SET ?', {
            id_malla: idMalla, nombre_curso: nomCurso,
            numero_ciclo: numeroCiclo, creditos, tipo_curso: tipoCurso,
          });
        }

        imported++;
      } catch (rowErr) {
        errors.push({ fila: i + 2, error: rowErr.message });
        if (errors.length >= 20) break;
      }
    }

    await auditEvent(req, {
      evento: 'importacion_curricular',
      accion: 'importar',
      modulo: 'curricular',
      entidad: 'malla_curricular',
      detalle: `Importacion curricular: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, skipped, total: rows.length, errors: errors.length },
    });
    res.json({ success: true, imported, skipped, total: rows.length, errors });
  } catch (e) { serverError(res, e); }
});

export default router;
