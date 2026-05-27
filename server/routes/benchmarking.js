// server/routes/benchmarking.js
// Módulo: Benchmarking Universitario (Competencia Directa + Referentes Internacionales)
// Tablas en: empleabilidad_usil
// Auto-crea tablas al arrancar (mismo patrón que mercadoLaboral.js)

import { Router } from 'express';
import db from '../db_empl.js';
import { adminOrAnalyst } from '../middleware/roles.js';
import { serverError } from '../middleware/errorHandler.js';
import { scraperBatch, cargarTextoManual } from '../services/scrapingService.js';
import { normalizarPrograma } from '../services/normalizacionIAService.js';

const router = Router();

let schemaReady = null;

async function ensureBenchmarkingSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS universidad_benchmark (
        id_universidad_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre_universidad VARCHAR(220) NOT NULL,
        pais VARCHAR(100) NOT NULL DEFAULT 'Peru',
        ciudad VARCHAR(120) NULL,
        tipo_benchmark ENUM('competencia_directa','referente_internacional') NOT NULL,
        sitio_web VARCHAR(500) NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tipo_benchmark (tipo_benchmark)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS programa_benchmark (
        id_programa_benchmark    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_universidad_benchmark INT UNSIGNED NOT NULL,
        nombre_programa          VARCHAR(300) NOT NULL,
        url_programa             VARCHAR(1000) NULL,
        carrera_equivalente_id   INT UNSIGNED NULL,
        modalidad                VARCHAR(100) NULL,
        duracion                 VARCHAR(100) NULL,
        perfil_egreso_texto      MEDIUMTEXT NULL,
        plan_estudios_texto      MEDIUMTEXT NULL,
        fuente_texto_original    MEDIUMTEXT NULL,
        fecha_captura            DATETIME NULL,
        estado_extraccion        ENUM('pendiente','procesado','error','verificado') NOT NULL DEFAULT 'pendiente',
        observaciones            TEXT NULL,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_pb_univ (id_universidad_benchmark),
        CONSTRAINT fk_pb_univ FOREIGN KEY (id_universidad_benchmark)
          REFERENCES universidad_benchmark(id_universidad_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS curso_benchmark (
        id_curso_benchmark          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark       INT UNSIGNED NOT NULL,
        nombre_curso                VARCHAR(300) NOT NULL,
        ciclo                       VARCHAR(50) NULL,
        area_formacion              VARCHAR(180) NULL,
        descripcion_curso           TEXT NULL,
        competencias_detectadas_json JSON NULL,
        tecnologias_detectadas_json  JSON NULL,
        fuente_url                   VARCHAR(1000) NULL,
        created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_cb_prog (id_programa_benchmark),
        CONSTRAINT fk_cb_prog FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS competencia_benchmark (
        id_competencia_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark    INT UNSIGNED NOT NULL,
        nombre_competencia       VARCHAR(300) NOT NULL,
        descripcion_competencia  TEXT NULL,
        tipo_competencia         ENUM('tecnica','blanda','investigacion','gestion','digital','otro') NOT NULL DEFAULT 'otro',
        evidencia_textual        TEXT NULL,
        fuente_url               VARCHAR(1000) NULL,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_compb_prog (id_programa_benchmark),
        CONSTRAINT fk_compb_prog FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const sql of stmts) await db.query(sql);
    console.log('✅ Schema benchmarking listo en empleabilidad_usil');
  })();
  return schemaReady;
}

router.use(async (req, res, next) => {
  try { await ensureBenchmarkingSchema(); next(); } catch (e) { next(e); }
});

// ── GET /api/mercado-laboral/benchmarking/universidades ─────────────────────
router.get('/mercado-laboral/benchmarking/universidades', async (req, res) => {
  try {
    const { tipo } = req.query;
    const where  = ['activo = 1'];
    const params = [];
    if (tipo && ['competencia_directa','referente_internacional'].includes(tipo)) {
      where.push('tipo_benchmark = ?'); params.push(tipo);
    }
    const [rows] = await db.query(
      `SELECT * FROM universidad_benchmark WHERE ${where.join(' AND ')} ORDER BY tipo_benchmark, nombre_universidad`,
      params
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/universidades'); }
});

// ── POST /api/mercado-laboral/benchmarking/universidades ────────────────────
router.post('/mercado-laboral/benchmarking/universidades', adminOrAnalyst, async (req, res) => {
  try {
    const { nombre_universidad, pais = 'Peru', ciudad, tipo_benchmark, sitio_web } = req.body;
    if (!nombre_universidad?.trim()) return res.status(400).json({ error: 'nombre_universidad es requerido' });
    if (!['competencia_directa','referente_internacional'].includes(tipo_benchmark)) {
      return res.status(400).json({ error: 'tipo_benchmark inválido' });
    }
    const [r] = await db.query(
      'INSERT INTO universidad_benchmark (nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web) VALUES (?,?,?,?,?)',
      [nombre_universidad.trim(), pais, ciudad ?? null, tipo_benchmark, sitio_web ?? null]
    );
    res.status(201).json({ id: r.insertId, nombre_universidad: nombre_universidad.trim() });
  } catch (e) { serverError(res, e, 'POST /benchmarking/universidades'); }
});

// ── PUT /api/mercado-laboral/benchmarking/universidades/:id ─────────────────
router.put('/mercado-laboral/benchmarking/universidades/:id', adminOrAnalyst, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web, activo } = req.body;
    const sets = []; const params = [];
    if (nombre_universidad !== undefined) { sets.push('nombre_universidad=?'); params.push(nombre_universidad); }
    if (pais               !== undefined) { sets.push('pais=?');               params.push(pais); }
    if (ciudad             !== undefined) { sets.push('ciudad=?');             params.push(ciudad); }
    if (tipo_benchmark     !== undefined) { sets.push('tipo_benchmark=?');     params.push(tipo_benchmark); }
    if (sitio_web          !== undefined) { sets.push('sitio_web=?');          params.push(sitio_web); }
    if (activo             !== undefined) { sets.push('activo=?');             params.push(activo ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(id);
    await db.query(`UPDATE universidad_benchmark SET ${sets.join(',')} WHERE id_universidad_benchmark=?`, params);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'PUT /benchmarking/universidades/:id'); }
});

// ── DELETE /api/mercado-laboral/benchmarking/universidades/:id ──────────────
router.delete('/mercado-laboral/benchmarking/universidades/:id', adminOrAnalyst, async (req, res) => {
  try {
    await db.query('UPDATE universidad_benchmark SET activo=0 WHERE id_universidad_benchmark=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'DELETE /benchmarking/universidades/:id'); }
});

// ── GET /api/mercado-laboral/benchmarking/programas ─────────────────────────
router.get('/mercado-laboral/benchmarking/programas', async (req, res) => {
  try {
    const { id_universidad, carrera_id, estado } = req.query;
    const where = []; const params = [];
    if (id_universidad) { where.push('pb.id_universidad_benchmark=?'); params.push(id_universidad); }
    if (carrera_id)     { where.push('pb.carrera_equivalente_id=?');   params.push(carrera_id); }
    if (estado)         { where.push('pb.estado_extraccion=?');         params.push(estado); }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT pb.*, ub.nombre_universidad, ub.tipo_benchmark, ub.pais
       FROM programa_benchmark pb
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       ${whereSQL}
       ORDER BY ub.tipo_benchmark, ub.nombre_universidad, pb.nombre_programa`,
      params
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas'); }
});

// ── POST /api/mercado-laboral/benchmarking/programas ────────────────────────
router.post('/mercado-laboral/benchmarking/programas', adminOrAnalyst, async (req, res) => {
  try {
    const { id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, modalidad, duracion } = req.body;
    if (!id_universidad_benchmark || !nombre_programa?.trim()) {
      return res.status(400).json({ error: 'id_universidad_benchmark y nombre_programa son requeridos' });
    }
    const [r] = await db.query(
      `INSERT INTO programa_benchmark (id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, modalidad, duracion)
       VALUES (?,?,?,?,?,?)`,
      [id_universidad_benchmark, nombre_programa.trim(), url_programa ?? null,
       carrera_equivalente_id ?? null, modalidad ?? null, duracion ?? null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { serverError(res, e, 'POST /benchmarking/programas'); }
});

// ── GET /api/mercado-laboral/benchmarking/programas/:id ─────────────────────
router.get('/mercado-laboral/benchmarking/programas/:id', async (req, res) => {
  try {
    const [[prog]] = await db.query(
      `SELECT pb.*, ub.nombre_universidad, ub.tipo_benchmark, ub.pais
       FROM programa_benchmark pb
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       WHERE pb.id_programa_benchmark = ?`,
      [req.params.id]
    );
    if (!prog) return res.status(404).json({ error: 'Programa no encontrado' });
    const [competencias] = await db.query(
      'SELECT * FROM competencia_benchmark WHERE id_programa_benchmark=? ORDER BY tipo_competencia, nombre_competencia',
      [req.params.id]
    );
    const [cursos] = await db.query(
      'SELECT * FROM curso_benchmark WHERE id_programa_benchmark=? ORDER BY ciclo, nombre_curso',
      [req.params.id]
    );
    res.json({ programa: prog, competencias, cursos });
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas/:id'); }
});

// ── POST /api/mercado-laboral/benchmarking/scraping ─────────────────────────
router.post('/mercado-laboral/benchmarking/scraping', adminOrAnalyst, async (req, res) => {
  try {
    const { ids, texto_manual, url_origen, id_programa } = req.body;

    if (texto_manual && id_programa) {
      const r = await cargarTextoManual(id_programa, texto_manual, url_origen);
      return res.json(r);
    }

    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'Envía "ids" (array de id_programa_benchmark) o "texto_manual" + "id_programa"' });
    }
    if (ids.length > 10) return res.status(400).json({ error: 'Máximo 10 programas por lote' });

    const results = await scraperBatch(ids);
    res.json({ results });
  } catch (e) { serverError(res, e, 'POST /benchmarking/scraping'); }
});

// ── POST /api/mercado-laboral/benchmarking/normalizar-ia ────────────────────
router.post('/mercado-laboral/benchmarking/normalizar-ia', adminOrAnalyst, async (req, res) => {
  try {
    const { id_programa } = req.body;
    if (!id_programa) return res.status(400).json({ error: 'id_programa es requerido' });
    const result = await normalizarPrograma(id_programa);
    res.json(result);
  } catch (e) { serverError(res, e, 'POST /benchmarking/normalizar-ia'); }
});

// ── GET /api/mercado-laboral/benchmarking/comparar/:idCarrera ───────────────
router.get('/mercado-laboral/benchmarking/comparar/:idCarrera', async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const [rows] = await db.query(
      `SELECT cb.nombre_competencia, cb.tipo_competencia,
              pb.nombre_programa, pb.url_programa, pb.estado_extraccion, pb.fecha_captura,
              ub.nombre_universidad, ub.pais, ub.tipo_benchmark
       FROM competencia_benchmark cb
       JOIN programa_benchmark pb ON pb.id_programa_benchmark = cb.id_programa_benchmark
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       WHERE pb.carrera_equivalente_id = ? AND ub.activo = 1
       ORDER BY ub.tipo_benchmark, ub.nombre_universidad, cb.tipo_competencia, cb.nombre_competencia`,
      [idCarrera]
    );
    const [cursos] = await db.query(
      `SELECT cu.nombre_curso, cu.area_formacion,
              pb.nombre_programa,
              ub.nombre_universidad, ub.tipo_benchmark
       FROM curso_benchmark cu
       JOIN programa_benchmark pb ON pb.id_programa_benchmark = cu.id_programa_benchmark
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       WHERE pb.carrera_equivalente_id = ? AND ub.activo = 1
       ORDER BY ub.tipo_benchmark, ub.nombre_universidad, cu.area_formacion`,
      [idCarrera]
    );
    res.json({ competencias: rows, cursos });
  } catch (e) { serverError(res, e, 'GET /benchmarking/comparar/:idCarrera'); }
});

// ── GET /api/mercado-laboral/benchmarking/comparar/:idCarrera/:tipoBenchmark ─
router.get('/mercado-laboral/benchmarking/comparar/:idCarrera/:tipoBenchmark', async (req, res) => {
  try {
    const { idCarrera, tipoBenchmark } = req.params;
    if (!['competencia_directa','referente_internacional'].includes(tipoBenchmark)) {
      return res.status(400).json({ error: 'tipoBenchmark inválido' });
    }
    const [competencias] = await db.query(
      `SELECT cb.nombre_competencia, cb.tipo_competencia, cb.evidencia_textual,
              pb.nombre_programa, pb.url_programa, pb.estado_extraccion, pb.fecha_captura,
              ub.nombre_universidad, ub.pais, ub.tipo_benchmark
       FROM competencia_benchmark cb
       JOIN programa_benchmark pb ON pb.id_programa_benchmark = cb.id_programa_benchmark
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       WHERE pb.carrera_equivalente_id = ? AND ub.tipo_benchmark = ? AND ub.activo = 1
       ORDER BY ub.nombre_universidad, cb.tipo_competencia, cb.nombre_competencia`,
      [idCarrera, tipoBenchmark]
    );
    const [programas] = await db.query(
      `SELECT pb.id_programa_benchmark, pb.nombre_programa, pb.url_programa,
              pb.estado_extraccion, pb.fecha_captura, pb.duracion, pb.modalidad,
              ub.nombre_universidad, ub.pais, ub.tipo_benchmark,
              COUNT(cb.id_competencia_benchmark) AS total_competencias,
              COUNT(DISTINCT cu.id_curso_benchmark) AS total_cursos
       FROM programa_benchmark pb
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       LEFT JOIN competencia_benchmark cb ON cb.id_programa_benchmark = pb.id_programa_benchmark
       LEFT JOIN curso_benchmark cu ON cu.id_programa_benchmark = pb.id_programa_benchmark
       WHERE pb.carrera_equivalente_id = ? AND ub.tipo_benchmark = ? AND ub.activo = 1
       GROUP BY pb.id_programa_benchmark, pb.nombre_programa, pb.url_programa,
                pb.estado_extraccion, pb.fecha_captura, pb.duracion, pb.modalidad,
                ub.nombre_universidad, ub.pais, ub.tipo_benchmark
       ORDER BY ub.nombre_universidad`,
      [idCarrera, tipoBenchmark]
    );
    res.json({ programas, competencias, tipo: tipoBenchmark });
  } catch (e) { serverError(res, e, 'GET /benchmarking/comparar/:idCarrera/:tipoBenchmark'); }
});

export default router;
