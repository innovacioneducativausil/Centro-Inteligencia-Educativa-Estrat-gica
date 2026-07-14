import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendOtpEmail } from '../mailer.js';
import { auditEvent } from '../services/auditService.js';
import { serverError } from '../middleware/errorHandler.js';
import logger from '../logger.js';
import {
  clearLoginOtpAndRecordAccess,
  findActiveUserForAuth,
  findUserForForgotPassword,
  findUserForLogin,
  findUserForLoginOtp,
  findUserForLoginOtpResend,
  findUserForPasswordReset,
  findUserForResetOtp,
  findValidResetToken,
  incrementOtpAttempts,
  recordFailedLogin,
  recordSuccessfulLogin,
  setOtpForUser,
  setResetOtp,
  setResetTokenAfterOtp,
  updatePasswordAfterReset,
} from '../repositories/principal/authRepository.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
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
  admin: 'Administrador',
  usuario: 'Usuario',
};

const DEFAULT_MODULES = ['inicio', 'radar', 'empleabilidad', 'certificaciones', 'impactos', 'curricular', 'mercadoLaboral'];
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
    id: user.id_usuario,
    nombre,
    nombreCompleto: user.nombre_usuario,
    correo: user.correo_usuario,
    rol: user.rol,
    rolLabel: ROL_LABELS[user.rol] || user.rol,
    modulosPermitidos: parseAllowedModules(user.modulos_permitidos, user.rol),
    iniciales: nombre
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase(),
  };
}

function signAuthToken(user) {
  const payload = {
    id: user.id_usuario,
    nombre: user.nombre_corto || user.nombre_usuario,
    correo: user.correo_usuario,
    rol: user.rol,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function createOtpForUser(user, purpose) {
  const otp = crypto.randomInt(100000, 999999).toString();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expires = new Date(Date.now() + OTP_EXPIRES_MS);

  await setOtpForUser({ idUsuario: user.id_usuario, otpHash, expires, purpose });
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
    if (!correo || !password) return res.status(400).json({ error: 'Correo y contrasena son requeridos.' });

    const normalizedCorreo = correo.trim().toLowerCase();
    const user = await findUserForLogin(normalizedCorreo);

    if (!user) {
      await auditEvent(req, {
        evento: 'login_fallido',
        accion: 'login',
        modulo: 'auth',
        correo: normalizedCorreo,
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
      await recordFailedLogin({
        idUsuario: user.id_usuario,
        attempts,
        shouldLock,
        lockMinutes: LOCK_MINUTES,
      });
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

    await recordSuccessfulLogin(user.id_usuario);
    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());
    await auditEvent(req, {
      evento: 'login_exitoso',
      accion: 'login',
      modulo: 'auth',
      idUsuario: user.id_usuario,
      correo: user.correo_usuario,
      rol: user.rol,
      detalle: 'Credenciales validas. MFA temporalmente suspendido por bloqueo de correos OTP.',
    });

    res.json({
      token,
      user: buildAuthUser(user),
      mfaDisabled: true,
      message: 'MFA temporalmente suspendido. Inicio de sesion autorizado con credenciales validas.',
    });
  } catch (err) {
    serverError(res, err, 'POST /auth/login');
  }
});

router.post('/auth/login/verify-otp', async (req, res) => {
  try {
    const { correo, otp } = req.body;
    if (!correo || !otp) return res.status(400).json({ error: 'Correo y codigo son requeridos.' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'El codigo debe ser de 6 digitos numericos.' });

    const user = await findUserForLoginOtp(correo.trim().toLowerCase());
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
      return res.status(400).json({ error: 'El codigo ha expirado. Solicita uno nuevo.', expired: true });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (otpHash !== user.otp_hash) {
      await incrementOtpAttempts(user.id_usuario);
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

    await clearLoginOtpAndRecordAccess(user.id_usuario);
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

    res.json({ token, user: buildAuthUser(user) });
  } catch (err) {
    serverError(res, err, 'POST /auth/login/verify-otp');
  }
});

router.post('/auth/login/resend-otp', async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'El correo es requerido.' });

    const user = await findUserForLoginOtpResend(correo.trim().toLowerCase());
    if (!user || user.otp_purpose !== 'login') {
      return res.status(400).json({ error: 'Inicia sesion nuevamente para solicitar otro codigo.' });
    }

    await createOtpForUser(user, 'login');
    res.json({ message: 'Hemos enviado un nuevo codigo de verificacion a tu correo institucional.' });
  } catch (err) {
    serverError(res, err, 'POST /auth/login/resend-otp');
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
      return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    const user = await findActiveUserForAuth(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado o desactivado.' });

    const nombre = user.nombre_corto || user.nombre_usuario;
    if (user.rol !== payload.rol) {
      const newToken = jwt.sign(
        { id: user.id_usuario, nombre, correo: user.correo_usuario, rol: user.rol },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );
      res.cookie(AUTH_COOKIE, newToken, authCookieOptions());
    }

    res.json({ user: buildAuthUser(user) });
  } catch (err) {
    serverError(res, err, 'GET /auth/me');
  }
});

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'El correo es requerido.' });

    const normalizedCorreo = correo.trim().toLowerCase();
    const user = await findUserForForgotPassword(normalizedCorreo);
    if (!user || !user.activo) {
      return res.json({ message: 'Hemos enviado un codigo de verificacion a tu correo institucional.' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expires = new Date(Date.now() + OTP_EXPIRES_MS);
    await setResetOtp({ idUsuario: user.id_usuario, otpHash, expires });

    const nombre = user.nombre_corto || user.nombre_usuario;
    await sendOtpEmail({ to: normalizedCorreo, nombre, otp });
    res.json({ message: 'Hemos enviado un codigo de verificacion a tu correo institucional.' });
  } catch (err) {
    serverError(res, err, 'POST /auth/forgot-password');
  }
});

