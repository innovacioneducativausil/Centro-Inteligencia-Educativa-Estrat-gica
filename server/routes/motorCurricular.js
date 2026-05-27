// server/routes/motorCurricular.js
// Motor de Impacto Curricular: endpoints para analizar impacto, gestionar brechas
// y propuestas curriculares con trazabilidad de evidencia.
// Tablas en: mallas_usil

import { Router } from 'express';
import db from '../db_curricular.js';
import { adminOrAnalyst } from '../middleware/roles.js';
import { serverError } from '../middleware/errorHandler.js';
import { analizarImpacto } from '../services/motorImpactoCurricularService.js';

const router = Router();

let schemaReady = null;

async function ensureMotorSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS evidencia_curricular (
        id_evidencia        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        modulo_origen       ENUM('radar','empleabilidad','mercado_laboral','benchmarking') NOT NULL,
        tipo_evidencia      ENUM('senal','tendencia','escenario','oferta_laboral','dato_empleabilidad','benchmark_universitario','informe_carrera') NOT NULL,
        referencia_id       INT UNSIGNED NULL,
        titulo_evidencia    VARCHAR(300) NOT NULL,
        descripcion_evidencia TEXT NULL,
        fuente_url          VARCHAR(1000) NULL,
        fecha_fuente        DATE NULL,
        nivel_confianza     DECIMAL(5,2) NOT NULL DEFAULT 0.50,
        estado_verificacion ENUM('pendiente','verificado','rechazado') NOT NULL DEFAULT 'pendiente',
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS impacto_curricular (
        id_impacto        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_carrera        INT UNSIGNED NOT NULL,
        id_malla_version  INT UNSIGNED NOT NULL,
        id_curso          INT UNSIGNED NULL,
        titulo_impacto    VARCHAR(300) NOT NULL,
        descripcion_impacto TEXT NULL,
        nivel_impacto     ENUM('bajo','medio','alto','critico') NOT NULL DEFAULT 'bajo',
        score_impacto     DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        estado            ENUM('detectado','en_revision','aprobado','rechazado') NOT NULL DEFAULT 'detectado',
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_imp_carrera (id_carrera),
        KEY idx_imp_malla (id_malla_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS impacto_curricular_evidencia (
        id_impacto             INT UNSIGNED NOT NULL,
        id_evidencia           INT UNSIGNED NOT NULL,
        peso                   DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        justificacion_relacion TEXT NULL,
        created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_impacto, id_evidencia)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS brecha_curricular (
        id_brecha           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_impacto          INT UNSIGNED NOT NULL,
        id_carrera          INT UNSIGNED NOT NULL,
        id_curso            INT UNSIGNED NULL,
        tipo_brecha         ENUM('competencia_faltante','contenido_desactualizado','baja_cobertura','falta_practica','falta_herramienta','desalineacion_mercado','otro') NOT NULL DEFAULT 'otro',
        descripcion_brecha  TEXT NOT NULL,
        competencia_afectada VARCHAR(300) NULL,
        evidencia_resumen   TEXT NULL,
        prioridad           ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_brecha_impacto (id_impacto),
        KEY idx_brecha_carrera (id_carrera)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS propuesta_curricular (
        id_propuesta           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_brecha              INT UNSIGNED NOT NULL,
        id_carrera             INT UNSIGNED NOT NULL,
        id_malla_version_origen INT UNSIGNED NOT NULL,
        tipo_propuesta         ENUM('actualizar_silabo','agregar_unidad','modificar_unidad','aumentar_horas','crear_curso_electivo','crear_curso_obligatorio','mover_curso_ciclo','conectar_cursos','actualizar_competencia') NOT NULL,
        titulo_propuesta       VARCHAR(300) NOT NULL,
        descripcion_propuesta  TEXT NOT NULL,
        justificacion          TEXT NOT NULL,
        impacto_esperado       TEXT NULL,
        estado_revision        ENUM('pendiente','aprobada','rechazada','observada') NOT NULL DEFAULT 'pendiente',
        usuario_creador        VARCHAR(120) NULL,
        usuario_revisor        VARCHAR(120) NULL,
        fecha_revision         DATETIME NULL,
        created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_prop_brecha (id_brecha),
        KEY idx_prop_carrera (id_carrera),
        KEY idx_prop_estado (estado_revision)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS malla_version_propuesta (
        id_malla_version_propuesta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_malla_version_origen    INT UNSIGNED NOT NULL,
        id_propuesta               INT UNSIGNED NOT NULL,
        nombre_version             VARCHAR(200) NOT NULL,
        descripcion_cambios        TEXT NULL,
        estado                     ENUM('borrador','en_revision','aprobada','rechazada') NOT NULL DEFAULT 'borrador',
        created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_mvp_origen (id_malla_version_origen)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const sql of stmts) await db.query(sql);
    console.log('✅ Schema motor curricular listo en mallas_usil');
  })();
  return schemaReady;
}

router.use(async (req, res, next) => {
  try { await ensureMotorSchema(); next(); } catch (e) { next(e); }
});

// ── POST /api/curricular/analizar-impacto/:idCarrera ─────────────────────────
router.post('/curricular/analizar-impacto/:idCarrera', adminOrAnalyst, async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { id_malla_version, pesos } = req.body;
    if (!id_malla_version) return res.status(400).json({ error: 'id_malla_version es requerido' });

    const usuario = req.user?.nombre || req.user?.email || 'motor_automatico';
    const result = await analizarImpacto(Number(idCarrera), Number(id_malla_version), pesos ?? {}, usuario);
    if (!result.ok) return res.status(422).json({ error: result.error });
    res.json(result);
  } catch (e) { serverError(res, e, 'POST /curricular/analizar-impacto'); }
});

