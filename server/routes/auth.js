// server/routes/auth.js
import { Router }       from 'express';
import bcrypt           from 'bcryptjs';
import jwt              from 'jsonwebtoken';
import crypto           from 'crypto';
import db               from '../db.js';
import { sendOtpEmail } from '../mailer.js';

const router = Router();
const JWT_SECRET  = process.env.JWT_SECRET;   // falla en startup si no está (ver server.js)
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const AUTH_COOKIE = 'radar_token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const OTP_EXPIRES_MS = 5 * 60 * 1000;

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

// ── Rol → etiqueta legible ───────────────────────────────
const ROL_LABELS = {
  admin:   'Administrador',
  usuario: 'Usuario',
};

async function logActividad(db, idUsuario, correo, evento, ip) {
  try {
    await db.query(
      `INSERT INTO actividad_usuario (id_usuario, correo, evento, ip, fecha_hora)
       VALUES (?, ?, ?, ?, NOW())`,
      [idUsuario, correo, evento, ip || null]
    );
  } catch { /* silencioso — no bloquear login/logout */ }
}

function buildAuthUser(user) {
  const nombre = user.nombre_corto || user.nombre_usuario;
  return {
    id:          user.id_usuario,
    nombre,
    nombreCompleto: user.nombre_usuario,
    correo:      user.correo_usuario,
    rol:         user.rol,
    rolLabel:    ROL_LABELS[user.rol] || user.rol,
    iniciales:   nombre
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase(),
  };
}

