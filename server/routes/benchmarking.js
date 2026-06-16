// server/routes/benchmarking.js
// Módulo: Benchmarking Universitario (Competencia Directa + Referentes Internacionales)
// Tablas en: empleabilidad_usil
// Auto-crea tablas al arrancar (mismo patrón que mercadoLaboral.js)

import { Router } from 'express';
import db from '../db_empl.js';
import dbCurricular from '../db_curricular.js';
import { adminOnly } from '../middleware/roles.js';
import { serverError } from '../middleware/errorHandler.js';
import { scraperBatch, cargarTextoManual } from '../services/scrapingService.js';
import { normalizarPrograma } from '../services/normalizacionIAService.js';
import { BENCHMARK_SEED_BY_CAREER, BENCHMARK_UNIVERSITIES } from '../data/benchmarkingSeed.js';

const router = Router();

let schemaReady = null;
const TIPOS_BENCHMARK = ['competencia_directa','referente_nacional','referente_internacional','referente_tecnologico'];

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ñ/g, 'N')
    .replace(/ñ/g, 'n')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function resolveBenchmarkSeed(careerName = '') {
  const name = normalizeName(careerName);
  const exact = BENCHMARK_SEED_BY_CAREER[name];
  if (exact) return { seed: exact, match: 'exacto' };

  const has = (...terms) => terms.some(term => name.includes(term));
  if (has('MEDICINA', 'ENFERMERIA', 'NUTRICION', 'PSICOLOGIA', 'TECNOLOGIA MEDICA', 'TERAPIA FISICA')) {
    return { seed: { direct: ['UPCH', 'UCSUR', 'UPC', 'USMP', 'UNMSM'], international: ['HARVARD', 'STANFORD', 'TEC'] }, match: 'area_salud' };
  }
  if (has('INGENIERIA', 'CIENCIA DE DATOS', 'CIBERSEGURIDAD', 'SOFTWARE', 'SISTEMAS', 'MECATRONICA')) {
    return { seed: { direct: ['UPC', 'UTEC', 'PUCP', 'ULIMA', 'UPN', 'UTP'], international: ['MIT', 'STANFORD', 'CALTECH'] }, match: 'area_ingenieria' };
  }
  if (has('ADMINISTRACION', 'BUSINESS', 'MARKETING', 'ECONOMIA', 'FINANZAS', 'NEGOCIOS')) {
    return { seed: { direct: ['UPC', 'ULIMA', 'UP', 'ESAN', 'UDEP'], international: ['TEC', 'USFQ'] }, match: 'area_negocios' };
  }
  if (has('TURISMO', 'HOTELERA', 'GASTRONOMIA', 'CULINARIO')) {
    return { seed: { direct: ['UPC', 'ULIMA', 'UDEP', 'UTP'], international: ['TEC', 'USFQ'] }, match: 'area_hospitalidad' };
  }
  if (has('ARQUITECTURA')) {
    return { seed: { direct: ['UPC', 'PUCP', 'ULIMA', 'URP', 'UNI', 'UPN', 'UTP', 'UCSUR'], international: ['MIT', 'HARVARD', 'TEC'] }, match: 'area_arquitectura' };
  }
  if (has('DERECHO', 'COMUNICACIONES', 'RELACIONES INTERNACIONALES', 'EDUCACION', 'MUSICA', 'ARTE')) {
    return { seed: { direct: ['PUCP', 'ULIMA', 'UPC', 'UDEP'], international: ['TEC', 'USFQ'] }, match: 'area_humanidades' };
  }

  return { seed: { direct: ['UPC', 'ULIMA', 'PUCP', 'UDEP'], international: ['TEC', 'USFQ'] }, match: 'fallback_general' };
}