router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { correo, otp } = req.body;
    if (!correo || !otp) return res.status(400).json({ error: 'Correo y codigo son requeridos.' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'El codigo debe ser de 6 digitos numericos.' });

    const user = await findUserForResetOtp(correo.trim().toLowerCase());
    if (!user || !user.otp_hash || user.otp_purpose !== 'reset') {
      return res.status(400).json({ error: 'Solicita un nuevo codigo de verificacion.' });
    }

    if (user.otp_attempts >= 5) {
      logger.warn(`Cuenta bloqueada temporalmente: ${correo}`, { context: 'VERIFY OTP' });
      return res.status(429).json({
        error: 'Demasiados intentos fallidos. Solicita un nuevo codigo de verificacion.',
        blocked: true,
      });
    }

    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ error: 'El codigo ha expirado. Solicita uno nuevo.', expired: true });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (otpHash !== user.otp_hash) {
      await incrementOtpAttempts(user.id_usuario);
      const remaining = 4 - user.otp_attempts;
      logger.warn(`Intento fallido para: ${correo} (intentos: ${user.otp_attempts + 1})`, { context: 'VERIFY OTP' });
      return res.status(400).json({
        error: remaining > 0
          ? `Codigo incorrecto. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}.`
          : 'Codigo incorrecto. Has agotado los intentos. Solicita un nuevo codigo.',
        remaining,
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await setResetTokenAfterOtp({ idUsuario: user.id_usuario, resetToken, resetExpires });

    logger.info(`OTP verificado para: ${correo}`, { context: 'VERIFY OTP' });
    res.json({ valid: true, token: resetToken });
  } catch (err) {
    serverError(res, err, 'POST /auth/verify-otp');
  }
});

router.get('/auth/verify-reset-token/:token', async (req, res) => {
  try {
    const user = await findValidResetToken(req.params.token);
    if (!user) {
      return res.status(400).json({
        valid: false,
        error: 'El enlace es invalido o ha expirado. Solicita uno nuevo.',
      });
    }

    res.json({
      valid: true,
      correo: user.correo_usuario,
      nombre: user.nombre_corto || user.nombre_usuario,
    });
  } catch (err) {
    serverError(res, err, 'GET /auth/verify-reset-token');
  }
});

router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token y nueva contrasena son requeridos.' });

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) return res.status(400).json({ error: policyError });

    const user = await findUserForPasswordReset(token);
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
    await updatePasswordAfterReset({ idUsuario: user.id_usuario, passwordHash: hash });

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
    serverError(res, err, 'POST /auth/reset-password');
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
  res.json({ message: 'Sesion cerrada correctamente.' });
});

export default router;
