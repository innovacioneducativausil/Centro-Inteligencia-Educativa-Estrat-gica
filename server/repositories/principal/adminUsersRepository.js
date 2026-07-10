import db from '../../db.js';

const USER_COLUMNS = `id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo,
  email_verificado, ultimo_acceso, fecha_creacion, fecha_actualizacion,
  password_changed_at, failed_login_attempts, locked_until, modulos_permitidos`;

export async function getAdminUsers({ q = '', rol = '', estado = '' } = {}) {
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
    `SELECT ${USER_COLUMNS}
     FROM usuario
     ${where}
     ORDER BY rol = 'admin' DESC, activo DESC, correo_usuario ASC
     LIMIT 200`,
    params
  );

  return rows;
}

export async function getUserByEmail(correo) {
  const [[row]] = await db.query('SELECT id_usuario FROM usuario WHERE correo_usuario = ? LIMIT 1', [correo]);
  return row || null;
}

export async function getUserForResponse(id) {
  const [[row]] = await db.query(
    `SELECT ${USER_COLUMNS}
     FROM usuario WHERE id_usuario = ?`,
    [id]
  );
  return row || null;
}

export async function createUser({ id, nombre, nombreCorto, correo, passwordHash, rol, modulos }) {
  await db.query(
    `INSERT INTO usuario
       (id_usuario, nombre_usuario, nombre_corto, correo_usuario, password_hash, rol,
        activo, email_verificado, password_changed_at, fecha_creacion, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW(), NOW())`,
    [id, nombre, nombreCorto, correo, passwordHash, rol]
  );
  await db.query('UPDATE usuario SET modulos_permitidos = ? WHERE id_usuario = ?', [JSON.stringify(modulos), id]);

  return getUserForResponse(id);
}

export async function getEditableUserById(id) {
  const [[row]] = await db.query(
    `SELECT id_usuario, nombre_usuario, nombre_corto, correo_usuario, rol, activo, modulos_permitidos
     FROM usuario WHERE id_usuario = ? LIMIT 1`,
    [id]
  );
  return row || null;
}

export async function updateUser({ id, nombre, nombreCorto, rol, activo, modulos }) {
  await db.query(
    `UPDATE usuario
     SET nombre_usuario = ?, nombre_corto = ?, rol = ?, activo = ?, modulos_permitidos = ?, fecha_actualizacion = NOW()
     WHERE id_usuario = ?`,
    [nombre, nombreCorto, rol, activo ? 1 : 0, JSON.stringify(modulos), id]
  );

  return getUserForResponse(id);
}

export async function getUserForPasswordReset(id) {
  const [[row]] = await db.query(
    'SELECT id_usuario, correo_usuario, rol FROM usuario WHERE id_usuario = ? LIMIT 1',
    [id]
  );
  return row || null;
}

export async function resetUserPassword({ id, passwordHash }) {
  await db.query(
    `UPDATE usuario
     SET password_hash = ?, password_changed_at = NOW(), failed_login_attempts = 0,
         locked_until = NULL, reset_token = NULL, reset_token_expires = NULL,
         otp_hash = NULL, otp_expires = NULL, otp_attempts = 0, otp_purpose = NULL,
         fecha_actualizacion = NOW()
     WHERE id_usuario = ?`,
    [passwordHash, id]
  );
}

export async function getUserForDeletion(id) {
  const [[row]] = await db.query(
    'SELECT id_usuario, correo_usuario, rol, activo FROM usuario WHERE id_usuario = ? LIMIT 1',
    [id]
  );
  return row || null;
}

export async function countActiveAdmins() {
  const [[{ total }]] = await db.query(
    "SELECT COUNT(*) AS total FROM usuario WHERE rol = 'admin' AND activo = 1"
  );
  return Number(total || 0);
}

export async function anonymizeUserData({ id, correoPseudo, passwordHash }) {
  await db.query(
    `UPDATE usuario
     SET nombre_usuario = 'Usuario eliminado', nombre_corto = 'Eliminado',
         correo_usuario = ?, password_hash = ?, activo = 0, modulos_permitidos = '[]',
         otp_hash = NULL, otp_expires = NULL, otp_attempts = 0, otp_purpose = NULL,
         reset_token = NULL, reset_token_expires = NULL, locked_until = NULL,
         eliminado_en = NOW(), fecha_actualizacion = NOW()
     WHERE id_usuario = ?`,
    [correoPseudo, passwordHash, id]
  );

  await db.query(
    'UPDATE actividad_usuario SET correo = ? WHERE id_usuario = ?',
    [correoPseudo, id]
  );
}
