import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import db from '../db.js';
import { auditEvent } from '../services/auditService.js';

const router = Router();
const MANAGED_ROLES = new Set(['usuario', 'lector', 'analista', 'editor']);
const EDITABLE_ROLES = new Set(['admin', 'usuario', 'lector', 'analista', 'editor']);

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
}

function normalizeEmail(correo) {
  return String(correo || '').trim().toLowerCase();
}

function validatePassword(password) {
  if (!password || password.length < 8) return 'La contrasena debe tener minimo 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'La contrasena debe contener al menos una letra mayuscula.';
  if (!/[0-9]/.test(password)) return 'La contrasena debe contener al menos un numero.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'La contrasena debe contener al menos un simbolo.';
  return null;
}

function safeUser(row) {
  return {
    id: row.id_usuario,
    nombre: row.nombre_usuario,
    nombreCorto: row.nombre_corto,
    correo: row.correo_usuario,
    rol: row.rol,
    activo: Boolean(row.activo),
    emailVerificado: Boolean(row.email_verificado),
    ultimoAcceso: row.ultimo_acceso,
    fechaCreacion: row.fecha_creacion,
    fechaActualizacion: row.fecha_actualizacion,
    passwordChangedAt: row.password_changed_at,
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockedUntil: row.locked_until,
    gestionable: EDITABLE_ROLES.has(row.rol),
  };
}

router.get('/admin/usuarios', adminOnly, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rol = String(req.query.rol || '').trim();
    const estado = String(req.query.estado || '').trim();
    const params = [];
    const conds = [];

    if (q) {
      conds.push('(nombre_usuario LIKE ? OR nombre_corto LIKE ? OR correo_usuario LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (rol) {
      conds.push('rol = ?');
      params.push(rol);
    }
    if (estado === 'activo') conds.push('activo = 1');
    if (estado === 'inactivo') conds.push('activo = 0');

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
              email_verificado, ultimo_acceso, fecha_creacion, fecha_actualizacion,
              password_changed_at, failed_login_attempts, locked_until
       FROM usuario
       ${where}
       ORDER BY rol = 'admin' DESC, activo DESC, correo_usuario ASC
       LIMIT 200`,
      params
    );
    res.json({ data: rows.map(safeUser), roles: [...MANAGED_ROLES] });
  } catch (err) {
    console.error('[GET /admin/usuarios]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

router.post('/admin/usuarios', adminOnly, async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const nombreCorto = String(req.body.nombreCorto || nombre.split(' ')[0] || '').trim();
    const correo = normalizeEmail(req.body.correo);
    const rol = String(req.body.rol || 'usuario').trim();
    const password = String(req.body.password || '');

    if (!nombre || !correo || !password) {
      return res.status(400).json({ error: 'Nombre, correo y contrasena son requeridos.' });
    }
    if (!correo.endsWith('@usil.edu.pe')) {
      return res.status(400).json({ error: 'Solo se permiten correos @usil.edu.pe.' });
    }
    if (!MANAGED_ROLES.has(rol)) {
      return res.status(400).json({ error: 'Rol no permitido para gestion desde consola.' });
    }
    const policyError = validatePassword(password);
    if (policyError) return res.status(400).json({ error: policyError });

    const [[exists]] = await db.query('SELECT id_usuario FROM usuario WHERE correo_usuario = ? LIMIT 1', [correo]);
    if (exists) return res.status(400).json({ error: 'Ya existe un usuario con ese correo.' });

    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO usuario
         (id_usuario, nombre_usuario, nombre_corto, correo_usuario, password_hash, rol,
          activo, email_verificado, password_changed_at, fecha_creacion, fecha_actualizacion)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW(), NOW())`,
      [id, nombre, nombreCorto, correo, hash, rol]
    );

    await auditEvent(req, {
      evento: 'usuario_creado',
      accion: 'crear_usuario',
      modulo: 'gestion_usuarios',
      entidad: 'usuario',
      entidadId: id,
      elementoTitulo: correo,
      detalle: `Usuario creado con rol ${rol}`,
      metadata: { rol },
    });

    const [[created]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
              email_verificado, ultimo_acceso, fecha_creacion, fecha_actualizacion,
              password_changed_at, failed_login_attempts, locked_until
       FROM usuario WHERE id_usuario = ?`,
      [id]
    );
    res.status(201).json({ user: safeUser(created) });
  } catch (err) {
    console.error('[POST /admin/usuarios]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

router.put('/admin/usuarios/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await db.query('SELECT id_usuario, correo_usuario, rol, activo FROM usuario WHERE id_usuario = ? LIMIT 1', [id]);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const nombre = String(req.body.nombre || '').trim();
    const nombreCorto = String(req.body.nombreCorto || nombre.split(' ')[0] || '').trim();
    const rol = String(req.body.rol || existing.rol).trim();
    const activo = req.body.activo === true || req.body.activo === 1;

    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido.' });
    if (!EDITABLE_ROLES.has(rol)) return res.status(400).json({ error: 'Rol no permitido.' });
    if (id === req.user.id && !activo) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    if (id === req.user.id && rol !== 'admin') {
      return res.status(400).json({ error: 'No puedes quitarte el rol administrador a ti mismo.' });
    }

    await db.query(
      `UPDATE usuario
       SET nombre_usuario = ?, nombre_corto = ?, rol = ?, activo = ?, fecha_actualizacion = NOW()
       WHERE id_usuario = ?`,
      [nombre, nombreCorto, rol, activo ? 1 : 0, id]
    );

    await auditEvent(req, {
      evento: 'usuario_actualizado',
      accion: 'editar_usuario',
      modulo: 'gestion_usuarios',
      entidad: 'usuario',
      entidadId: id,
      elementoTitulo: existing.correo_usuario,
      detalle: `Usuario actualizado. Rol ${rol}. Activo ${activo ? 'si' : 'no'}`,
      metadata: { rol, activo },
    });

    const [[updated]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
              email_verificado, ultimo_acceso, fecha_creacion, fecha_actualizacion,
              password_changed_at, failed_login_attempts, locked_until
       FROM usuario WHERE id_usuario = ?`,
      [id]
    );
    res.json({ user: safeUser(updated) });
  } catch (err) {
    console.error('[PUT /admin/usuarios/:id]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

router.post('/admin/usuarios/:id/reset-password', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await db.query('SELECT id_usuario, correo_usuario, rol FROM usuario WHERE id_usuario = ? LIMIT 1', [id]);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const tempPassword = `Usil${randomInt(100000, 999999)}!`;
    const hash = await bcrypt.hash(tempPassword, 10);
    await db.query(
      `UPDATE usuario
       SET password_hash = ?, password_changed_at = NOW(), failed_login_attempts = 0,
           locked_until = NULL, reset_token = NULL, reset_token_expires = NULL,
           otp_hash = NULL, otp_expires = NULL, otp_attempts = 0, otp_purpose = NULL,
           fecha_actualizacion = NOW()
       WHERE id_usuario = ?`,
      [hash, id]
    );

    await auditEvent(req, {
      evento: 'usuario_password_reseteado',
      accion: 'reset_password_usuario',
      modulo: 'gestion_usuarios',
      entidad: 'usuario',
      entidadId: id,
      elementoTitulo: existing.correo_usuario,
      detalle: 'Contrasena temporal generada por administrador',
    });

    res.json({ tempPassword });
  } catch (err) {
    console.error('[POST /admin/usuarios/:id/reset-password]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

export default router;
