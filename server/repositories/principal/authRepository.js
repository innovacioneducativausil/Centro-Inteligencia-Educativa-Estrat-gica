import db from '../../db.js';

export async function setOtpForUser({ idUsuario, otpHash, expires, purpose }) {
  await db.query(
    `UPDATE usuario
     SET otp_hash = ?, otp_expires = ?, otp_attempts = 0, otp_purpose = ?
     WHERE id_usuario = ?`,
    [otpHash, expires, purpose, idUsuario]
  );
}

export async function findUserForLogin(correo) {
  const [[user]] = await db.query(
    `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario,
            password_hash, rol, activo, email_verificado, failed_login_attempts, locked_until, modulos_permitidos
     FROM usuario
     WHERE correo_usuario = ?
     LIMIT 1`,
    [correo]
  );
  return user || null;
}

export async function recordFailedLogin({ idUsuario, attempts, shouldLock, lockMinutes }) {
  await db.query(
    `UPDATE usuario
     SET failed_login_attempts = ?,
         locked_until = ${shouldLock ? 'DATE_ADD(NOW(), INTERVAL ? MINUTE)' : 'NULL'},
         fecha_actualizacion = NOW()
     WHERE id_usuario = ?`,
    shouldLock ? [attempts, lockMinutes, idUsuario] : [attempts, idUsuario]
  );
}

export async function recordSuccessfulLogin(idUsuario) {
  await db.query(
    `UPDATE usuario
     SET failed_login_attempts = 0,
         locked_until = NULL,
         otp_hash = NULL,
         otp_expires = NULL,
         otp_attempts = 0,
         otp_purpose = NULL,
         ultimo_acceso = NOW(),
         fecha_actualizacion = NOW()
     WHERE id_usuario = ?`,
    [idUsuario]
  );
}

export async function findUserForLoginOtp(correo) {
  const [[user]] = await db.query(
    `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
            otp_hash, otp_expires, otp_attempts, otp_purpose, modulos_permitidos
     FROM usuario
     WHERE correo_usuario = ? AND activo = 1
     LIMIT 1`,
    [correo]
  );
  return user || null;
}

export async function incrementOtpAttempts(idUsuario) {
  await db.query('UPDATE usuario SET otp_attempts = otp_attempts + 1 WHERE id_usuario = ?', [idUsuario]);
}

export async function clearLoginOtpAndRecordAccess(idUsuario) {
  await db.query(
    `UPDATE usuario
     SET otp_hash = NULL, otp_expires = NULL, otp_attempts = 0,
         otp_purpose = NULL, ultimo_acceso = NOW(), failed_login_attempts = 0, locked_until = NULL
     WHERE id_usuario = ?`,
    [idUsuario]
  );
}

export async function findUserForLoginOtpResend(correo) {
  const [[user]] = await db.query(
    `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, activo, otp_purpose
     FROM usuario
     WHERE correo_usuario = ? AND activo = 1
     LIMIT 1`,
    [correo]
  );
  return user || null;
}

export async function findActiveUserForAuth(idUsuario) {
  const [[user]] = await db.query(
    `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
            modulos_permitidos
     FROM usuario WHERE id_usuario = ? AND activo = 1`,
    [idUsuario]
  );
  return user || null;
}

export async function findUserForForgotPassword(correo) {
  const [[user]] = await db.query(
    `SELECT id_usuario, nombre_usuario, nombre_corto, activo
     FROM usuario
     WHERE correo_usuario = ?
     LIMIT 1`,
    [correo]
  );
  return user || null;
}

export async function setResetOtp({ idUsuario, otpHash, expires }) {
  await db.query(
    `UPDATE usuario
     SET otp_hash = ?, otp_expires = ?, otp_attempts = 0, otp_purpose = 'reset',
         reset_token = NULL, reset_token_expires = NULL
     WHERE id_usuario = ?`,
    [otpHash, expires, idUsuario]
  );
}

export async function findUserForResetOtp(correo) {
  const [[user]] = await db.query(
    `SELECT id_usuario, otp_hash, otp_expires, otp_attempts, otp_purpose
     FROM usuario
     WHERE correo_usuario = ? AND activo = 1
     LIMIT 1`,
    [correo]
  );
  return user || null;
}

export async function setResetTokenAfterOtp({ idUsuario, resetToken, resetExpires }) {
  await db.query(
    `UPDATE usuario
     SET otp_hash = NULL, otp_expires = NULL, otp_attempts = 0, otp_purpose = NULL,
         reset_token = ?, reset_token_expires = ?
     WHERE id_usuario = ?`,
    [resetToken, resetExpires, idUsuario]
  );
}

export async function findValidResetToken(token) {
  const [[user]] = await db.query(
    `SELECT id_usuario, nombre_corto, nombre_usuario, correo_usuario
     FROM usuario
     WHERE reset_token = ?
       AND reset_token_expires > NOW()
       AND activo = 1
     LIMIT 1`,
    [token]
  );
  return user || null;
}

export async function findUserForPasswordReset(token) {
  const [[user]] = await db.query(
    `SELECT id_usuario, correo_usuario, password_hash
     FROM usuario
     WHERE reset_token = ?
       AND reset_token_expires > NOW()
       AND activo = 1
     LIMIT 1`,
    [token]
  );
  return user || null;
}

export async function updatePasswordAfterReset({ idUsuario, passwordHash }) {
  await db.query(
    `UPDATE usuario
     SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL,
         password_changed_at = NOW(), failed_login_attempts = 0, locked_until = NULL,
         fecha_actualizacion = NOW()
     WHERE id_usuario = ?`,
    [passwordHash, idUsuario]
  );
}
