import { radarPrisma } from '../../prismaClient.js';

const USER_SELECT = {
  id_usuario: true,
  nombre_usuario: true,
  nombre_corto: true,
  correo_usuario: true,
  rol: true,
  activo: true,
  email_verificado: true,
  ultimo_acceso: true,
  fecha_creacion: true,
  fecha_actualizacion: true,
  password_changed_at: true,
  failed_login_attempts: true,
  locked_until: true,
  modulos_permitidos: true,
};

export async function getAdminUsers({ q = '', rol = '', estado = '' } = {}) {
  const where = {};
  if (q) {
    where.OR = [
      { nombre_usuario: { contains: q } },
      { nombre_corto: { contains: q } },
      { correo_usuario: { contains: q } },
    ];
  }
  if (rol) where.rol = rol;
  if (estado === 'activo') where.activo = true;
  if (estado === 'inactivo') where.activo = false;

  const rows = await radarPrisma.usuario.findMany({
    where,
    select: USER_SELECT,
    take: 200,
  });

  return rows.sort((a, b) => {
    if (a.rol === 'admin' && b.rol !== 'admin') return -1;
    if (a.rol !== 'admin' && b.rol === 'admin') return 1;
    if (Boolean(a.activo) !== Boolean(b.activo)) return a.activo ? -1 : 1;
    return a.correo_usuario.localeCompare(b.correo_usuario);
  });
}

export async function getUserByEmail(correo) {
  return radarPrisma.usuario.findUnique({
    where: { correo_usuario: correo },
    select: { id_usuario: true },
  });
}

export async function getUserForResponse(id) {
  return radarPrisma.usuario.findUnique({
    where: { id_usuario: id },
    select: USER_SELECT,
  });
}

export async function createUser({ id, nombre, nombreCorto, correo, passwordHash, rol, modulos }) {
  await radarPrisma.usuario.create({
    data: {
      id_usuario: id,
      nombre_usuario: nombre,
      nombre_corto: nombreCorto,
      correo_usuario: correo,
      password_hash: passwordHash,
      rol,
      activo: true,
      email_verificado: true,
      password_changed_at: new Date(),
      fecha_creacion: new Date(),
      fecha_actualizacion: new Date(),
      modulos_permitidos: modulos,
    },
  });

  return getUserForResponse(id);
}

export async function getEditableUserById(id) {
  return radarPrisma.usuario.findUnique({
    where: { id_usuario: id },
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

export async function updateUser({ id, nombre, nombreCorto, rol, activo, modulos }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: id },
    data: {
      nombre_usuario: nombre,
      nombre_corto: nombreCorto,
      rol,
      activo: Boolean(activo),
      modulos_permitidos: modulos,
      fecha_actualizacion: new Date(),
    },
  });

  return getUserForResponse(id);
}

export async function getUserForPasswordReset(id) {
  return radarPrisma.usuario.findUnique({
    where: { id_usuario: id },
    select: {
      id_usuario: true,
      correo_usuario: true,
      rol: true,
    },
  });
}

export async function resetUserPassword({ id, passwordHash }) {
  await radarPrisma.usuario.update({
    where: { id_usuario: id },
    data: {
      password_hash: passwordHash,
      password_changed_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
      reset_token: null,
      reset_token_expires: null,
      otp_hash: null,
      otp_expires: null,
      otp_attempts: 0,
      otp_purpose: null,
      fecha_actualizacion: new Date(),
    },
  });
}

export async function getUserForDeletion(id) {
  return radarPrisma.usuario.findUnique({
    where: { id_usuario: id },
    select: {
      id_usuario: true,
      correo_usuario: true,
      rol: true,
      activo: true,
    },
  });
}

export async function countActiveAdmins() {
  return radarPrisma.usuario.count({
    where: { rol: 'admin', activo: true },
  });
}

export async function anonymizeUserData({ id, correoPseudo, passwordHash }) {
  await radarPrisma.$transaction([
    radarPrisma.usuario.update({
      where: { id_usuario: id },
      data: {
        nombre_usuario: 'Usuario eliminado',
        nombre_corto: 'Eliminado',
        correo_usuario: correoPseudo,
        password_hash: passwordHash,
        activo: false,
        modulos_permitidos: [],
        otp_hash: null,
        otp_expires: null,
        otp_attempts: 0,
        otp_purpose: null,
        reset_token: null,
        reset_token_expires: null,
        locked_until: null,
        eliminado_en: new Date(),
        fecha_actualizacion: new Date(),
      },
    }),
    radarPrisma.actividad_usuario.updateMany({
      where: { id_usuario: id },
      data: { correo: correoPseudo },
    }),
  ]);
}