async function ensureBenchmarkingSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS universidad_benchmark (
        id_universidad_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre_universidad VARCHAR(220) NOT NULL,
        pais VARCHAR(100) NOT NULL DEFAULT 'Peru',
        ciudad VARCHAR(120) NULL,
        tipo_benchmark ENUM('competencia_directa','referente_nacional','referente_internacional','referente_tecnologico') NOT NULL,
        sitio_web VARCHAR(500) NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tipo_benchmark (tipo_benchmark)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `ALTER TABLE universidad_benchmark
        MODIFY tipo_benchmark ENUM('competencia_directa','referente_nacional','referente_internacional','referente_tecnologico') NOT NULL`,
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
        estado_validacion        ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado',
        observaciones            TEXT NULL,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_pb_univ (id_universidad_benchmark),
        CONSTRAINT fk_pb_univ FOREIGN KEY (id_universidad_benchmark)
          REFERENCES universidad_benchmark(id_universidad_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS benchmark_source (
        id_benchmark_source       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark     INT UNSIGNED NOT NULL,
        tipo_fuente               ENUM('pagina_programa','malla_curricular','plan_estudios','perfil_egreso','competencias','campo_laboral','acreditacion','brochure_pdf','actualizacion_curricular','repositorio','otra') NOT NULL DEFAULT 'pagina_programa',
        titulo                    VARCHAR(300) NOT NULL,
        url                       VARCHAR(1200) NOT NULL,
        estado                    ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado',
        es_fuente_principal       TINYINT(1) NOT NULL DEFAULT 0,
        fecha_captura             DATETIME NULL,
        fecha_validacion          DATETIME NULL,
        validado_por              VARCHAR(160) NULL,
        extractor                 VARCHAR(80) NULL,
        extractor_version         VARCHAR(40) NULL,
        evidencia_resumen         TEXT NULL,
        observaciones             TEXT NULL,
        snapshot_hash             VARCHAR(128) NULL,
        activo                    TINYINT(1) NOT NULL DEFAULT 1,
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_benchmark_source_url (id_programa_benchmark, url(255)),
        KEY idx_bs_programa (id_programa_benchmark),
        KEY idx_bs_estado (estado),
        KEY idx_bs_tipo (tipo_fuente),
        CONSTRAINT fk_bs_programa FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
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
    for (const sql of stmts) {
      try {
        await db.query(sql);
      } catch (e) {
        if (!/Duplicate column|check that column\/key exists|syntax/i.test(e.message)) throw e;
      }
    }
    const [cols] = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'programa_benchmark'
         AND COLUMN_NAME = 'estado_validacion'`
    );
    if (!cols.length) {
      await db.query(
        `ALTER TABLE programa_benchmark
         ADD COLUMN estado_validacion ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado' AFTER estado_extraccion`
      );
    }
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
    if (tipo && TIPOS_BENCHMARK.includes(tipo)) {
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
router.post('/mercado-laboral/benchmarking/universidades', adminOnly, async (req, res) => {
  try {
    const { nombre_universidad, pais = 'Peru', ciudad, tipo_benchmark, sitio_web } = req.body;
    if (!nombre_universidad?.trim()) return res.status(400).json({ error: 'nombre_universidad es requerido' });
    if (!TIPOS_BENCHMARK.includes(tipo_benchmark)) {
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
router.put('/mercado-laboral/benchmarking/universidades/:id', adminOnly, async (req, res) => {
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
router.delete('/mercado-laboral/benchmarking/universidades/:id', adminOnly, async (req, res) => {
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

// ── GET /api/mercado-laboral/benchmarking/cobertura ───────────────────────
router.get('/mercado-laboral/benchmarking/cobertura', async (_req, res) => {
  try {
    const [carreras] = await dbCurricular.query(
      `SELECT ca.id_carrera, ca.nombre_carrera, f.nombre_facultad
       FROM carrera ca
       JOIN facultad f ON f.id_facultad = ca.id_facultad
       ORDER BY f.nombre_facultad, ca.nombre_carrera`
    );

    const [rows] = await db.query(
      `SELECT pb.carrera_equivalente_id AS id_carrera,
              ub.tipo_benchmark,
              COUNT(DISTINCT pb.id_programa_benchmark) AS total_programas,
              COUNT(DISTINCT bs.id_benchmark_source) AS total_fuentes,
              COUNT(DISTINCT CASE WHEN bs.estado='validado' THEN bs.id_benchmark_source END) AS fuentes_validadas,
              COUNT(DISTINCT CASE WHEN bs.estado IN ('registrado','pendiente_extraccion','extraido','pendiente_validacion') THEN bs.id_benchmark_source END) AS fuentes_pendientes,
              MAX(COALESCE(bs.fecha_validacion, bs.fecha_captura, bs.updated_at, pb.updated_at)) AS ultima_revision
       FROM programa_benchmark pb
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       LEFT JOIN benchmark_source bs ON bs.id_programa_benchmark = pb.id_programa_benchmark AND bs.activo = 1
       WHERE ub.activo = 1 AND pb.carrera_equivalente_id IS NOT NULL
       GROUP BY pb.carrera_equivalente_id, ub.tipo_benchmark`
    );

    const byCareer = new Map();
    for (const row of rows) {
      if (!byCareer.has(Number(row.id_carrera))) byCareer.set(Number(row.id_carrera), {});
      byCareer.get(Number(row.id_carrera))[row.tipo_benchmark] = {
        total_programas: Number(row.total_programas) || 0,
        total_fuentes: Number(row.total_fuentes) || 0,
        fuentes_validadas: Number(row.fuentes_validadas) || 0,
        fuentes_pendientes: Number(row.fuentes_pendientes) || 0,
        ultima_revision: row.ultima_revision,
      };
    }

    res.json(carreras.map(c => ({
      ...c,
      benchmarking: byCareer.get(Number(c.id_carrera)) || {},
    })));
  } catch (e) { serverError(res, e, 'GET /benchmarking/cobertura'); }
});

// ── POST /api/mercado-laboral/benchmarking/seed-inicial ────────────────────
router.post('/mercado-laboral/benchmarking/seed-inicial', adminOnly, async (_req, res) => {
  try {
    const [carreras] = await dbCurricular.query(
      `SELECT ca.id_carrera, ca.nombre_carrera
       FROM carrera ca
       ORDER BY ca.nombre_carrera`
    );

    let carrerasMapeadas = 0;
    let universidadesCreadas = 0;
    let programasCreados = 0;
    let fuentesCreadas = 0;
    const mapeos = {};

    for (const carrera of carreras) {
      const { seed, match } = resolveBenchmarkSeed(carrera.nombre_carrera);
      carrerasMapeadas++;
      mapeos[match] = (mapeos[match] || 0) + 1;

      const entries = [
        ...(seed.direct || []).map(code => ({ code, tipo: 'competencia_directa' })),
        ...(seed.international || []).map(code => ({ code, tipo: code === 'CALTECH' ? 'referente_tecnologico' : 'referente_internacional' })),
      ];

      for (const entry of entries) {
        const univ = BENCHMARK_UNIVERSITIES[entry.code];
        if (!univ) continue;

        const [existingUniv] = await db.query(
          `SELECT id_universidad_benchmark
           FROM universidad_benchmark
           WHERE nombre_universidad=? AND tipo_benchmark=?
           LIMIT 1`,
          [univ.nombre, entry.tipo]
        );
        let idUniv = existingUniv[0]?.id_universidad_benchmark;
        if (!idUniv) {
          const [rUniv] = await db.query(
            `INSERT INTO universidad_benchmark
             (nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web)
             VALUES (?,?,?,?,?)`,
            [univ.nombre, univ.pais, univ.ciudad, entry.tipo, univ.web]
          );
          idUniv = rUniv.insertId;
          universidadesCreadas++;
        }

        const nombrePrograma = `${carrera.nombre_carrera} / programa equivalente`;
        const [existingProg] = await db.query(
          `SELECT id_programa_benchmark
           FROM programa_benchmark
           WHERE id_universidad_benchmark=? AND carrera_equivalente_id=? AND nombre_programa=?
           LIMIT 1`,
          [idUniv, carrera.id_carrera, nombrePrograma]
        );
        let idProg = existingProg[0]?.id_programa_benchmark;
        if (!idProg) {
          const [rProg] = await db.query(
            `INSERT INTO programa_benchmark
             (id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, estado_validacion, observaciones)
             VALUES (?,?,?,?,?,?)`,
            [
              idUniv,
              nombrePrograma,
              univ.web,
              carrera.id_carrera,
              'registrado',
              'Semilla inicial. Requiere que admin reemplace o complemente con URL oficial especifica de carrera, malla, perfil o plan de estudios.',
            ]
          );
          idProg = rProg.insertId;
          programasCreados++;
        }

        const [rSource] = await db.query(
          `INSERT IGNORE INTO benchmark_source
           (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
           VALUES (?,?,?,?,?,?,?)`,
          [
            idProg,
            'pagina_programa',
            'Sitio oficial institucional para curaduria inicial',
            univ.web,
            'registrado',
            1,
            'Fuente institucional base. No equivale a malla validada hasta que admin registre el link especifico del programa.',
          ]
        );
        if (rSource.affectedRows) fuentesCreadas++;
      }
    }

    res.json({
      ok: true,
      carrerasLeidas: carreras.length,
      carrerasMapeadas,
      universidadesCreadas,
      programasCreados,
      fuentesCreadas,
      mapeos,
    });
  } catch (e) { serverError(res, e, 'POST /benchmarking/seed-inicial'); }
});

// ── POST /api/mercado-laboral/benchmarking/programas ────────────────────────
router.post('/mercado-laboral/benchmarking/programas', adminOnly, async (req, res) => {
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
    const [fuentes] = await db.query(
      `SELECT * FROM benchmark_source
       WHERE id_programa_benchmark=? AND activo=1
       ORDER BY es_fuente_principal DESC, tipo_fuente, titulo`,
      [req.params.id]
    );
    res.json({ programa: prog, competencias, cursos, fuentes });
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas/:id'); }
});

// ── GET /api/mercado-laboral/benchmarking/programas/:id/fuentes ───────────
router.get('/mercado-laboral/benchmarking/programas/:id/fuentes', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM benchmark_source
       WHERE id_programa_benchmark=? AND activo=1
       ORDER BY es_fuente_principal DESC, tipo_fuente, titulo`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas/:id/fuentes'); }
});

// ── POST /api/mercado-laboral/benchmarking/programas/:id/fuentes ──────────
router.post('/mercado-laboral/benchmarking/programas/:id/fuentes', adminOnly, async (req, res) => {
  try {
    const {
      tipo_fuente = 'pagina_programa',
      titulo,
      url,
      estado = 'registrado',
      es_fuente_principal = false,
      evidencia_resumen,
      observaciones,
    } = req.body;
    if (!titulo?.trim() || !url?.trim()) return res.status(400).json({ error: 'titulo y url son requeridos' });
    const [r] = await db.query(
      `INSERT INTO benchmark_source
       (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, evidencia_resumen, observaciones)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         tipo_fuente=VALUES(tipo_fuente),
         titulo=VALUES(titulo),
         estado=VALUES(estado),
         es_fuente_principal=VALUES(es_fuente_principal),
         evidencia_resumen=VALUES(evidencia_resumen),
         observaciones=VALUES(observaciones),
         activo=1`,
      [req.params.id, tipo_fuente, titulo.trim(), url.trim(), estado, es_fuente_principal ? 1 : 0,
       evidencia_resumen ?? null, observaciones ?? null]
    );
    res.status(201).json({ id: r.insertId || null, ok: true });
  } catch (e) { serverError(res, e, 'POST /benchmarking/programas/:id/fuentes'); }
});

// ── PUT /api/mercado-laboral/benchmarking/fuentes/:id ─────────────────────
router.put('/mercado-laboral/benchmarking/fuentes/:id', adminOnly, async (req, res) => {
  try {
    const allowed = ['tipo_fuente','titulo','url','estado','es_fuente_principal','fecha_captura','fecha_validacion','validado_por','extractor','extractor_version','evidencia_resumen','observaciones','activo'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key}=?`);
        params.push(key === 'es_fuente_principal' || key === 'activo' ? (req.body[key] ? 1 : 0) : req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await db.query(`UPDATE benchmark_source SET ${sets.join(', ')} WHERE id_benchmark_source=?`, params);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'PUT /benchmarking/fuentes/:id'); }
});

// ── POST /api/mercado-laboral/benchmarking/scraping ─────────────────────────
router.post('/mercado-laboral/benchmarking/scraping', adminOnly, async (req, res) => {
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
router.post('/mercado-laboral/benchmarking/normalizar-ia', adminOnly, async (req, res) => {
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
    if (!TIPOS_BENCHMARK.includes(tipoBenchmark)) {
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
              pb.estado_validacion,
              ub.nombre_universidad, ub.pais, ub.tipo_benchmark,
              COUNT(cb.id_competencia_benchmark) AS total_competencias,
              COUNT(DISTINCT cu.id_curso_benchmark) AS total_cursos,
              COUNT(DISTINCT bs.id_benchmark_source) AS total_fuentes,
              COUNT(DISTINCT CASE WHEN bs.estado='validado' THEN bs.id_benchmark_source END) AS fuentes_validadas,
              COUNT(DISTINCT CASE WHEN bs.estado IN ('registrado','pendiente_extraccion','extraido','pendiente_validacion') THEN bs.id_benchmark_source END) AS fuentes_pendientes
       FROM programa_benchmark pb
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       LEFT JOIN competencia_benchmark cb ON cb.id_programa_benchmark = pb.id_programa_benchmark
       LEFT JOIN curso_benchmark cu ON cu.id_programa_benchmark = pb.id_programa_benchmark
       LEFT JOIN benchmark_source bs ON bs.id_programa_benchmark = pb.id_programa_benchmark AND bs.activo = 1
       WHERE pb.carrera_equivalente_id = ? AND ub.tipo_benchmark = ? AND ub.activo = 1
       GROUP BY pb.id_programa_benchmark, pb.nombre_programa, pb.url_programa,
                pb.estado_extraccion, pb.fecha_captura, pb.duracion, pb.modalidad, pb.estado_validacion,
                ub.nombre_universidad, ub.pais, ub.tipo_benchmark
       ORDER BY ub.nombre_universidad`,
      [idCarrera, tipoBenchmark]
    );
    res.json({ programas, competencias, tipo: tipoBenchmark });
  } catch (e) { serverError(res, e, 'GET /benchmarking/comparar/:idCarrera/:tipoBenchmark'); }
});

export default router;
