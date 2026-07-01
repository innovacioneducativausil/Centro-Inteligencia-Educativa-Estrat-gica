
import { Router }       from 'express';
import bcrypt           from 'bcryptjs';
import jwt              from 'jsonwebtoken';
import crypto           from 'crypto';
import db               from '../db.js';
import { sendOtpEmail } from '../mailer.js';
import { auditEvent }   from '../services/auditService.js';

const router = Router();
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const AUTH_COOKIE = 'radar_token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const OTP_EXPIRES_MS = 5 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}


const ROL_LABELS = {
  admin:   'Administrador',
  usuario: 'Usuario',
};

const DEFAULT_MODULES = ['inicio', 'radar', 'empleabilidad', 'impactos', 'curricular', 'mercadoLaboral'];
const ADMIN_MODULES = [...DEFAULT_MODULES, 'informes', 'gestion'];
const ALL_MODULES = [...ADMIN_MODULES];

function parseAllowedModules(raw, rol) {
  const allowed = rol === 'admin' ? ALL_MODULES : ALL_MODULES.filter(m => m !== 'gestion');
  if (!raw) return rol === 'admin' ? ADMIN_MODULES : DEFAULT_MODULES;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const filtered = Array.isArray(parsed) ? parsed.filter(m => allowed.includes(m)) : [];
    return filtered.length ? filtered : (rol === 'admin' ? ADMIN_MODULES : DEFAULT_MODULES);
  } catch {
    return rol === 'admin' ? ADMIN_MODULES : DEFAULT_MODULES;
  }
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
    modulosPermitidos: parseAllowedModules(user.modulos_permitidos, user.rol),
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

function validatePasswordPolicy(password) {
  if (!password || password.length < 8) return 'La contrasena debe tener minimo 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'La contrasena debe contener al menos una letra mayuscula.';
  if (!/[0-9]/.test(password)) return 'La contrasena debe contener al menos un numero.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'La contrasena debe contener al menos un simbolo.';
  return null;
}


