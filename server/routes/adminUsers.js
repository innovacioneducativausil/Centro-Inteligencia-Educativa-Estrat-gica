import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { serverError } from '../middleware/errorHandler.js';
import { auditEvent } from '../services/auditService.js';
import {
  anonymizeUserData,
  countActiveAdmins,
  createUser,
  getAdminUsers,
  getEditableUserById,
  getUserByEmail,
  getUserForDeletion,
  getUserForPasswordReset,
  resetUserPassword,
  updateUser,
} from '../repositories/principal/adminUsersRepository.js';

const router = Router();
//----------------OBS-01 / TI-02----------------
const MANAGED_ROLES = new Set(['usuario']);
const EDITABLE_ROLES = new Set(['admin', 'usuario']);
const ALL_MODULES = ['inicio', 'radar', 'empleabilidad', 'certificaciones', 'impactos', 'curricular', 'mercadoLaboral', 'informes', 'gestion'];
const DEFAULT_USER_MODULES = ['inicio', 'radar', 'empleabilidad', 'certificaciones', 'impactos', 'curricular', 'mercadoLaboral'];
const DEFAULT_ADMIN_MODULES = ALL_MODULES;

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
}

function normalizeEmail(correo) {
  return String(correo || '').trim().toLowerCase();
}

//----------------TI-53----------------
function validatePassword(password) {
  if (!password || password.length < 8) return 'La contrasena debe tener minimo 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'La contrasena debe contener al menos una letra mayuscula.';
  if (!/[0-9]/.test(password)) return 'La contrasena debe contener al menos un numero.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'La contrasena debe contener al menos un simbolo.';
  return null;
}

//----------------OBS-01 / TI-02----------------
function parseModules(raw, rol) {
  const allowed = rol === 'admin' ? ALL_MODULES : ALL_MODULES.filter(m => m !== 'gestion');
  if (!raw) return rol === 'admin' ? DEFAULT_ADMIN_MODULES : DEFAULT_USER_MODULES;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const filtered = Array.isArray(parsed) ? parsed.filter(m => allowed.includes(m)) : [];
    return filtered.length ? filtered : (rol === 'admin' ? DEFAULT_ADMIN_MODULES : DEFAULT_USER_MODULES);
  } catch {
    return rol === 'admin' ? DEFAULT_ADMIN_MODULES : DEFAULT_USER_MODULES;
  }
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
    modulosPermitidos: parseModules(row.modulos_permitidos, row.rol),
    gestionable: EDITABLE_ROLES.has(row.rol),
  };
}

//----------------OBS-01 / TI-02----------------
router.get('/admin/usuarios', adminOnly, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rol = String(req.query.rol || '').trim();
    const estado = String(req.query.estado || '').trim();
    const rows = await getAdminUsers({ q, rol, estado });
    res.json({ data: rows.map(safeUser), roles: [...MANAGED_ROLES], modulos: ALL_MODULES });
  } catch (err) {
    serverError(res, err, 'GET /admin/usuarios');
  }
});

//----------------OBS-01 / TI-02----------------
router.post('/admin/usuarios', adminOnly, async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const nombreCorto = String(req.body.nombreCorto || nombre.split(' ')[0] || '').trim();
    const correo = normalizeEmail(req.body.correo);
    const rol = String(req.body.rol || 'usuario').trim();
    const password = String(req.body.password || '');
    const modulos = parseModules(req.body.modulosPermitidos, rol);

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

    const exists = await getUserByEmail(correo);
    if (exists) return res.status(400).json({ error: 'Ya existe un usuario con ese correo.' });

    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const created = await createUser({ id, nombre, nombreCorto, correo, passwordHash: hash, rol, modulos });

    //----------------TI-44 / TI-59----------------
    await auditEvent(req, {
      evento: 'usuario_creado',
      accion: 'crear_usuario',
      modulo: 'gestion_usuarios',
      entidad: 'usuario',
      entidadId: id,
      elementoTitulo: correo,
      detalle: `Usuario creado con rol ${rol}`,
      metadata: { rol, modulos },
    });

    res.status(201).json({ user: safeUser(created) });
  } catch (err) {
    serverError(res, err, 'POST /admin/usuarios');
  }
});

