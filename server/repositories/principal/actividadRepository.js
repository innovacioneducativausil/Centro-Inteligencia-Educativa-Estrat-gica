import db from '../../db.js';

function buildActividadFilters(query) {
  const conds = [];
  const params = [];

  if (query.correo) { conds.push('correo = ?'); params.push(query.correo); }
  if (query.evento) { conds.push('evento = ?'); params.push(query.evento); }
  if (query.accion) { conds.push('accion = ?'); params.push(query.accion); }
  if (query.modulo) { conds.push('modulo = ?'); params.push(query.modulo); }
  if (query.ip) { conds.push('ip LIKE ?'); params.push(`%${query.ip}%`); }
  if (query.desde) { conds.push('fecha_hora >= ?'); params.push(query.desde + ' 00:00:00'); }
  if (query.hasta) { conds.push('fecha_hora <= ?'); params.push(query.hasta + ' 23:59:59'); }
  if (query.q) {
    conds.push('(correo LIKE ? OR evento LIKE ? OR accion LIKE ? OR modulo LIKE ? OR detalle LIKE ? OR elemento_titulo LIKE ? OR ip LIKE ? OR user_agent LIKE ? OR CAST(metadata AS CHAR) LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }

  return {
    where: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  };
}

export async function getActividadPage(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const { where, params } = buildActividadFilters(query);

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM actividad_usuario ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT id, id_usuario, correo, rol, evento, accion, modulo, entidad, entidad_id,
            elemento_uuid, elemento_tipo, elemento_titulo, detalle, ip, user_agent, metadata, fecha_hora
     FROM actividad_usuario
     ${where}
     ORDER BY fecha_hora DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total, page, pages: Math.ceil(total / limit) };
}

export async function getActividadExportRows(query) {
  const { where, params } = buildActividadFilters(query);
  const [rows] = await db.query(
    `SELECT id, id_usuario, correo, rol, evento, accion, modulo, entidad, entidad_id,
            elemento_uuid, elemento_tipo, elemento_titulo, detalle, ip, user_agent, metadata, fecha_hora
     FROM actividad_usuario
     ${where}
     ORDER BY fecha_hora DESC
     LIMIT 5000`,
    params
  );

  return rows;
}

export async function getActividadUsuariosActivos() {
  const [rows] = await db.query(
    `SELECT correo_usuario AS correo, nombre_usuario AS nombre, rol
     FROM usuario
     WHERE activo = 1
     ORDER BY correo_usuario ASC`
  );

  return rows;
}

export async function getActividadEventos() {
  const [rows] = await db.query('SELECT DISTINCT evento FROM actividad_usuario ORDER BY evento ASC');
  return rows.map(r => r.evento);
}

export async function getActividadAcciones() {
  const [rows] = await db.query(
    'SELECT DISTINCT accion FROM actividad_usuario WHERE accion IS NOT NULL ORDER BY accion ASC'
  );
  return rows.map(r => r.accion);
}

export async function getActividadModulos() {
  const [rows] = await db.query(
    'SELECT DISTINCT modulo FROM actividad_usuario WHERE modulo IS NOT NULL ORDER BY modulo ASC'
  );
  return rows.map(r => r.modulo);
}