router.post('/auth/login', async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contrasena son requeridos.' });
    }

    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario,
              password_hash, rol, activo, email_verificado, failed_login_attempts, locked_until, modulos_permitidos
       FROM usuario
       WHERE correo_usuario = ?
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    if (!user) {
      await auditEvent(req, {
        evento: 'login_fallido',
        accion: 'login',
        modulo: 'auth',
        correo: correo.trim().toLowerCase(),
        detalle: 'Usuario no encontrado',
      });
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    if (!user.activo) {
      await auditEvent(req, {
        evento: 'login_bloqueado',
        accion: 'login',
        modulo: 'auth',
        idUsuario: user.id_usuario,
        correo: user.correo_usuario,
        rol: user.rol,
        detalle: 'Cuenta desactivada',
      });
      return res.status(403).json({ error: 'Tu cuenta esta desactivada. Contacta al administrador.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await auditEvent(req, {
        evento: 'login_bloqueado',
        accion: 'login',
        modulo: 'auth',
        idUsuario: user.id_usuario,
        correo: user.correo_usuario,
        rol: user.rol,
        detalle: 'Cuenta bloqueada temporalmente',
      });
      return res.status(429).json({ error: 'Cuenta bloqueada temporalmente. Intenta nuevamente mas tarde.' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      const attempts = Number(user.failed_login_attempts || 0) + 1;
      const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      await db.query(
        `UPDATE usuario
         SET failed_login_attempts = ?,
             locked_until = ${shouldLock ? 'DATE_ADD(NOW(), INTERVAL ? MINUTE)' : 'NULL'},
             fecha_actualizacion = NOW()
         WHERE id_usuario = ?`,
        shouldLock ? [attempts, LOCK_MINUTES, user.id_usuario] : [attempts, user.id_usuario]
      );
      await auditEvent(req, {
        evento: shouldLock ? 'login_bloqueado' : 'login_fallido',
        accion: 'login',
        modulo: 'auth',
        idUsuario: user.id_usuario,
        correo: user.correo_usuario,
        rol: user.rol,
        detalle: shouldLock ? 'Cuenta bloqueada por intentos fallidos' : 'Contrasena incorrecta',
        metadata: { attempts },
      });
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    await db.query(
      `UPDATE usuario
       SET failed_login_attempts = 0, locked_until = NULL, fecha_actualizacion = NOW()
       WHERE id_usuario = ?`,
      [user.id_usuario]
    );
    await createOtpForUser(user, 'login');
    await auditEvent(req, {
      evento: 'login_otp_generado',
      accion: 'login',
      modulo: 'auth',
      idUsuario: user.id_usuario,
      correo: user.correo_usuario,
      rol: user.rol,
      detalle: 'Credenciales validas, OTP enviado',
    });

    res.json({
      requiresOtp: true,
      correo: user.correo_usuario,
      message: 'Codigo de verificacion enviado a tu correo institucional.',
    });
  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});


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
              otp_hash, otp_expires, otp_attempts, otp_purpose, modulos_permitidos
       FROM usuario
       WHERE correo_usuario = ? AND activo = 1
       LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    if (!user || !user.otp_hash || user.otp_purpose !== 'login') {
      return res.status(400).json({ error: 'Solicita un nuevo codigo de verificacion.' });
    }

    if (user.otp_attempts >= 5) {
      await auditEvent(req, {
        evento: 'otp_bloqueado',
        accion: 'verify_otp',
        modulo: 'auth',
        idUsuario: user.id_usuario,
        correo: user.correo_usuario,
        rol: user.rol,
        detalle: 'Intentos OTP agotados',
      });
      return res.status(429).json({
        error: 'Demasiados intentos fallidos. Solicita un nuevo codigo de verificacion.',
        blocked: true,
      });
    }

    if (new Date() > new Date(user.otp_expires)) {
      await auditEvent(req, {
        evento: 'otp_expirado',
        accion: 'verify_otp',
        modulo: 'auth',
        idUsuario: user.id_usuario,
        correo: user.correo_usuario,
        rol: user.rol,
      });
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
      await auditEvent(req, {
        evento: 'otp_fallido',
        accion: 'verify_otp',
        modulo: 'auth',
        idUsuario: user.id_usuario,
        correo: user.correo_usuario,
        rol: user.rol,
        metadata: { attempts: user.otp_attempts + 1 },
      });
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
           otp_purpose = NULL, ultimo_acceso = NOW(), failed_login_attempts = 0, locked_until = NULL
       WHERE id_usuario = ?`,
      [user.id_usuario]
    );

    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());

    await auditEvent(req, {
      evento: 'login_exitoso',
      accion: 'login',
      modulo: 'auth',
      idUsuario: user.id_usuario,
      correo: user.correo_usuario,
      rol: user.rol,
      detalle: 'MFA validado',
    });

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (err) {
    console.error('[POST /auth/login/verify-otp]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});


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


    const [[user]] = await db.query(
      `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
              modulos_permitidos
       FROM usuario WHERE id_usuario = ? AND activo = 1`,
      [payload.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o desactivado.' });
    }

    const nombre = user.nombre_corto || user.nombre_usuario;


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
        modulosPermitidos: parseAllowedModules(user.modulos_permitidos, user.rol),
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


    if (!user || !user.activo) {
      return res.json({
        message: 'Hemos enviado un código de verificación a tu correo institucional.',
      });
    }


    const otp     = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expires = new Date(Date.now() + OTP_EXPIRES_MS);


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


    if (!user || !user.otp_hash || user.otp_purpose !== 'reset') {
      return res.status(400).json({ error: 'Solicita un nuevo código de verificación.' });
    }


    if (user.otp_attempts >= 5) {
      console.warn(`[VERIFY OTP] Cuenta bloqueada temporalmente: ${correo}`);
      return res.status(429).json({
        error: 'Demasiados intentos fallidos. Solicita un nuevo código de verificación.',
        blocked: true,
      });
    }


    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        error: 'El código ha expirado. Solicita uno nuevo.',
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
      console.warn(`[VERIFY OTP] Intento fallido para: ${correo} (intentos: ${user.otp_attempts + 1})`);
      return res.status(400).json({
        error: remaining > 0
          ? `Código incorrecto. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}.`
          : 'Código incorrecto. Has agotado los intentos. Solicita un nuevo código.',
        remaining,
      });
    }


    const resetToken   = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

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


router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token y nueva contrasena son requeridos.' });
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) return res.status(400).json({ error: policyError });

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
        error: 'El enlace es invalido o ha expirado. Solicita un nuevo correo de recuperacion.',
      });
    }

    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      return res.status(400).json({
        error: 'La nueva contrasena no puede ser igual a la anterior. Elige una contrasena diferente.',
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await db.query(
      `UPDATE usuario
       SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL,
           password_changed_at = NOW(), failed_login_attempts = 0, locked_until = NULL,
           fecha_actualizacion = NOW()
       WHERE id_usuario = ?`,
      [hash, user.id_usuario]
    );

    await auditEvent(req, {
      evento: 'password_reset',
      accion: 'reset_password',
      modulo: 'auth',
      idUsuario: user.id_usuario,
      correo: user.correo_usuario,
      detalle: 'Contrasena actualizada por recuperacion',
    });

    res.json({ message: 'Contrasena actualizada correctamente.' });
  } catch (err) {
    console.error('[POST /auth/reset-password]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/auth/logout', (req, res) => {

  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, JWT_SECRET);
      auditEvent(req, {
        evento: 'logout',
        accion: 'logout',
        modulo: 'auth',
        idUsuario: payload.id,
        correo: payload.correo,
        rol: payload.rol,
      });
    } catch {}
  }
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.json({ message: 'Sesión cerrada correctamente.' });
});

export default router;