// ── GET /api/curricular/impactos/:idCarrera ───────────────────────────────────
router.get('/curricular/impactos/:idCarrera', async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { id_malla } = req.query;
    const where = ['id_carrera = ?']; const params = [idCarrera];
    if (id_malla) { where.push('id_malla_version = ?'); params.push(id_malla); }
    const [rows] = await db.query(
      `SELECT ic.*, c.nombre_curso, c.numero_ciclo
       FROM impacto_curricular ic
       LEFT JOIN curso c ON c.id_curso = ic.id_curso
       WHERE ${where.join(' AND ')}
       ORDER BY ic.score_impacto DESC, ic.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /curricular/impactos'); }
});

// ── GET /api/curricular/brechas/:idCarrera ────────────────────────────────────
router.get('/curricular/brechas/:idCarrera', async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { id_malla, prioridad } = req.query;
    const joins = [
      'JOIN impacto_curricular ic ON ic.id_impacto = bc.id_impacto',
    ];
    const where = ['bc.id_carrera = ?']; const params = [idCarrera];
    if (id_malla) { where.push('ic.id_malla_version = ?'); params.push(id_malla); }
    if (prioridad) { where.push('bc.prioridad = ?'); params.push(prioridad); }
    const [rows] = await db.query(
      `SELECT bc.*, ic.titulo_impacto, ic.score_impacto, ic.nivel_impacto,
              c.nombre_curso, c.numero_ciclo
       FROM brecha_curricular bc
       ${joins.join(' ')}
       LEFT JOIN curso c ON c.id_curso = bc.id_curso
       WHERE ${where.join(' AND ')}
       ORDER BY FIELD(bc.prioridad,'critica','alta','media','baja'), bc.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /curricular/brechas'); }
});

// ── GET /api/curricular/propuestas/:idCarrera ─────────────────────────────────
router.get('/curricular/propuestas/:idCarrera', async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { estado, id_malla } = req.query;
    const where = ['p.id_carrera = ?']; const params = [idCarrera];
    if (estado)   { where.push('p.estado_revision = ?');        params.push(estado); }
    if (id_malla) { where.push('p.id_malla_version_origen = ?'); params.push(id_malla); }
    const [rows] = await db.query(
      `SELECT p.*, bc.descripcion_brecha, bc.tipo_brecha, bc.prioridad AS prioridad_brecha,
              c.nombre_curso, c.numero_ciclo
       FROM propuesta_curricular p
       JOIN brecha_curricular bc ON bc.id_brecha = p.id_brecha
       LEFT JOIN curso c ON c.id_curso = bc.id_curso
       WHERE ${where.join(' AND ')}
       ORDER BY FIELD(p.estado_revision,'pendiente','observada','aprobada','rechazada'),
                FIELD(bc.prioridad,'critica','alta','media','baja')`,
      params
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /curricular/propuestas'); }
});

