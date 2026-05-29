// server/routes/actividad.js — Registro y consulta de actividad de usuarios
import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Únicos correos que pueden leer el monitoreo completo
const MONITOR_CORREOS = new Set(['acastroh@usil.edu.pe', 'mmontoyar@usil.edu.pe']);

// ── POST /api/actividad ────────────────────────────────────
// Registra un evento de actividad. Accesible a todos los usuarios autenticados.
router.post('/actividad', async (req, res) => {
  try {
    const { evento, modulo, elementoUuid, elementoTipo, elementoTitulo, metadata } = req.body;
    if (!evento || typeof evento !== 'string') {
      return res.status(400).json({ error: 'evento es requerido.' });
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : (req.socket?.remoteAddress || null);
    const userAgent = req.headers['user-agent'] || null;

    await db.query(
      `INSERT INTO actividad_usuario
         (id_usuario, correo, evento, modulo, elemento_uuid, elemento_tipo, elemento_titulo, ip, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.user.correo,
        evento.slice(0, 100),
        modulo          ? String(modulo).slice(0, 100)          : null,
        elementoUuid    ? String(elementoUuid).slice(0, 36)     : null,
        elementoTipo    ? String(elementoTipo).slice(0, 50)     : null,
        elementoTitulo  ? String(elementoTitulo).slice(0, 500)  : null,
        ip              ? ip.slice(0, 45)                       : null,
        userAgent       ? userAgent.slice(0, 512)               : null,
        metadata        ? JSON.stringify(metadata)              : null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /actividad]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ── GET /api/actividad ─────────────────────────────────────
// Lee el log de actividad. Solo para correos autorizados.
router.get('/actividad', async (req, res) => {
  if (!MONITOR_CORREOS.has(req.user.correo)) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conds  = [];
    const params = [];

    if (req.query.correo) { conds.push('correo = ?');           params.push(req.query.correo); }
    if (req.query.evento) { conds.push('evento = ?');           params.push(req.query.evento); }
    if (req.query.desde)  { conds.push('fecha_hora >= ?');      params.push(req.query.desde + ' 00:00:00'); }
    if (req.query.hasta)  { conds.push('fecha_hora <= ?');      params.push(req.query.hasta + ' 23:59:59'); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM actividad_usuario ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT id, correo, evento, modulo, elemento_uuid, elemento_tipo, elemento_titulo, ip, fecha_hora
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

// ── GET /api/actividad/usuarios ────────────────────────────
// Lista todos los usuarios de la BD (para el filtro). Solo para correos autorizados.
router.get('/actividad/usuarios', async (req, res) => {
  if (!MONITOR_CORREOS.has(req.user.correo)) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
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

// ── GET /api/actividad/eventos ─────────────────────────────
// Lista de tipos de evento únicos. Solo para correos autorizados.
router.get('/actividad/eventos', async (req, res) => {
  if (!MONITOR_CORREOS.has(req.user.correo)) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
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

export default router;
