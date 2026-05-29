import { serverError } from '../middleware/errorHandler.js';
// server/routes/admin.js — Consola de administración (HU006)
// RBAC: solo admin y analista
import { Router }      from 'express';
import { randomUUID }  from 'crypto';
import db from '../db.js';
import { sanitizeRichHtml, normalizePositiveInt } from '../utils/security.js';

const router = Router();

// ── Mapeo de id_estado ─────────────────────────────────────
const ESTADO = {
  1: { label: 'Publicado',   slug: 'publicado' },
  2: { label: 'En revisión', slug: 'revision'  },
  3: { label: 'Borrador',    slug: 'borrador'  },
  4: { label: 'Archivado',   slug: 'archivado' },
};
function estadoInfo(id) {
  return ESTADO[Number(id)] || { label: 'Borrador', slug: 'borrador' };
}

/** Parsea url_fuente de escenario (TEXT con JSON array o string plano) → string[] */
function parseUrlFuentes(raw) {
  if (!raw) return [];
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try { return JSON.parse(raw).filter(Boolean); } catch { /* fall through */ }
  }
  return raw ? [raw] : [];
}
/** Serializa array de URLs para guardar en escenario.url_fuente */
function serializeUrlFuentes(urlFuentes, urlFuente) {
  const arr = Array.isArray(urlFuentes) ? urlFuentes.filter(u => u?.trim()) :
              (urlFuente?.trim() ? [urlFuente.trim()] : []);
  return arr.length ? JSON.stringify(arr) : null;
}

const ARCHIVE_STATE_ID = 4;
const ARCHIVE_RETENTION_DAYS = Math.max(1, Number(process.env.ARCHIVE_RETENTION_DAYS || 30));
const ARCHIVABLE = {
  senales:    { table: 'senal',     id: 'id_senal',     title: 'titulo_senal',     name: 'nombre_senal',     label: 'señal' },
  tendencias: { table: 'tendencia', id: 'id_tendencia', title: 'titulo_tendencia', name: 'nombre_tendencia', label: 'Tendencia' },
  escenarios: { table: 'escenario', id: 'id_escenario', title: 'titulo_escenario', name: 'nombre_escenario', label: 'Escenario' },
};

function archiveMeta(row) {
  const fechaArchivado = row.fecha_archivado || null;
  const diasTranscurridos = fechaArchivado ? Math.max(0, Number(row.dias_archivado) || 0) : null;
  const diasRestantes = diasTranscurridos === null
    ? null
    : Math.max(0, ARCHIVE_RETENTION_DAYS - diasTranscurridos);
  return {
    fechaArchivado,
    diasArchivoRestantes: diasRestantes,
    diasArchivoRetencion: ARCHIVE_RETENTION_DAYS,
  };
}

async function ensureUniqueTitleOrName(resource, titulo, nombre, excludeId = null) {
  const cfg = ARCHIVABLE[resource];
  if (!cfg) throw new Error('Recurso invalido para validacion de duplicados.');

  const params = [titulo, nombre, titulo, nombre];
  let excludeSql = '';
  if (excludeId) {
    excludeSql = ` AND \`${cfg.id}\` <> ?`;
    params.push(excludeId);
  }

  const [[dup]] = await db.query(
    `SELECT \`${cfg.id}\` AS id,
            \`${cfg.title}\` AS titulo,
            \`${cfg.name}\` AS nombre
       FROM \`${cfg.table}\`
      WHERE (
              LOWER(TRIM(\`${cfg.title}\`)) IN (LOWER(TRIM(?)), LOWER(TRIM(?)))
           OR LOWER(TRIM(\`${cfg.name}\`)) IN (LOWER(TRIM(?)), LOWER(TRIM(?)))
            )
            ${excludeSql}
      LIMIT 1`,
    params
  );

  if (!dup) return;

  const field = 'titulo o nombre';
  const article = cfg.label === 'Escenario' ? 'un' : 'una';
  const lowerLabel = cfg.label.toLowerCase();
  const error = `Ya existe ${article} ${lowerLabel} con ese ${field}. Usa uno diferente.`;
  const err = new Error(error);
  err.status = 400;
  throw err;
}

// ── Middleware RBAC ────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador o analista.' });
    }
    next();
  };
}
const adminOnly = requireRole('admin');

// ── Helpers ────────────────────────────────────────────────
function parsePagination(query) {
  const page  = normalizePositiveInt(query.page, 1, { min: 1, max: 100000 });
  const limit = normalizePositiveInt(query.limit, 10, { min: 1, max: 50 });
  return { page, limit, offset: (page - 1) * limit };
}

