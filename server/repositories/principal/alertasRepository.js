import { radarPrisma } from '../../prismaClient.js';

function serializeAlert(row) {
  if (!row) return null;
  return {
    ...row,
    id_alerta: typeof row.id_alerta === 'bigint' ? Number(row.id_alerta) : row.id_alerta,
    regla_nombre: row.regla_nombre,
  };
}

export async function getReglasAlerta() {
  return radarPrisma.regla_alerta.findMany({
    orderBy: { fecha_creacion: 'desc' },
  });
}

export async function createReglaAlerta({ id, nombre, metrica, operador, valorUmbral, creadoPor }) {
  return radarPrisma.regla_alerta.create({
    data: {
      id_regla: id,
      nombre,
      metrica,
      operador,
      valor_umbral: valorUmbral,
      activa: true,
      creado_por: creadoPor,
    },
  });
}

export async function getReglaAlertaById(id) {
  return radarPrisma.regla_alerta.findUnique({
    where: { id_regla: id },
  });
}

export async function updateReglaAlerta(id, { nombre, operador, valorUmbral, activa }) {
  return radarPrisma.regla_alerta.update({
    where: { id_regla: id },
    data: {
      nombre,
      operador,
      valor_umbral: valorUmbral,
      activa: Boolean(activa),
    },
  });
}

export async function deleteReglaAlerta(id) {
  await radarPrisma.regla_alerta.delete({
    where: { id_regla: id },
  });
}

export async function getAlertasGeneradas({ soloPendientes = false } = {}) {
  const rows = await radarPrisma.alerta_generada.findMany({
    where: soloPendientes ? { atendida: false } : undefined,
    orderBy: { fecha_generada: 'desc' },
    take: 200,
  });

  const reglas = await radarPrisma.regla_alerta.findMany({
    where: { id_regla: { in: [...new Set(rows.map(row => row.id_regla))] } },
    select: { id_regla: true, nombre: true },
  });
  const reglaById = new Map(reglas.map(regla => [regla.id_regla, regla.nombre]));

  return rows.map(row => serializeAlert({
    ...row,
    regla_nombre: reglaById.get(row.id_regla) || null,
  }));
}

export async function getAlertaGeneradaById(id) {
  const row = await radarPrisma.alerta_generada.findUnique({
    where: { id_alerta: BigInt(id) },
  });
  return serializeAlert(row);
}

export async function markAlertaAtendida({ id, atendidaPor }) {
  await radarPrisma.alerta_generada.update({
    where: { id_alerta: BigInt(id) },
    data: {
      atendida: true,
      atendida_por: atendidaPor,
      fecha_atendida: new Date(),
    },
  });
}