function signAuthToken(user) {
  const payload = {
    id:     user.id_usuario,
    nombre: user.nombre_corto || user.nombre_usuario,
    correo: user.correo_usuario,
    rol:    user.rol,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function createOtpForUser(user, purpose) {
  const otp     = crypto.randomInt(100000, 999999).toString();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expires = new Date(Date.now() + OTP_EXPIRES_MS);

  await db.query(
    `UPDATE usuario
     SET otp_hash = ?, otp_expires = ?, otp_attempts = 0, otp_purpose = ?
     WHERE id_usuario = ?`,
    [otpHash, expires, purpose, user.id_usuario]
  );

  await sendOtpEmail({
    to: user.correo_usuario,
    nombre: user.nombre_corto || user.nombre_usuario,
    otp,
  });
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null;
}

/**
 * POST /api/auth/login
 * body: { correo: string, password: string }
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contrasena son requeridos.' });
    }

    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario,
              password_hash, rol, activo, email_verificado
       FROM usuario
       WHERE correo_usuario = ?
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Tu cuenta esta desactivada. Contacta al administrador.' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    await createOtpForUser(user, 'login');

    res.json({
      requiresOtp: true,
      correo: user.correo_usuario,
      message: 'Hemos enviado un codigo de verificacion a tu correo institucional.',
    });
  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/login/verify-otp
 * body: { correo: string, otp: string }
 * Valida el OTP de login. Solo entonces emite la cookie/JWT de sesion.
 */
router.post('/auth/login/verify-otp', async (req, res) => {
  try {
    const { correo, otp } = req.body;

    if (!correo || !otp) {
      return res.status(400).json({ error: 'Correo y codigo son requeridos.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'El codigo debe ser de 6 digitos numericos.' });
    }

    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
              otp_hash, otp_expires, otp_attempts, otp_purpose
       FROM usuario
       WHERE correo_usuario = ? AND activo = 1
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    if (!user || !user.otp_hash || user.otp_purpose !== 'login') {
      return res.status(400).json({ error: 'Solicita un nuevo codigo de verificacion.' });
    }

    if (user.otp_attempts >= 5) {
      return res.status(429).json({
        error: 'Demasiados intentos fallidos. Solicita un nuevo codigo de verificacion.',
        blocked: true,
      });
    }

    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        error: 'El codigo ha expirado. Solicita uno nuevo.',
        expired: true,
      });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (otpHash !== user.otp_hash) {
      await db.query(
        'UPDATE usuario SET otp_attempts = otp_attempts + 1 WHERE id_usuario = ?',
        [user.id_usuario]
      );
      const remaining = 4 - user.otp_attempts;
      return res.status(400).json({
        error: remaining > 0
          ? `Codigo incorrecto. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}.`
          : 'Codigo incorrecto. Has agotado los intentos. Solicita un nuevo codigo.',
        remaining,
      });
    }

    await db.query(
      `UPDATE usuario
       SET otp_hash = NULL, otp_expires = NULL, otp_attempts = 0,
           otp_purpose = NULL, ultimo_acceso = NOW()
       WHERE id_usuario = ?`,
      [user.id_usuario]
    );

    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());

    logActividad(db, user.id_usuario, user.correo_usuario, 'login', getClientIp(req));

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (err) {
    console.error('[POST /auth/login/verify-otp]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/login/resend-otp
 * body: { correo: string }
 * Reenvia el OTP solo si existe un login pendiente para ese correo.
 */
router.post('/auth/login/resend-otp', async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) {
      return res.status(400).json({ error: 'El correo es requerido.' });
    }

    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, activo, otp_purpose
       FROM usuario
       WHERE correo_usuario = ? AND activo = 1
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    if (!user || user.otp_purpose !== 'login') {
      return res.status(400).json({ error: 'Inicia sesion nuevamente para solicitar otro codigo.' });
    }

    await createOtpForUser(user, 'login');
    res.json({ message: 'Hemos enviado un nuevo codigo de verificacion a tu correo institucional.' });
  } catch (err) {
    console.error('[POST /auth/login/resend-otp]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * GET /api/auth/me
 * Devuelve el usuario autenticado a partir del JWT (útil para validar sesión al recargar).
 */
router.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.[AUTH_COOKIE];
    if (!authHeader?.startsWith('Bearer ') && !cookieToken) {
      return res.status(401).json({ error: 'Token no proporcionado.' });
    }

    let payload;
    try {
      payload = jwt.verify(authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    // Refrescar datos desde la BD (por si el rol cambió)
    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo
       FROM usuario WHERE id_usuario = ? AND activo = 1`,
      [payload.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o desactivado.' });
    }

    const nombre = user.nombre_corto || user.nombre_usuario;

    // Si el rol cambió desde que se emitió el JWT, emitir cookie renovada
    if (user.rol !== payload.rol) {
      const newToken = jwt.sign(
        { id: user.id_usuario, nombre, correo: user.correo_usuario, rol: user.rol },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );
      res.cookie(AUTH_COOKIE, newToken, authCookieOptions());
    }

    res.json({
      user: {
        id:          user.id_usuario,
        nombre,
        nombreCompleto: user.nombre_usuario,
        correo:      user.correo_usuario,
        rol:         user.rol,
        rolLabel:    ROL_LABELS[user.rol] || user.rol,
        iniciales:   nombre
          .split(' ')
          .slice(0, 2)
          .map(w => w[0])
          .join('')
          .toUpperCase(),
      },
    });
  } catch (err) {
    console.error('[GET /auth/me]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/forgot-password
 * body: { correo: string }
 * Genera un token seguro, lo guarda en la BD con expiración de 1 hora
 * y envía el correo con el enlace de restablecimiento.
 */
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) {
      return res.status(400).json({ error: 'El correo es requerido.' });
    }

    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, activo
       FROM usuario
       WHERE correo_usuario = ?
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    // Respuesta siempre igual (evita enumerar qué correos existen)
    if (!user || !user.activo) {
      return res.json({
        message: 'Hemos enviado un código de verificación a tu correo institucional.',
      });
    }

    // Generar OTP de 6 dígitos criptográficamente seguro
    const otp     = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expires = new Date(Date.now() + OTP_EXPIRES_MS); // 5 minutos

    // Guardar hash del OTP, invalidar token anterior
    await db.query(
      `UPDATE usuario
       SET otp_hash = ?, otp_expires = ?, otp_attempts = 0, otp_purpose = 'reset',
           reset_token = NULL, reset_token_expires = NULL
       WHERE id_usuario = ?`,
      [otpHash, expires, user.id_usuario]
    );

    const nombre = user.nombre_corto || user.nombre_usuario;
    await sendOtpEmail({ to: correo.trim(), nombre, otp });

    res.json({
      message: 'Hemos enviado un código de verificación a tu correo institucional.',
    });
  } catch (err) {
    console.error('[POST /auth/forgot-password]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/verify-otp
 * body: { correo: string, otp: string }
 * Valida el OTP, controla intentos y expiry. Si es válido, devuelve un reset token.
 */
router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { correo, otp } = req.body;

    if (!correo || !otp) {
      return res.status(400).json({ error: 'Correo y código son requeridos.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'El código debe ser de 6 dígitos numéricos.' });
    }

    const [[user]] = await db.query(
      `SELECT id_usuario, otp_hash, otp_expires, otp_attempts, otp_purpose
       FROM usuario
       WHERE correo_usuario = ? AND activo = 1
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    // Respuesta genérica si no existe OTP (sin revelar info)
    if (!user || !user.otp_hash || user.otp_purpose !== 'reset') {
      return res.status(400).json({ error: 'Solicita un nuevo código de verificación.' });
    }

    // Bloqueo por exceso de intentos (5 máx — HU003)
    if (user.otp_attempts >= 5) {
      console.warn(`[VERIFY OTP] Cuenta bloqueada temporalmente: ${correo}`);
      return res.status(429).json({
        error: 'Demasiados intentos fallidos. Solicita un nuevo código de verificación.',
        blocked: true,
      });
    }

    // Verificar expiración (5 minutos)
    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        error: 'El código ha expirado. Solicita uno nuevo.',
        expired: true,
      });
    }

    // Validar hash del OTP
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (otpHash !== user.otp_hash) {
      await db.query(
        'UPDATE usuario SET otp_attempts = otp_attempts + 1 WHERE id_usuario = ?',
        [user.id_usuario]
      );
      const remaining = 4 - user.otp_attempts;
      console.warn(`[VERIFY OTP] Intento fallido para: ${correo} (intentos: ${user.otp_attempts + 1})`);
      return res.status(400).json({
        error: remaining > 0
          ? `Código incorrecto. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}.`
          : 'Código incorrecto. Has agotado los intentos. Solicita un nuevo código.',
        remaining,
      });
    }

    // OTP válido — generar reset token y limpiar OTP
    const resetToken   = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db.query(
      `UPDATE usuario
       SET otp_hash = NULL, otp_expires = NULL, otp_attempts = 0, otp_purpose = NULL,
           reset_token = ?, reset_token_expires = ?
       WHERE id_usuario = ?`,
      [resetToken, resetExpires, user.id_usuario]
    );

    console.log(`[VERIFY OTP] ${new Date().toISOString()} — OTP verificado para: ${correo}`);
    res.json({ valid: true, token: resetToken });

  } catch (err) {
    console.error('[POST /auth/verify-otp]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * GET /api/auth/verify-reset-token/:token
 * Valida si un token de reset es válido y no ha expirado.
 * Usado por el frontend al cargar la página con ?reset_token=...
 */
router.get('/auth/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_corto, nombre_usuario, correo_usuario
       FROM usuario
       WHERE reset_token = ?
         AND reset_token_expires > NOW()
         AND activo = 1
       LIMIT 1`,
      [token]
    );

    if (!user) {
      return res.status(400).json({
        valid:   false,
        error:   'El enlace es inválido o ha expirado. Solicita uno nuevo.',
      });
    }

    res.json({
      valid:  true,
      correo: user.correo_usuario,
      nombre: user.nombre_corto || user.nombre_usuario,
    });
  } catch (err) {
    console.error('[GET /auth/verify-reset-token]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/reset-password
 * body: { token: string, newPassword: string }
 * Valida el token, actualiza la contraseña y lo invalida.
 */
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token y nueva contraseña son requeridos.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres.' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'La contraseña debe contener al menos una letra mayúscula.' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'La contraseña debe contener al menos un número.' });
    }

    // Buscar usuario por token válido y no expirado
    const [[user]] = await db.query(
      `SELECT id_usuario, correo_usuario, password_hash
       FROM usuario
       WHERE reset_token = ?
         AND reset_token_expires > NOW()
         AND activo = 1
       LIMIT 1`,
      [token]
    );

    if (!user) {
      return res.status(400).json({
        error: 'El enlace es inválido o ha expirado. Solicita un nuevo correo de recuperación.',
      });
    }

    // Verificar que la nueva contraseña sea diferente a la actual
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      return res.status(400).json({
        error: 'La nueva contraseña no puede ser igual a la anterior. Elige una contraseña diferente.',
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña e invalidar el token
    await db.query(
      `UPDATE usuario
       SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL,
           fecha_actualizacion = NOW()
       WHERE id_usuario = ?`,
      [hash, user.id_usuario]
    );

    console.log(`[RESET PASSWORD] ${new Date().toISOString()} — contraseña actualizada para: ${user.correo_usuario}`);

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('[POST /auth/reset-password]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/logout
 * El token se invalida en el cliente (borrando localStorage).
 * Este endpoint solo confirma la operación.
 */
router.post('/auth/logout', (req, res) => {
  // Intentar extraer usuario del token para loguear el cierre de sesión
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, JWT_SECRET);
      const logoutIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null;
      logActividad(db, payload.id, payload.correo, 'logout', logoutIp);
    } catch { /* token ya expirado — no bloquear */ }
  }
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.json({ message: 'Sesión cerrada correctamente.' });
});

export default router;