// ─── GET /api/admin/senales ────────────────────────────────
router.get('/admin/senales', adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const q          = req.query.q      || '';
    const estado     = req.query.estado || '';
    const pestelIds  = req.query.pestel ? req.query.pestel.split(',').filter(Boolean) : [];
    const sectorIds  = req.query.sector ? req.query.sector.split(',').filter(Boolean) : [];

    const conditions = [];
    const params     = [];

    if (q) {
      conditions.push('(s.titulo_senal LIKE ? OR s.desc_corta_senal LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      const match = Object.entries(ESTADO).find(([, v]) => v.slug === estado);
      if (match) { conditions.push('s.id_estado = ?'); params.push(match[0]); }
    } else {
      conditions.push('s.id_estado <> 4');
    }
    if (pestelIds.length) {
      const ph = pestelIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM senal_pestel _fp WHERE _fp.id_senal = s.id_senal AND _fp.id_pestel IN (${ph}))`);
      params.push(...pestelIds);
    }
    if (sectorIds.length) {
      const ph = sectorIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM senal_sector _fs WHERE _fs.id_senal = s.id_senal AND _fs.id_sector IN (${ph}))`);
      params.push(...sectorIds);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT s.id_senal) AS total FROM senal s ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         s.id_senal,
         s.titulo_senal,
         s.desc_corta_senal,
         s.fuente_senal,
         s.url_fuente,
         s.id_estado,
         s.fecha_publicacion,
         s.fecha_creacion,
         s.fecha_actualizacion,
         s.fecha_archivado,
         TIMESTAMPDIFF(DAY, s.fecha_archivado, NOW()) AS dias_archivado,
         GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
         MIN(p.slug_pestel)      AS pestel_slug,
         GROUP_CONCAT(DISTINCT p.color       ORDER BY p.orden_display SEPARATOR ',')  AS pestel_colores,
         GROUP_CONCAT(DISTINCT p.letra_codigo ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector SEPARATOR '|') AS sector_nombres,
         tp.nombre AS topico_nombre
       FROM senal s
       LEFT JOIN senal_pestel sp ON s.id_senal   = sp.id_senal
       LEFT JOIN pestel p        ON sp.id_pestel = p.id_pestel AND p.activo = 1
       LEFT JOIN senal_sector ss ON s.id_senal   = ss.id_senal
       LEFT JOIN sector sec      ON ss.id_sector = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tp       ON s.id_topico  = tp.id_topico
       ${where}
       GROUP BY s.id_senal
       ORDER BY s.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const letras  = (row.pestel_letra   || '').split(',').filter(Boolean);
      const nombres = (row.pestel_nombre  || '').split('|').filter(Boolean);
      const colores = (row.pestel_colores || '').split(',').filter(Boolean);
      const pestels = letras.map((l, i) => ({ letra: l, nombre: nombres[i] || l, color: colores[i] || '#2A9D8F' }));
      return {
        uuid:        row.id_senal,
        titulo:      row.titulo_senal,
        descripcion: row.desc_corta_senal || '',
        fuente:      row.fuente_senal     || null,
        urlFuente:   row.url_fuente       || null,
        pestel:      nombres.join(', ')   || null,
        pestelSlug:  row.pestel_slug      || null,
        pestelColor: colores[0]           || '#2A9D8F',
        pestelLetra: letras.join('')      || null,
        pestels,
        sector:      (row.sector_nombres || '').split('|').filter(Boolean)[0] || null,
        sectors:     (row.sector_nombres || '').split('|').filter(Boolean),
        idEstado:    row.id_estado,
        estado:      estadoInfo(row.id_estado),
        fecha:       row.fecha_actualizacion || row.fecha_publicacion || row.fecha_creacion,
        ...archiveMeta(row),
        topico:      row.topico_nombre || null,
      };
    });

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (err) {
    console.error('[GET /admin/senales]', err);
    serverError(res, err);
  }
});

// ─── PATCH /api/admin/senales/:uuid/estado ─────────────────
router.patch('/admin/senales/:uuid/estado', adminOnly, async (req, res) => {
  try {
    const { uuid }     = req.params;
    const { id_estado } = req.body;
    const nuevoEstado  = Number(id_estado);

    if (![1, 2, 3].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado inválido. Use 1 (Publicado), 2 (En revisión) o 3 (Borrador).' });
    }

    const [[row]] = await db.query(
      'SELECT id_senal, id_estado FROM senal WHERE id_senal = ?',
      [uuid]
    );
    if (!row) return res.status(404).json({ error: 'Señal no encontrada.' });

    await db.query(
      `UPDATE senal SET id_estado = ?, fecha_archivado = NULL, fecha_actualizacion = NOW(),
        fecha_publicacion = IF(? = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion)
       WHERE id_senal = ?`,
      [nuevoEstado, nuevoEstado, uuid]
    );

    console.log(`[ADMIN] Señal ${uuid}: estado ${row.id_estado} → ${nuevoEstado} (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(nuevoEstado) });
  } catch (err) {
    console.error('[PATCH /admin/senales/:uuid/estado]', err);
    serverError(res, err);
  }
});

// ─── GET /api/admin/tendencias ─────────────────────────────
router.get('/admin/tendencias', adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const q          = req.query.q      || '';
    const estado     = req.query.estado || '';
    const pestelIds  = req.query.pestel ? req.query.pestel.split(',').filter(Boolean) : [];
    const sectorIds  = req.query.sector ? req.query.sector.split(',').filter(Boolean) : [];

    const conditions = [];
    const params     = [];

    if (q) {
      conditions.push('(t.titulo_tendencia LIKE ? OR t.desc_corta_tendencia LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      const match = Object.entries(ESTADO).find(([, v]) => v.slug === estado);
      if (match) { conditions.push('t.id_estado = ?'); params.push(match[0]); }
    } else {
      conditions.push('t.id_estado <> 4');
    }
    if (pestelIds.length) {
      const ph = pestelIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM tendencia_pestel _fp WHERE _fp.id_tendencia = t.id_tendencia AND _fp.id_pestel IN (${ph}))`);
      params.push(...pestelIds);
    }
    if (sectorIds.length) {
      const ph = sectorIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM tendencia_sector _fs WHERE _fs.id_tendencia = t.id_tendencia AND _fs.id_sector IN (${ph}))`);
      params.push(...sectorIds);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT t.id_tendencia) AS total FROM tendencia t ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         t.id_tendencia,
         t.titulo_tendencia,
         t.desc_corta_tendencia,
         t.fuente_tendencia,
         t.url_fuente,
         t.id_estado,
         t.fecha_publicacion,
         t.fecha_creacion,
         t.fecha_actualizacion,
         t.fecha_archivado,
         TIMESTAMPDIFF(DAY, t.fecha_archivado, NOW()) AS dias_archivado,
         GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
         MIN(p.slug_pestel)      AS pestel_slug,
         GROUP_CONCAT(DISTINCT p.color       ORDER BY p.orden_display SEPARATOR ',')  AS pestel_colores,
         GROUP_CONCAT(DISTINCT p.letra_codigo ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector SEPARATOR '|') AS sector_nombres,
         tpc.nombre AS topico_nombre
       FROM tendencia t
       LEFT JOIN tendencia_pestel tp ON t.id_tendencia = tp.id_tendencia
       LEFT JOIN pestel p            ON tp.id_pestel   = p.id_pestel AND p.activo = 1
       LEFT JOIN tendencia_sector ts ON t.id_tendencia = ts.id_tendencia
       LEFT JOIN sector sec          ON ts.id_sector   = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tpc          ON t.id_topico    = tpc.id_topico
       ${where}
       GROUP BY t.id_tendencia
       ORDER BY t.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const letras  = (row.pestel_letra   || '').split(',').filter(Boolean);
      const nombres = (row.pestel_nombre  || '').split('|').filter(Boolean);
      const colores = (row.pestel_colores || '').split(',').filter(Boolean);
      const pestels = letras.map((l, i) => ({ letra: l, nombre: nombres[i] || l, color: colores[i] || '#2A9D8F' }));
      return {
        uuid:        row.id_tendencia,
        titulo:      row.titulo_tendencia,
        descripcion: row.desc_corta_tendencia || '',
        fuente:      row.fuente_tendencia     || null,
        urlFuente:   row.url_fuente           || null,
        pestel:      nombres.join(', ')       || null,
        pestelSlug:  row.pestel_slug          || null,
        pestelColor: colores[0]               || '#2A9D8F',
        pestelLetra: letras.join('')          || null,
        pestels,
        sector:      (row.sector_nombres || '').split('|').filter(Boolean)[0] || null,
        sectors:     (row.sector_nombres || '').split('|').filter(Boolean),
        idEstado:    row.id_estado,
        estado:      estadoInfo(row.id_estado),
        fecha:       row.fecha_actualizacion  || row.fecha_publicacion || row.fecha_creacion,
        ...archiveMeta(row),
        topico:      row.topico_nombre || null,
      };
    });

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (err) {
    console.error('[GET /admin/tendencias]', err);
    serverError(res, err);
  }
});

// ─── PATCH /api/admin/tendencias/:uuid/estado ──────────────
router.patch('/admin/tendencias/:uuid/estado', adminOnly, async (req, res) => {
  try {
    const { uuid }     = req.params;
    const { id_estado } = req.body;
    const nuevoEstado  = Number(id_estado);

    if (![1, 2, 3].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const [[row]] = await db.query(
      'SELECT id_tendencia FROM tendencia WHERE id_tendencia = ?',
      [uuid]
    );
    if (!row) return res.status(404).json({ error: 'Tendencia no encontrada.' });

    await db.query(
      `UPDATE tendencia SET id_estado = ?, fecha_archivado = NULL, fecha_actualizacion = NOW(),
        fecha_publicacion = IF(? = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion)
       WHERE id_tendencia = ?`,
      [nuevoEstado, nuevoEstado, uuid]
    );

    console.log(`[ADMIN] Tendencia ${uuid}: → ${nuevoEstado} (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(nuevoEstado) });
  } catch (err) {
    console.error('[PATCH /admin/tendencias/:uuid/estado]', err);
    serverError(res, err);
  }
});

