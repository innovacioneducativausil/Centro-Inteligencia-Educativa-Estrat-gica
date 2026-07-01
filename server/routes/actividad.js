
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


router.post('/actividad', async (req, res) => {
  try {
    const { evento, modulo, elementoUuid, elementoTipo, elementoTitulo, metadata } = req.body;
    if (!evento || typeof evento !== 'string') {
      return res.status(400).json({ error: 'evento es requerido.' });
    }

    await auditEvent(req, {
      evento,
      accion: evento,
      modulo,
      entidadId: elementoUuid,
      elementoTipo,
      elementoTitulo,
      metadata,
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

    const conds  = [];
    const params = [];

    if (req.query.correo) { conds.push('correo = ?');           params.push(req.query.correo); }
    if (req.query.evento) { conds.push('evento = ?');           params.push(req.query.evento); }
    if (req.query.modulo) { conds.push('modulo = ?');           params.push(req.query.modulo); }
    if (req.query.desde)  { conds.push('fecha_hora >= ?');      params.push(req.query.desde + ' 00:00:00'); }
    if (req.query.hasta)  { conds.push('fecha_hora <= ?');      params.push(req.query.hasta + ' 23:59:59'); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

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
