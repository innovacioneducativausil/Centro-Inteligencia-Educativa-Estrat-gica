
import { Router } from 'express';
import db from '../db.js';
import { auditEvent } from '../services/auditService.js';

const router = Router();

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
}

function buildActividadFilters(query) {
  const conds = [];
  const params = [];

  if (query.correo) { conds.push('correo = ?'); params.push(query.correo); }
  if (query.evento) { conds.push('evento = ?'); params.push(query.evento); }
  if (query.accion) { conds.push('accion = ?'); params.push(query.accion); }
  if (query.modulo) { conds.push('modulo = ?'); params.push(query.modulo); }
  if (query.ip) { conds.push('ip LIKE ?'); params.push(`%${query.ip}%`); }
  if (query.desde) { conds.push('fecha_hora >= ?'); params.push(query.desde + ' 00:00:00'); }
  if (query.hasta) { conds.push('fecha_hora <= ?'); params.push(query.hasta + ' 23:59:59'); }
  if (query.q) {
    conds.push('(correo LIKE ? OR evento LIKE ? OR accion LIKE ? OR modulo LIKE ? OR detalle LIKE ? OR elemento_titulo LIKE ? OR ip LIKE ? OR user_agent LIKE ? OR CAST(metadata AS CHAR) LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }

  return {
    where: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  // Las columnas JSON (p.ej. metadata) llegan ya parseadas como objeto desde
  // mysql2; sin este caso String(value) las volvia "[object Object]" en el CSV.
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function actividadCsv(rows) {
  const headers = ['fecha_hora', 'correo', 'rol', 'evento', 'accion', 'modulo', 'entidad', 'entidad_id', 'elemento_tipo', 'elemento_titulo', 'detalle', 'ip', 'user_agent', 'metadata'];
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n');
}


router.post('/actividad', async (req, res) => {
  try {
    const { evento, accion, modulo, vista, elementoUuid, elementoTipo, elementoTitulo, detalle, metadata } = req.body;
    if (!evento || typeof evento !== 'string') {
      return res.status(400).json({ error: 'evento es requerido.' });
    }

    const auditMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...(vista ? { vista } : {}),
    };

    await auditEvent(req, {
      evento,
      accion: accion || evento,
      modulo,
      entidadId: elementoUuid,
      elementoTipo,
      elementoTitulo,
      detalle,
      metadata: Object.keys(auditMetadata).length ? auditMetadata : null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /actividad]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});


router.get('/actividad', adminOnly, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const { where, params } = buildActividadFilters(req.query);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM actividad_usuario ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT id, id_usuario, correo, rol, evento, accion, modulo, entidad, entidad_id,
              elemento_uuid, elemento_tipo, elemento_titulo, detalle, ip, user_agent, metadata, fecha_hora
       FROM actividad_usuario
       ${where}
       ORDER BY fecha_hora DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ data: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /actividad]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});


router.get('/actividad/export', adminOnly, async (req, res) => {
  try {
    const { where, params } = buildActividadFilters(req.query);
    const [rows] = await db.query(
      `SELECT id, id_usuario, correo, rol, evento, accion, modulo, entidad, entidad_id,
              elemento_uuid, elemento_tipo, elemento_titulo, detalle, ip, user_agent, metadata, fecha_hora
       FROM actividad_usuario
       ${where}
       ORDER BY fecha_hora DESC
       LIMIT 5000`,
      params
    );

    await auditEvent(req, {
      evento: 'auditoria_exportada',
      accion: 'exportar_auditoria',
      modulo: 'monitor',
      entidad: 'actividad_usuario',
      detalle: `Exportacion CSV de auditoria (${rows.length} registros)`,
      metadata: { filtros: req.query, total: rows.length },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + actividadCsv(rows));
  } catch (err) {
    console.error('[GET /actividad/export]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});


router.get('/actividad/usuarios', adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT correo_usuario AS correo, nombre_usuario AS nombre, rol
       FROM usuario
       WHERE activo = 1
       ORDER BY correo_usuario ASC`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[GET /actividad/usuarios]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});


router.get('/actividad/eventos', adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT evento FROM actividad_usuario ORDER BY evento ASC`
    );
    res.json({ data: rows.map(r => r.evento) });
  } catch (err) {
    console.error('[GET /actividad/eventos]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

router.get('/actividad/acciones', adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT accion FROM actividad_usuario WHERE accion IS NOT NULL ORDER BY accion ASC`
    );
    res.json({ data: rows.map(r => r.accion) });
  } catch (err) {
    console.error('[GET /actividad/acciones]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

router.get('/actividad/modulos', adminOnly, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT modulo FROM actividad_usuario WHERE modulo IS NOT NULL ORDER BY modulo ASC`
    );
    res.json({ data: rows.map(r => r.modulo) });
  } catch (err) {
    console.error('[GET /actividad/modulos]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

export default router;