// ─── GET /api/admin/escenarios ─────────────────────────────
router.get('/admin/escenarios', adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const q          = req.query.q        || '';
    const estado     = req.query.estado   || '';
    const horizonte  = req.query.horizonte || '';
    const pestelIds  = req.query.pestel ? req.query.pestel.split(',').filter(Boolean) : [];
    const sectorIds  = req.query.sector ? req.query.sector.split(',').filter(Boolean) : [];

    const conditions = [];
    const params     = [];

    if (q) {
      conditions.push('(e.titulo_escenario LIKE ? OR e.desc_corta_escenario LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      const match = Object.entries(ESTADO).find(([, v]) => v.slug === estado);
      if (match) { conditions.push('e.id_estado = ?'); params.push(match[0]); }
    } else {
      conditions.push('e.id_estado <> 4');
    }
    if (horizonte) {
      conditions.push('e.horizonte_escenario = ?');
      params.push(horizonte);
    }
    if (pestelIds.length) {
      const ph = pestelIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM escenario_pestel _fp WHERE _fp.id_escenario = e.id_escenario AND _fp.id_pestel IN (${ph}))`);
      params.push(...pestelIds);
    }
    if (sectorIds.length) {
      const ph = sectorIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM escenario_sector _fs WHERE _fs.id_escenario = e.id_escenario AND _fs.id_sector IN (${ph}))`);
      params.push(...sectorIds);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT e.id_escenario) AS total FROM escenario e ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         e.id_escenario,
         e.titulo_escenario,
         e.desc_corta_escenario,
         e.fuente_escenario,
         e.url_fuente,
         e.id_estado,
         e.fecha_publicacion,
         e.fecha_creacion,
         e.fecha_actualizacion,
         e.fecha_archivado,
         TIMESTAMPDIFF(DAY, e.fecha_archivado, NOW()) AS dias_archivado,
         e.horizonte_escenario,
         GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
         MIN(p.slug_pestel)      AS pestel_slug,
         GROUP_CONCAT(DISTINCT p.color       ORDER BY p.orden_display SEPARATOR ',')  AS pestel_colores,
         GROUP_CONCAT(DISTINCT p.letra_codigo ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector SEPARATOR '|') AS sector_nombres,
         tpe.nombre AS topico_nombre
       FROM escenario e
       LEFT JOIN escenario_pestel ep  ON e.id_escenario = ep.id_escenario
       LEFT JOIN pestel p             ON ep.id_pestel   = p.id_pestel AND p.activo = 1
       LEFT JOIN escenario_sector esc ON e.id_escenario = esc.id_escenario
       LEFT JOIN sector sec           ON esc.id_sector  = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tpe           ON e.id_topico    = tpe.id_topico
       ${where}
       GROUP BY e.id_escenario
       ORDER BY e.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const letras  = (row.pestel_letra   || '').split(',').filter(Boolean);
      const nombres = (row.pestel_nombre  || '').split('|').filter(Boolean);
      const colores = (row.pestel_colores || '').split(',').filter(Boolean);
      const pestels = letras.map((l, i) => ({ letra: l, nombre: nombres[i] || l, color: colores[i] || '#2A9D8F' }));
      return {
        uuid:        row.id_escenario,
        titulo:      row.titulo_escenario,
        descripcion: row.desc_corta_escenario || '',
        fuente:      row.fuente_escenario     || null,
        urlFuente:   parseUrlFuentes(row.url_fuente)[0] || null,
        pestel:      nombres.join(', ')       || null,
        pestelSlug:  row.pestel_slug          || null,
        pestelColor: colores[0]               || '#2A9D8F',
        pestelLetra: letras.join('')          || null,
        pestels,
        sector:      (row.sector_nombres || '').split('|').filter(Boolean)[0] || null,
        sectors:     (row.sector_nombres || '').split('|').filter(Boolean),
        idEstado:    row.id_estado,
        estado:      estadoInfo(row.id_estado),
        fecha:       row.fecha_actualizacion  || row.fecha_publicacion || row.fecha_creacion,
        ...archiveMeta(row),
        topico:      row.topico_nombre || null,
      };
    });

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (err) {
    console.error('[GET /admin/escenarios]', err);
    serverError(res, err);
  }
});

