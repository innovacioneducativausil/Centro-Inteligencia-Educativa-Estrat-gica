import { radarPrisma } from '../../prismaClient.js';

function dateAtStart(value) {
  return new Date(`${value}T00:00:00`);
}

function dateAtEnd(value) {
  return new Date(`${value}T23:59:59`);
}

function buildActividadWhere(query) {
  const where = {};
  if (query.correo) where.correo = query.correo;
  if (query.evento) where.evento = query.evento;
  if (query.accion) where.accion = query.accion;
  if (query.modulo) where.modulo = query.modulo;
  if (query.ip) where.ip = { contains: query.ip };
  if (query.desde || query.hasta) {
    where.fecha_hora = {};
    if (query.desde) where.fecha_hora.gte = dateAtStart(query.desde);
    if (query.hasta) where.fecha_hora.lte = dateAtEnd(query.hasta);
  }
  if (query.q) {
    const q = String(query.q);
    where.OR = [
      { correo: { contains: q } },
      { evento: { contains: q } },
      { accion: { contains: q } },
      { modulo: { contains: q } },
      { detalle: { contains: q } },
      { elemento_titulo: { contains: q } },
      { ip: { contains: q } },
      { user_agent: { contains: q } },
    ];
  }
  return where;
}

export async function getActividadPage(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const skip = (page - 1) * limit;
  const where = buildActividadWhere(query);

  const [total, rows] = await Promise.all([
    radarPrisma.actividad_usuario.count({ where }),
    radarPrisma.actividad_usuario.findMany({
      where,
      orderBy: { fecha_hora: 'desc' },
      take: limit,
      skip,
    }),
  ]);

  return { rows, total, page, pages: Math.ceil(total / limit) };
}

export async function getActividadExportRows(query) {
  return radarPrisma.actividad_usuario.findMany({
    where: buildActividadWhere(query),
    orderBy: { fecha_hora: 'desc' },
    take: 5000,
  });
}

export async function getActividadUsuariosActivos() {
  const rows = await radarPrisma.usuario.findMany({
    where: { activo: true },
    orderBy: { correo_usuario: 'asc' },
    select: {
      correo_usuario: true,
      nombre_usuario: true,
      rol: true,
    },
  });

  return rows.map(row => ({
    correo: row.correo_usuario,
    nombre: row.nombre_usuario,
    rol: row.rol,
  }));
}

export async function getActividadEventos() {
  const rows = await radarPrisma.actividad_usuario.findMany({
    distinct: ['evento'],
    orderBy: { evento: 'asc' },
    select: { evento: true },
  });
  return rows.map(row => row.evento);
}

export async function getActividadAcciones() {
  const rows = await radarPrisma.actividad_usuario.findMany({
    where: { accion: { not: null } },
    distinct: ['accion'],
    orderBy: { accion: 'asc' },
    select: { accion: true },
  });
  return rows.map(row => row.accion);
}

export async function getActividadModulos() {
  const rows = await radarPrisma.actividad_usuario.findMany({
    where: { modulo: { not: null } },
    distinct: ['modulo'],
    orderBy: { modulo: 'asc' },
    select: { modulo: true },
  });
  return rows.map(row => row.modulo);
}
