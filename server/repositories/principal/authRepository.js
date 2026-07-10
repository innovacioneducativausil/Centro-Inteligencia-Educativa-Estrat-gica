import { radarPrisma } from '../../prismaClient.js';

export async function setOtpForUser({ idUsuario, otpHash, expires, purpose }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      otp_hash: otpHash,
      otp_expires: expires,
      otp_attempts: 0,
      otp_purpose: purpose,
    },
  });
}

export async function findUserForLogin(correo) {
  return radarPrisma.usuario.findUnique({
    where: { correo_usuario: correo },
    select: {
      id_usuario: true,
      nombre_usuario: true,
      nombre_corto: true,
      correo_usuario: true,
      password_hash: true,
      rol: true,
      activo: true,
      email_verificado: true,
      failed_login_attempts: true,
      locked_until: true,
      modulos_permitidos: true,
    },
  });
}

export async function recordFailedLogin({ idUsuario, attempts, shouldLock, lockMinutes }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      failed_login_attempts: attempts,
      locked_until: shouldLock ? new Date(Date.now() + lockMinutes * 60 * 1000) : null,
      fecha_actualizacion: new Date(),
    },
  });
}

export async function recordSuccessfulLogin(idUsuario) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      failed_login_attempts: 0,
      locked_until: null,
      otp_hash: null,
      otp_expires: null,
      otp_attempts: 0,
      otp_purpose: null,
      ultimo_acceso: new Date(),
      fecha_actualizacion: new Date(),
    },
  });
}

export async function findUserForLoginOtp(correo) {
  return radarPrisma.usuario.findFirst({
    where: { correo_usuario: correo, activo: true },
    select: {
      id_usuario: true,
      nombre_usuario: true,
      nombre_corto: true,
      correo_usuario: true,
      rol: true,
      activo: true,
      otp_hash: true,
      otp_expires: true,
      otp_attempts: true,
      otp_purpose: true,
      modulos_permitidos: true,
    },
  });
}

export async function incrementOtpAttempts(idUsuario) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: { otp_attempts: { increment: 1 } },
  });
}

export async function clearLoginOtpAndRecordAccess(idUsuario) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      otp_hash: null,
      otp_expires: null,
      otp_attempts: 0,
      otp_purpose: null,
      ultimo_acceso: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
    },
  });
}

export async function findUserForLoginOtpResend(correo) {
  return radarPrisma.usuario.findFirst({
    where: { correo_usuario: correo, activo: true },
    select: {
      id_usuario: true,
      nombre_usuario: true,
      nombre_corto: true,
      correo_usuario: true,
      activo: true,
      otp_purpose: true,
    },
  });
}

export async function findActiveUserForAuth(idUsuario) {
  return radarPrisma.usuario.findFirst({
    where: { id_usuario: idUsuario, activo: true },
    select: {
      id_usuario: true,
      nombre_usuario: true,
      nombre_corto: true,
      correo_usuario: true,
      rol: true,
      activo: true,
      modulos_permitidos: true,
    },
  });
}

export async function findUserForForgotPassword(correo) {
  return radarPrisma.usuario.findUnique({
    where: { correo_usuario: correo },
    select: {
      id_usuario: true,
      nombre_usuario: true,
      nombre_corto: true,
      activo: true,
    },
  });
}

export async function setResetOtp({ idUsuario, otpHash, expires }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      otp_hash: otpHash,
      otp_expires: expires,
      otp_attempts: 0,
      otp_purpose: 'reset',
      reset_token: null,
      reset_token_expires: null,
    },
  });
}

export async function findUserForResetOtp(correo) {
  return radarPrisma.usuario.findFirst({
    where: { correo_usuario: correo, activo: true },
    select: {
      id_usuario: true,
      otp_hash: true,
      otp_expires: true,
      otp_attempts: true,
      otp_purpose: true,
    },
  });
}

export async function setResetTokenAfterOtp({ idUsuario, resetToken, resetExpires }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      otp_hash: null,
      otp_expires: null,
      otp_attempts: 0,
      otp_purpose: null,
      reset_token: resetToken,
      reset_token_expires: resetExpires,
    },
  });
}

export async function findValidResetToken(token) {
  return radarPrisma.usuario.findFirst({
    where: {
      reset_token: token,
      reset_token_expires: { gt: new Date() },
      activo: true,
    },
    select: {
      id_usuario: true,
      nombre_corto: true,
      nombre_usuario: true,
      correo_usuario: true,
    },
  });
}

export async function findUserForPasswordReset(token) {
  return radarPrisma.usuario.findFirst({
    where: {
      reset_token: token,
      reset_token_expires: { gt: new Date() },
      activo: true,
    },
    select: {
      id_usuario: true,
      correo_usuario: true,
      password_hash: true,
    },
  });
}

export async function updatePasswordAfterReset({ idUsuario, passwordHash }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: idUsuario },
    data: {
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expires: null,
      password_changed_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
      fecha_actualizacion: new Date(),
    },
  });
}