//----------------OBS-01 / TI-02----------------
router.put('/admin/usuarios/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getEditableUserById(id);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const nombre = String(req.body.nombre || '').trim();
    const nombreCorto = String(req.body.nombreCorto || nombre.split(' ')[0] || '').trim();
    const rol = String(req.body.rol || existing.rol).trim();
    const activo = req.body.activo === true || req.body.activo === 1;
    const modulos = parseModules(req.body.modulosPermitidos, rol);

    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido.' });
    if (!EDITABLE_ROLES.has(rol)) return res.status(400).json({ error: 'Rol no permitido.' });
    if (id === req.user.id && !activo) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    if (id === req.user.id && rol !== 'admin') {
      return res.status(400).json({ error: 'No puedes quitarte el rol administrador a ti mismo.' });
    }
    if (id === req.user.id && !modulos.includes('gestion')) {
      return res.status(400).json({ error: 'No puedes quitarte tu acceso al modulo Gestion.' });
    }

    const updated = await updateUser({ id, nombre, nombreCorto, rol, activo, modulos });

    const prevModules = parseModules(existing.modulos_permitidos, existing.rol);
    const cambios = [];
    if (existing.nombre_usuario !== nombre) cambios.push({ campo: 'nombre', antes: existing.nombre_usuario, despues: nombre });
    if ((existing.nombre_corto || '') !== nombreCorto) cambios.push({ campo: 'nombre_corto', antes: existing.nombre_corto || '', despues: nombreCorto });
    if (existing.rol !== rol) cambios.push({ campo: 'rol', antes: existing.rol, despues: rol });
    if (Boolean(existing.activo) !== Boolean(activo)) cambios.push({ campo: 'activo', antes: Boolean(existing.activo), despues: Boolean(activo) });
    const prevModulesKey = [...prevModules].sort().join(',');
    const nextModulesKey = [...modulos].sort().join(',');
    if (prevModulesKey !== nextModulesKey) cambios.push({ campo: 'modulos_permitidos', antes: prevModules, despues: modulos });
    const cambiosTexto = cambios.length
      ? cambios.map(c => `${c.campo}: "${Array.isArray(c.antes) ? c.antes.join('|') : c.antes}" -> "${Array.isArray(c.despues) ? c.despues.join('|') : c.despues}"`).join('; ')
      : 'sin cambios de datos';

    //----------------TI-44 / TI-59----------------
    await auditEvent(req, {
      evento: 'usuario_actualizado',
      accion: 'editar_usuario',
      modulo: 'gestion_usuarios',
      entidad: 'usuario',
      entidadId: id,
      elementoTipo: 'usuario',
      elementoTitulo: `${nombre} (${existing.correo_usuario})`,
      detalle: `Vista Usuarios y Accesos. Usuario modificado: ${existing.correo_usuario}. Cambios: ${cambiosTexto}`,
      metadata: { vista: 'usuarios_y_accesos', usuarioObjetivo: existing.correo_usuario, cambios, rol, activo, modulos },
    });

    res.json({ user: safeUser(updated) });
  } catch (err) {
    serverError(res, err, 'PUT /admin/usuarios/:id');
  }
});

//----------------TI-53 / OBS-01----------------
router.post('/admin/usuarios/:id/reset-password', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getUserForPasswordReset(id);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const tempPassword = `Usil${randomInt(100000, 999999)}!`;
    const hash = await bcrypt.hash(tempPassword, 10);
    await resetUserPassword({ id, passwordHash: hash });

    //----------------TI-44 / TI-59----------------
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
    serverError(res, err, 'POST /admin/usuarios/:id/reset-password');
  }
});

//----------------TI-41----------------
// Eliminacion segura + anonimizacion/pseudonimizacion de datos personales.
// No se hace DELETE fisico (romperia integridad referencial de auditoria);
// en su lugar se sustituyen los identificadores personales por valores no
// reversibles y se desactiva la cuenta, preservando el registro de auditoria
// (evento/accion/modulo) de forma pseudonimizada para trazabilidad legal.
router.post('/admin/usuarios/:id/eliminar-datos', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getUserForDeletion(id);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes anonimizar tu propia cuenta.' });
    }
    if (existing.rol === 'admin') {
      const total = await countActiveAdmins();
      if (total <= 1) {
        return res.status(400).json({ error: 'No puedes anonimizar al unico administrador activo.' });
      }
    }

    const pseudonimo = `usuario-eliminado-${randomUUID().slice(0, 8)}`;
    const correoPseudo = `${pseudonimo}@anonimizado.local`;
    const inertHash = await bcrypt.hash(randomUUID(), 10);
    const correoOriginalEnmascarado = existing.correo_usuario.replace(/^(.{2}).*(@.*)$/, '$1***$2');

    await anonymizeUserData({ id, correoPseudo, passwordHash: inertHash });

    await auditEvent(req, {
      evento: 'usuario_datos_anonimizados',
      accion: 'eliminar_datos_usuario',
      modulo: 'gestion_usuarios',
      entidad: 'usuario',
      entidadId: id,
      elementoTitulo: correoPseudo,
      detalle: `Datos personales anonimizados/pseudonimizados para ${correoOriginalEnmascarado}`,
    });

    res.json({ ok: true, correoPseudo });
  } catch (err) {
    serverError(res, err, 'POST /admin/usuarios/:id/eliminar-datos');
  }
});

export default router;