// ─── PATCH /api/admin/escenarios/:uuid/estado ──────────────
router.patch('/admin/escenarios/:uuid/estado', adminOnly, async (req, res) => {
  try {
    const { uuid }     = req.params;
    const { id_estado } = req.body;
    const nuevoEstado  = Number(id_estado);

    if (![1, 2, 3].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const [[row]] = await db.query(
      'SELECT id_escenario FROM escenario WHERE id_escenario = ?',
      [uuid]
    );
    if (!row) return res.status(404).json({ error: 'Escenario no encontrado.' });

    await db.query(
      `UPDATE escenario SET id_estado = ?, fecha_archivado = NULL, fecha_actualizacion = NOW(),
        fecha_publicacion = IF(? = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion)
       WHERE id_escenario = ?`,
      [nuevoEstado, nuevoEstado, uuid]
    );

    console.log(`[ADMIN] Escenario ${uuid}: → ${nuevoEstado} (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(nuevoEstado) });
  } catch (err) {
    console.error('[PATCH /admin/escenarios/:uuid/estado]', err);
    serverError(res, err);
  }
});

// ─── GET /api/admin/senales/:uuid ──────────────────────────
router.get('/admin/senales/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const [[row]] = await db.query(
      `SELECT s.id_senal, s.titulo_senal, s.nombre_senal,
              s.desc_corta_senal, s.desc_larga_senal, s.razon_cambio,
              s.fuente_senal, s.url_fuente,
              s.url_imagen_senal, s.url_video_senal, s.id_estado,
              s.pais_origen, s.fecha_senal_articulo, s.autor,
              s.fecha_creacion, s.fecha_publicacion, s.fecha_actualizacion,
              tp.nombre AS topico_nombre
       FROM senal s
       LEFT JOIN topico tp ON s.id_topico = tp.id_topico
       WHERE s.id_senal = ?`, [uuid]);
    if (!row) return res.status(404).json({ error: 'Señal no encontrada.' });
    const [pestels] = await db.query('SELECT id_pestel FROM senal_pestel WHERE id_senal = ?', [uuid]);
    const [sectors] = await db.query('SELECT id_sector FROM senal_sector WHERE id_senal = ?', [uuid]);
    const [tendRel] = await db.query(
      'SELECT t.id_tendencia AS uuid, t.nombre_tendencia AS nombre FROM senal_tendencia st JOIN tendencia t ON st.id_tendencia = t.id_tendencia WHERE st.id_senal = ?', [uuid]);
    const [escRel] = await db.query(
      'SELECT e.id_escenario AS uuid, e.nombre_escenario AS nombre FROM senal_escenario se JOIN escenario e ON se.id_escenario = e.id_escenario WHERE se.id_senal = ?', [uuid]);
    const fmt = d => d ? new Date(d).toLocaleDateString('es-PE') : null;
    const fmtDate = d => d ? (d instanceof Date ? d.toISOString().slice(0,10) : String(d).slice(0,10)) : null;
    res.json({
      uuid, nombre: row.nombre_senal, tituloDes: row.titulo_senal,
      descCorta: row.desc_corta_senal, descLarga: row.desc_larga_senal,
      razonCambio: row.razon_cambio || '',
      fuente: row.fuente_senal, urlFuente: row.url_fuente,
      imagenUrl: row.url_imagen_senal, videoUrl: row.url_video_senal,
      estadoId: String(row.id_estado),
      pestelIds: pestels.map(p => String(p.id_pestel)),
      sectorIds: sectors.map(s => String(s.id_sector)),
      paisOrigen: row.pais_origen || null,
      topico: row.topico_nombre || null,
      autor: row.autor || null,
      fechaSeñalArticulo: fmtDate(row.fecha_senal_articulo),
      fechaCreacion: fmt(row.fecha_creacion),
      fechaPublicacion: fmt(row.fecha_publicacion),
      fechaActualizacion: fmt(row.fecha_actualizacion),
      tendenciasRelacionadas: tendRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
      escenariosRelacionados: escRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
    });
  } catch (err) { serverError(res, err); }
});

// ─── PUT /api/admin/senales/:uuid ──────────────────────────
router.put('/admin/senales/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { nombre, tituloDes, descCorta, descLarga, razonCambio, fuente, urlFuente,
            imagenUrl, videoUrl, pestelId, pestelIds, sectorId, sectorIds,
            tendenciasRel, escenariosRel, id_estado, autor } = req.body;
    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });
    const [[ex]] = await db.query('SELECT id_senal, id_estado FROM senal WHERE id_senal = ?', [uuid]);
    if (!ex) return res.status(404).json({ error: 'Señal no encontrada.' });
    const idEstado = [1,2,3].includes(Number(id_estado)) ? Number(id_estado) : ex.id_estado;
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0,100);
    const nombreFin = nombre.trim().slice(0,100);
    await ensureUniqueTitleOrName('senales', tituloFin, nombreFin, uuid);
    await db.query(
      `UPDATE senal SET titulo_senal=?, nombre_senal=?,
         desc_corta_senal=?, desc_larga_senal=?, razon_cambio=?,
         fuente_senal=?, url_fuente=?,
         url_imagen_senal=?, url_video_senal=?,
         autor=?,
         id_estado=?, id_usuario_actualizador=?,
         fecha_publicacion=IF(?=1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion),
         fecha_actualizacion=NOW()
       WHERE id_senal=?`,
      [tituloFin, nombreFin,
       descCorta?.trim()||'', sanitizeRichHtml(descLarga), razonCambio?.trim()||null,
       fuente?.trim()||'', urlFuente?.trim()||'',
       imagenUrl?.trim()||null, videoUrl?.trim()||null,
       autor?.trim()||null,
       idEstado, req.user.id, idEstado, uuid]);
    await db.query('DELETE FROM senal_pestel WHERE id_senal = ?', [uuid]);
    const pids = Array.isArray(pestelIds)&&pestelIds.length ? pestelIds : (pestelId?[pestelId]:[]);
    for (const pid of pids) await db.query('INSERT IGNORE INTO senal_pestel VALUES (?,?)', [uuid, pid]);
    await db.query('DELETE FROM senal_sector WHERE id_senal = ?', [uuid]);
    for (const sid of sids) await db.query('INSERT IGNORE INTO senal_sector VALUES (?,?)', [uuid, sid]);
    await db.query('DELETE FROM senal_tendencia WHERE id_senal = ?', [uuid]);
    for (const tid of (Array.isArray(tendenciasRel) ? tendenciasRel : []))
      await db.query('INSERT IGNORE INTO senal_tendencia VALUES (?,?)', [uuid, tid]);
    await db.query('DELETE FROM senal_escenario WHERE id_senal = ?', [uuid]);
    for (const eid of (Array.isArray(escenariosRel) ? escenariosRel : []))
      await db.query('INSERT IGNORE INTO senal_escenario VALUES (?,?)', [uuid, eid]);
    res.json({ success: true, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code==='ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una señal con ese nombre.' });
    serverError(res, err);
  }
});

// ─── GET /api/admin/tendencias/:uuid ───────────────────────
router.get('/admin/tendencias/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const [[row]] = await db.query(
      `SELECT t.id_tendencia, t.titulo_tendencia, t.nombre_tendencia,
              t.desc_corta_tendencia, t.desc_larga_tendencia, t.razon_cambio,
              t.fuente_tendencia, t.url_fuente,
              t.url_imagen_tendencia, t.url_video_tendencia, t.id_estado,
              t.autor,
              t.fecha_creacion, t.fecha_publicacion, t.fecha_actualizacion,
              tp.nombre AS topico_nombre
       FROM tendencia t
       LEFT JOIN topico tp ON t.id_topico = tp.id_topico
       WHERE t.id_tendencia = ?`, [uuid]);
    if (!row) return res.status(404).json({ error: 'Tendencia no encontrada.' });
    const [pestels] = await db.query('SELECT id_pestel FROM tendencia_pestel WHERE id_tendencia = ?', [uuid]);
    const [sectors] = await db.query('SELECT id_sector FROM tendencia_sector WHERE id_tendencia = ?', [uuid]);
    const [topicosRelac] = await db.query('SELECT tp.nombre FROM topico_relac_tendencia trt JOIN topico tp ON trt.id_topico = tp.id_topico WHERE trt.id_tendencia = ?', [uuid]);
    const [senRel] = await db.query(
      'SELECT s.id_senal AS uuid, s.nombre_senal AS nombre FROM senal_tendencia st JOIN senal s ON st.id_senal = s.id_senal WHERE st.id_tendencia = ?', [uuid]);
    const [escRel] = await db.query(
      'SELECT e.id_escenario AS uuid, e.nombre_escenario AS nombre FROM tendencia_escenario te JOIN escenario e ON te.id_escenario = e.id_escenario WHERE te.id_tendencia = ?', [uuid]);
    const fmt = d => d ? new Date(d).toLocaleDateString('es-PE') : null;
    res.json({
      uuid, nombre: row.nombre_tendencia, tituloDes: row.titulo_tendencia,
      descCorta: row.desc_corta_tendencia, descLarga: row.desc_larga_tendencia,
      razonCambio: row.razon_cambio || '',
      topico: row.topico_nombre || null,
      autor: row.autor || null,
      fuente: row.fuente_tendencia, urlFuente: row.url_fuente,
      imagenUrl: row.url_imagen_tendencia, videoUrl: row.url_video_tendencia,
      estadoId: String(row.id_estado),
      pestelIds: pestels.map(p => String(p.id_pestel)),
      sectorIds: sectors.map(s => String(s.id_sector)),
      topicosRelacionados: topicosRelac.map(t => t.nombre),
      fechaCreacion: fmt(row.fecha_creacion),
      fechaPublicacion: fmt(row.fecha_publicacion),
      fechaActualizacion: fmt(row.fecha_actualizacion),
      senalesRelacionadas:    senRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
      escenariosRelacionados: escRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
    });
  } catch (err) { serverError(res, err); }
});

// ─── PUT /api/admin/tendencias/:uuid ───────────────────────
router.put('/admin/tendencias/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { nombre, tituloDes, descCorta, descLarga, razonCambio, fuente, urlFuente,
            imagenUrl, videoUrl, pestelId, pestelIds, sectorId, sectorIds,
            senalesRel, escenariosRel, id_estado, autor } = req.body;
    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });
    const [[ex]] = await db.query('SELECT id_tendencia, id_estado FROM tendencia WHERE id_tendencia = ?', [uuid]);
    if (!ex) return res.status(404).json({ error: 'Tendencia no encontrada.' });
    const idEstado = [1,2,3].includes(Number(id_estado)) ? Number(id_estado) : ex.id_estado;
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0,100);
    const nombreFin = nombre.trim().slice(0,100);
    await ensureUniqueTitleOrName('tendencias', tituloFin, nombreFin, uuid);
    await db.query(
      `UPDATE tendencia SET titulo_tendencia=?, nombre_tendencia=?,
         desc_corta_tendencia=?, desc_larga_tendencia=?, razon_cambio=?,
         fuente_tendencia=?, url_fuente=?,
         url_imagen_tendencia=?, url_video_tendencia=?,
         autor=?,
         id_estado=?, id_usuario_actualizador=?,
         fecha_publicacion=IF(?=1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion),
         fecha_actualizacion=NOW()
       WHERE id_tendencia=?`,
      [tituloFin, nombreFin,
       descCorta?.trim()||'', sanitizeRichHtml(descLarga), razonCambio?.trim()||null,
       fuente?.trim()||null, urlFuente?.trim()||null,
       imagenUrl?.trim()||null, videoUrl?.trim()||null,
       autor?.trim()||null,
       idEstado, req.user.id, idEstado, uuid]);
    await db.query('DELETE FROM tendencia_pestel WHERE id_tendencia = ?', [uuid]);
    const pids = Array.isArray(pestelIds)&&pestelIds.length ? pestelIds : (pestelId?[pestelId]:[]);
    for (const pid of pids) await db.query('INSERT IGNORE INTO tendencia_pestel VALUES (?,?)', [uuid, pid]);
    await db.query('DELETE FROM tendencia_sector WHERE id_tendencia = ?', [uuid]);
    for (const sid of sids) await db.query('INSERT IGNORE INTO tendencia_sector VALUES (?,?)', [uuid, sid]);
    await db.query('DELETE FROM senal_tendencia WHERE id_tendencia = ?', [uuid]);
    for (const sid of (Array.isArray(senalesRel) ? senalesRel : []))
      await db.query('INSERT IGNORE INTO senal_tendencia VALUES (?,?)', [sid, uuid]);
    await db.query('DELETE FROM tendencia_escenario WHERE id_tendencia = ?', [uuid]);
    for (const eid of (Array.isArray(escenariosRel) ? escenariosRel : []))
      await db.query('INSERT IGNORE INTO tendencia_escenario VALUES (?,?)', [uuid, eid]);
    res.json({ success: true, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code==='ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una tendencia con ese nombre.' });
    serverError(res, err);
  }
});

// ─── GET /api/admin/escenarios/:uuid ───────────────────────
router.get('/admin/escenarios/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const [[row]] = await db.query(
      `SELECT e.id_escenario, e.titulo_escenario, e.nombre_escenario,
              e.desc_corta_escenario, e.desc_larga_escenario, e.razon_cambio,
              e.fuente_escenario, e.url_fuente,
              e.url_imagen_escenario, e.url_video_escenario,
              e.horizonte_escenario, e.probabilidad, e.id_estado,
              e.autor,
              e.fecha_creacion, e.fecha_publicacion, e.fecha_actualizacion,
              tp.nombre AS topico_nombre
       FROM escenario e
       LEFT JOIN topico tp ON e.id_topico = tp.id_topico
       WHERE e.id_escenario = ?`, [uuid]);
    if (!row) return res.status(404).json({ error: 'Escenario no encontrado.' });
    const [pestels] = await db.query('SELECT id_pestel FROM escenario_pestel WHERE id_escenario = ?', [uuid]);
    const [sectors] = await db.query('SELECT id_sector FROM escenario_sector WHERE id_escenario = ?', [uuid]);
    const [senRel] = await db.query(
      'SELECT s.id_senal AS uuid, s.nombre_senal AS nombre FROM senal_escenario se JOIN senal s ON se.id_senal = s.id_senal WHERE se.id_escenario = ?', [uuid]);
    const [tendRel] = await db.query(
      'SELECT t.id_tendencia AS uuid, t.nombre_tendencia AS nombre FROM tendencia_escenario te JOIN tendencia t ON te.id_tendencia = t.id_tendencia WHERE te.id_escenario = ?', [uuid]);
    const fmt = d => d ? new Date(d).toLocaleDateString('es-PE') : null;
    res.json({
      uuid, nombre: row.nombre_escenario, tituloDes: row.titulo_escenario,
      descCorta: row.desc_corta_escenario, descLarga: row.desc_larga_escenario,
      razonCambio: row.razon_cambio || '',
      topico: row.topico_nombre || null,
      fuente: row.fuente_escenario,
      urlFuente: parseUrlFuentes(row.url_fuente)[0] || null,
      urlFuentes: parseUrlFuentes(row.url_fuente),
      imagenUrl: row.url_imagen_escenario, videoUrl: row.url_video_escenario,
      estadoId: String(row.id_estado),
      pestelIds: pestels.map(p => String(p.id_pestel)),
      sectorIds: sectors.map(s => String(s.id_sector)),
      horizonte: row.horizonte_escenario || '',
      probabilidad: row.probabilidad ?? null,
      autor: row.autor || null,
      fechaCreacion: fmt(row.fecha_creacion),
      fechaPublicacion: fmt(row.fecha_publicacion),
      fechaActualizacion: fmt(row.fecha_actualizacion),
      senalesRelacionadas:   senRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
      tendenciasRelacionadas: tendRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
    });
  } catch (err) { serverError(res, err); }
});

// ─── PUT /api/admin/escenarios/:uuid ───────────────────────
router.put('/admin/escenarios/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { nombre, tituloDes, descCorta, descLarga, razonCambio, fuente, urlFuente, urlFuentes,
            imagenUrl, videoUrl, horizonte, pestelId, pestelIds, sectorId, sectorIds,
            senalesRel, tendenciasRel, id_estado, autor } = req.body;
    const urlFuenteStored = serializeUrlFuentes(urlFuentes, urlFuente);
    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });
    const [[ex]] = await db.query('SELECT id_escenario, id_estado FROM escenario WHERE id_escenario = ?', [uuid]);
    if (!ex) return res.status(404).json({ error: 'Escenario no encontrado.' });
    const idEstado = [1,2,3].includes(Number(id_estado)) ? Number(id_estado) : ex.id_estado;
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0,100);
    const nombreFin = nombre.trim().slice(0,100);
    await ensureUniqueTitleOrName('escenarios', tituloFin, nombreFin, uuid);
    await db.query(
      `UPDATE escenario SET titulo_escenario=?, nombre_escenario=?,
         desc_corta_escenario=?, desc_larga_escenario=?, razon_cambio=?,
         fuente_escenario=?, url_fuente=?,
         url_imagen_escenario=?, url_video_escenario=?,
         horizonte_escenario=?,
         autor=?,
         id_estado=?, id_usuario_actualizador=?,
         fecha_publicacion=IF(?=1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion),
         fecha_actualizacion=NOW()
       WHERE id_escenario=?`,
      [tituloFin, nombreFin,
       descCorta?.trim()||'', sanitizeRichHtml(descLarga), razonCambio?.trim()||null,
       fuente?.trim()||null, urlFuenteStored,
       imagenUrl?.trim()||null, videoUrl?.trim()||null,
       horizonte?.trim()||null,
       autor?.trim()||null,
       idEstado, req.user.id, idEstado, uuid]);
    await db.query('DELETE FROM escenario_pestel WHERE id_escenario = ?', [uuid]);
    const pids = Array.isArray(pestelIds)&&pestelIds.length ? pestelIds : (pestelId?[pestelId]:[]);
    for (const pid of pids) await db.query('INSERT IGNORE INTO escenario_pestel VALUES (?,?)', [uuid, pid]);
    await db.query('DELETE FROM escenario_sector WHERE id_escenario = ?', [uuid]);
    for (const sid of sids) await db.query('INSERT IGNORE INTO escenario_sector VALUES (?,?)', [uuid, sid]);
    await db.query('DELETE FROM senal_escenario WHERE id_escenario = ?', [uuid]);
    for (const sid of (Array.isArray(senalesRel) ? senalesRel : []))
      await db.query('INSERT IGNORE INTO senal_escenario VALUES (?,?)', [sid, uuid]);
    await db.query('DELETE FROM tendencia_escenario WHERE id_escenario = ?', [uuid]);
    for (const tid of (Array.isArray(tendenciasRel) ? tendenciasRel : []))
      await db.query('INSERT IGNORE INTO tendencia_escenario VALUES (?,?)', [tid, uuid]);
    res.json({ success: true, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code==='ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe un escenario con ese nombre.' });
    serverError(res, err);
  }
});

// ─── GET /api/admin/options ────────────────────────────────
// Devuelve pestels y sectores activos para los selects del formulario
router.get('/admin/options', adminOnly, async (_req, res) => {
  try {
    const [pestels] = await db.query(
      'SELECT id_pestel, nombre_pestel, slug_pestel, color, letra_codigo FROM pestel WHERE activo = 1 ORDER BY nombre_pestel'
    );
    const [sectors] = await db.query(
      'SELECT id_sector, nombre_sector FROM sector WHERE activo = 1 ORDER BY nombre_sector'
    );
    res.json({ pestels, sectors });
  } catch (err) {
    console.error('[GET /admin/options]', err);
    serverError(res, err);
  }
});

// ── Validación compartida HU009 ────────────────────────────
function validateCreate({ nombre, sectorId, pestelId, descCorta }) {
  const errs = [];
  if (!nombre?.trim())    errs.push('El nombre es obligatorio.');
  if (!sectorId)          errs.push('El sector es obligatorio.');
  if (!pestelId)          errs.push('La categoría PESTEL es obligatoria.');
  if (!descCorta?.trim()) errs.push('La descripción corta es obligatoria.');
  if (descCorta && descCorta.trim().length > 280) errs.push('La descripción corta no puede superar los 280 caracteres.');
  return errs;
}

// ─── POST /api/admin/senales ───────────────────────────────
router.post('/admin/senales', adminOnly, async (req, res) => {
  try {
    const {
      nombre, tituloDes, descCorta, descLarga, razonCambio,
      fuente, urlFuente, imagenUrl, videoUrl,
      pestelId, pestelIds, sectorId, sectorIds,
      tendenciasRel, escenariosRel,
      id_estado = 3, autor,
    } = req.body;

    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const idEstado    = [1, 2, 3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const newId       = randomUUID();
    const usuarioId   = req.user.id;
    const tituloFin   = (tituloDes?.trim() || nombre.trim()).slice(0, 100);
    const nombreFin   = nombre.trim().slice(0, 100);
    await ensureUniqueTitleOrName('senales', tituloFin, nombreFin);

    await db.query(
      `INSERT INTO senal
         (id_senal, titulo_senal, nombre_senal,
          desc_corta_senal, desc_larga_senal, razon_cambio,
          fuente_senal, url_fuente,
          url_imagen_senal, url_video_senal,
          autor, id_estado, id_usuario_creador, fecha_publicacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        tituloFin,
        nombreFin,
        descCorta?.trim()  || '',
        sanitizeRichHtml(descLarga),
        razonCambio?.trim() || null,
        fuente?.trim()     || '',
        urlFuente?.trim()  || '',
        imagenUrl?.trim()  || null,
        videoUrl?.trim()   || null,
        autor?.trim()      || null,
        idEstado,
        usuarioId,
        idEstado === 1 ? new Date() : null,
      ]
    );

    const pestelsToInsert = Array.isArray(pestelIds) && pestelIds.length
      ? pestelIds
      : (pestelId ? [pestelId] : []);
    for (const pid of pestelsToInsert) {
      await db.query('INSERT IGNORE INTO senal_pestel (id_senal, id_pestel) VALUES (?, ?)', [newId, pid]);
    }

    for (const sid of sids) await db.query('INSERT IGNORE INTO senal_sector (id_senal, id_sector) VALUES (?, ?)', [newId, sid]);

    for (const tid of (Array.isArray(tendenciasRel) ? tendenciasRel : []))
      await db.query('INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (?,?)', [newId, tid]);
    for (const eid of (Array.isArray(escenariosRel) ? escenariosRel : []))
      await db.query('INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (?,?)', [newId, eid]);

    console.log(`[ADMIN] Señal creada id=${newId} estado=${idEstado} (by ${req.user.correo})`);
    res.status(201).json({ success: true, id: newId, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una señal con ese nombre. Usa uno diferente.' });
    }
    console.error('[POST /admin/senales]', err);
    serverError(res, err);
  }
});

// ─── POST /api/admin/tendencias ────────────────────────────
router.post('/admin/tendencias', adminOnly, async (req, res) => {
  try {
    const {
      nombre, tituloDes, descCorta, descLarga, razonCambio,
      fuente, urlFuente, imagenUrl, videoUrl,
      pestelId, pestelIds, sectorId, sectorIds,
      senalesRel, escenariosRel,
      id_estado = 3, autor,
    } = req.body;

    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const idEstado  = [1, 2, 3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const newId     = randomUUID();
    const usuarioId = req.user.id;
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0, 100);
    const nombreFin = nombre.trim().slice(0, 100);
    await ensureUniqueTitleOrName('tendencias', tituloFin, nombreFin);

    await db.query(
      `INSERT INTO tendencia
         (id_tendencia, titulo_tendencia, nombre_tendencia,
          desc_corta_tendencia, desc_larga_tendencia, razon_cambio,
          fuente_tendencia, url_fuente,
          url_imagen_tendencia, url_video_tendencia,
          autor, id_estado, id_usuario_creador, fecha_publicacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        tituloFin,
        nombreFin,
        descCorta?.trim()  || '',
        sanitizeRichHtml(descLarga),
        razonCambio?.trim() || null,
        fuente?.trim()     || null,
        urlFuente?.trim()  || null,
        imagenUrl?.trim()  || null,
        videoUrl?.trim()   || null,
        autor?.trim()      || null,
        idEstado,
        usuarioId,
        idEstado === 1 ? new Date() : null,
      ]
    );

    const pestelsToInsert = Array.isArray(pestelIds) && pestelIds.length
      ? pestelIds
      : (pestelId ? [pestelId] : []);
    for (const pid of pestelsToInsert) {
      await db.query('INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel) VALUES (?, ?)', [newId, pid]);
    }

    for (const sid of sids) await db.query('INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector) VALUES (?, ?)', [newId, sid]);

    for (const sid of (Array.isArray(senalesRel) ? senalesRel : []))
      await db.query('INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (?,?)', [sid, newId]);
    for (const eid of (Array.isArray(escenariosRel) ? escenariosRel : []))
      await db.query('INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (?,?)', [newId, eid]);

    console.log(`[ADMIN] Tendencia creada id=${newId} estado=${idEstado} (by ${req.user.correo})`);
    res.status(201).json({ success: true, id: newId, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una tendencia con ese nombre. Usa uno diferente.' });
    }
    console.error('[POST /admin/tendencias]', err);
    serverError(res, err);
  }
});

// ─── POST /api/admin/escenarios ────────────────────────────
router.post('/admin/escenarios', adminOnly, async (req, res) => {
  try {
    const {
      nombre, tituloDes, descCorta, descLarga, razonCambio,
      fuente, urlFuente, urlFuentes, imagenUrl, videoUrl,
      horizonte,
      pestelId, pestelIds, sectorId, sectorIds,
      senalesRel, tendenciasRel,
      id_estado = 3, autor,
    } = req.body;

    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const idEstado  = [1, 2, 3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const newId     = randomUUID();
    const usuarioId = req.user.id;
    const urlFuenteStored = serializeUrlFuentes(urlFuentes, urlFuente);
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0, 100);
    const nombreFin = nombre.trim().slice(0, 100);
    await ensureUniqueTitleOrName('escenarios', tituloFin, nombreFin);

    await db.query(
      `INSERT INTO escenario
         (id_escenario, titulo_escenario, nombre_escenario,
          desc_corta_escenario, desc_larga_escenario, razon_cambio,
          fuente_escenario, url_fuente,
          url_imagen_escenario, url_video_escenario,
          horizonte_escenario,
          autor, id_estado, id_usuario_creador, fecha_publicacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        tituloFin,
        nombreFin,
        descCorta?.trim()  || '',
        sanitizeRichHtml(descLarga),
        razonCambio?.trim() || null,
        fuente?.trim()     || null,
        urlFuenteStored,
        imagenUrl?.trim()  || null,
        videoUrl?.trim()   || null,
        horizonte?.trim()  || null,
        autor?.trim()      || null,
        idEstado,
        usuarioId,
        idEstado === 1 ? new Date() : null,
      ]
    );

    const pestelsToInsert = Array.isArray(pestelIds) && pestelIds.length
      ? pestelIds
      : (pestelId ? [pestelId] : []);
    for (const pid of pestelsToInsert) {
      await db.query('INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel) VALUES (?, ?)', [newId, pid]);
    }

    for (const sid of sids) await db.query('INSERT IGNORE INTO escenario_sector (id_escenario, id_sector) VALUES (?, ?)', [newId, sid]);

    for (const sid of (Array.isArray(senalesRel) ? senalesRel : []))
      await db.query('INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (?,?)', [sid, newId]);
    for (const tid of (Array.isArray(tendenciasRel) ? tendenciasRel : []))
      await db.query('INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (?,?)', [tid, newId]);

    console.log(`[ADMIN] Escenario creado id=${newId} estado=${idEstado} (by ${req.user.correo})`);
    res.status(201).json({ success: true, id: newId, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe un escenario con ese nombre. Usa uno diferente.' });
    }
    console.error('[POST /admin/escenarios]', err);
    serverError(res, err);
  }
});

// ─── GET /api/admin/notificaciones ─────────────────────────
// Últimos 20 elementos subidos (señales + tendencias + escenarios, cualquier estado)
// ─── PATCH /api/admin/:resource/:uuid/archive ───────────────
router.patch('/admin/:resource/:uuid/archive', adminOnly, async (req, res) => {
  try {
    const { resource, uuid } = req.params;
    const cfg = ARCHIVABLE[resource];
    if (!cfg) return res.status(404).json({ error: 'Recurso no encontrado.' });

    const [[row]] = await db.query(
      `SELECT \`${cfg.id}\` AS id, \`${cfg.title}\` AS titulo, id_estado
         FROM \`${cfg.table}\`
        WHERE \`${cfg.id}\` = ?`,
      [uuid]
    );
    if (!row) return res.status(404).json({ error: `${cfg.label} no encontrada.` });

    if (Number(row.id_estado) === ARCHIVE_STATE_ID) {
      return res.json({ success: true, estado: estadoInfo(ARCHIVE_STATE_ID), alreadyArchived: true });
    }

    await db.query(
      `UPDATE \`${cfg.table}\`
          SET id_estado = ?,
              fecha_archivado = NOW(),
              fecha_actualizacion = NOW(),
              id_usuario_actualizador = ?
        WHERE \`${cfg.id}\` = ?`,
      [ARCHIVE_STATE_ID, req.user.id, uuid]
    );

    console.log(`[ADMIN] ${cfg.label} ${uuid}: archivado (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(ARCHIVE_STATE_ID), fechaArchivado: new Date().toISOString() });
  } catch (err) {
    console.error('[PATCH /admin/:resource/:uuid/archive]', err);
    serverError(res, err);
  }
});

router.get('/admin/notificaciones', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `(SELECT id_senal      AS id, titulo_senal      AS titulo, 'senal'     AS tipo,
               id_estado, fecha_publicacion, fecha_creacion
        FROM senal
        WHERE id_estado = 1 AND fecha_publicacion IS NOT NULL)
       UNION ALL
       (SELECT id_tendencia  AS id, titulo_tendencia  AS titulo, 'tendencia' AS tipo,
               id_estado, fecha_publicacion, fecha_creacion
        FROM tendencia
        WHERE id_estado = 1 AND fecha_publicacion IS NOT NULL)
       UNION ALL
       (SELECT id_escenario  AS id, titulo_escenario  AS titulo, 'escenario' AS tipo,
               id_estado, fecha_publicacion, fecha_creacion
        FROM escenario
        WHERE id_estado = 1 AND fecha_publicacion IS NOT NULL)
       ORDER BY fecha_publicacion DESC
       LIMIT 30`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[GET /admin/notificaciones]', err);
    serverError(res, err);
  }
});

export default router;