// ── POST /api/curricular/propuestas ───────────────────────────────────────────
router.post('/curricular/propuestas', adminOrAnalyst, async (req, res) => {
  try {
    const {
      id_brecha, id_carrera, id_malla_version_origen,
      tipo_propuesta, titulo_propuesta, descripcion_propuesta,
      justificacion, impacto_esperado,
    } = req.body;
    if (!id_brecha || !id_carrera || !id_malla_version_origen || !tipo_propuesta
      || !titulo_propuesta?.trim() || !descripcion_propuesta?.trim() || !justificacion?.trim()) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    const usuario = req.user?.nombre || req.user?.email || 'usuario';
    const [r] = await db.query(
      `INSERT INTO propuesta_curricular
       (id_brecha, id_carrera, id_malla_version_origen, tipo_propuesta, titulo_propuesta,
        descripcion_propuesta, justificacion, impacto_esperado, usuario_creador)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id_brecha, id_carrera, id_malla_version_origen, tipo_propuesta,
       titulo_propuesta.trim(), descripcion_propuesta.trim(), justificacion.trim(),
       impacto_esperado ?? null, usuario]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { serverError(res, e, 'POST /curricular/propuestas'); }
});

// ── PUT /api/curricular/propuestas/:id/estado ─────────────────────────────────
router.put('/curricular/propuestas/:id/estado', adminOrAnalyst, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado_revision, observacion } = req.body;
    const estados = ['pendiente','aprobada','rechazada','observada'];
    if (!estados.includes(estado_revision)) {
      return res.status(400).json({ error: `estado_revision debe ser uno de: ${estados.join(', ')}` });
    }
    const usuario = req.user?.nombre || req.user?.email || 'revisor';
    await db.query(
      `UPDATE propuesta_curricular
       SET estado_revision=?, usuario_revisor=?, fecha_revision=NOW(),
           impacto_esperado=CASE WHEN ? IS NOT NULL THEN CONCAT(COALESCE(impacto_esperado,''),' | Obs: ',?) ELSE impacto_esperado END
       WHERE id_propuesta=?`,
      [estado_revision, usuario, observacion ?? null, observacion ?? null, id]
    );
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'PUT /curricular/propuestas/:id/estado'); }
});

// ── POST /api/curricular/propuestas/:id/generar-version-malla ─────────────────
router.post('/curricular/propuestas/:id/generar-version-malla', adminOrAnalyst, async (req, res) => {
  try {
    const { id } = req.params;
    const [[prop]] = await db.query(
      `SELECT p.*, bc.descripcion_brecha, c.nombre_curso
       FROM propuesta_curricular p
       JOIN brecha_curricular bc ON bc.id_brecha = p.id_brecha
       LEFT JOIN curso c ON c.id_curso = bc.id_curso
       WHERE p.id_propuesta = ?`, [id]
    );
    if (!prop) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (prop.estado_revision !== 'aprobada') {
      return res.status(422).json({ error: 'Solo se puede generar versión de una propuesta aprobada' });
    }

    const [[malla]] = await db.query(
      'SELECT nombre_version FROM malla_version WHERE id_malla=?', [prop.id_malla_version_origen]
    );
    const nuevaVersion = `${malla?.nombre_version ?? 'V?'}-Prop${id}-${new Date().getFullYear()}`;
    const { nombre_version: nv, ..._ } = req.body;
    const nombreFinal = (nv ?? nuevaVersion).substring(0, 199);

    const [r] = await db.query(
      `INSERT INTO malla_version_propuesta
       (id_malla_version_origen, id_propuesta, nombre_version, descripcion_cambios, estado)
       VALUES (?,?,?,?,'borrador')`,
      [
        prop.id_malla_version_origen, id, nombreFinal,
        `Versión propuesta basada en: ${prop.titulo_propuesta}. Brecha: ${prop.descripcion_brecha?.substring(0,200)}.`,
      ]
    );
    res.status(201).json({ id: r.insertId, nombre_version: nombreFinal });
  } catch (e) { serverError(res, e, 'POST /curricular/propuestas/:id/generar-version-malla'); }
});

// ── GET /api/curricular/evidencias/:idImpacto ─────────────────────────────────
router.get('/curricular/evidencias/:idImpacto', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ev.*, ice.peso, ice.justificacion_relacion
       FROM evidencia_curricular ev
       JOIN impacto_curricular_evidencia ice ON ice.id_evidencia = ev.id_evidencia
       WHERE ice.id_impacto = ?
       ORDER BY ice.peso DESC`,
      [req.params.idImpacto]
    );
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /curricular/evidencias/:idImpacto'); }
});

// ── GET /api/curricular/kpis-impacto/:idCarrera ───────────────────────────────
router.get('/curricular/kpis-impacto/:idCarrera', async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { id_malla } = req.query;
    const where = ['ic.id_carrera = ?']; const params = [idCarrera];
    if (id_malla) { where.push('ic.id_malla_version = ?'); params.push(id_malla); }
    const [[kpis]] = await db.query(
      `SELECT
         COUNT(DISTINCT ic.id_impacto) AS total_impactos,
         COUNT(DISTINCT bc.id_brecha) AS total_brechas,
         SUM(CASE WHEN p.estado_revision='pendiente' THEN 1 ELSE 0 END) AS propuestas_pendientes,
         SUM(CASE WHEN p.estado_revision='aprobada' THEN 1 ELSE 0 END) AS propuestas_aprobadas,
         COUNT(DISTINCT ev.id_evidencia) AS evidencias_verificadas,
         ROUND(AVG(ic.score_impacto),1) AS score_promedio,
         MAX(ic.created_at) AS ultima_ejecucion
       FROM impacto_curricular ic
       LEFT JOIN brecha_curricular bc ON bc.id_impacto = ic.id_impacto
       LEFT JOIN propuesta_curricular p ON p.id_brecha = bc.id_brecha
       LEFT JOIN impacto_curricular_evidencia ice ON ice.id_impacto = ic.id_impacto
       LEFT JOIN evidencia_curricular ev ON ev.id_evidencia = ice.id_evidencia
       WHERE ${where.join(' AND ')}`,
      params
    );
    res.json(kpis ?? {});
  } catch (e) { serverError(res, e, 'GET /curricular/kpis-impacto'); }
});

export default router;
