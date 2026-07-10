import { radarPrisma } from '../../prismaClient.js';

export async function getDashboardStats() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    senalesTotal,
    tendenciasTotal,
    escenariosTotal,
    usuariosTotal,
    pestelesTotal,
    sectoresTotal,
    senalesMesTotal,
    pesteles,
    senalesRecientesRaw,
  ] = await Promise.all([
    radarPrisma.senal.count({ where: { id_estado: 1 } }),
    radarPrisma.tendencia.count({ where: { id_estado: 1 } }),
    radarPrisma.escenario.count({ where: { id_estado: 1 } }),
    radarPrisma.usuario.count({ where: { activo: true } }),
    radarPrisma.pestel.count({ where: { activo: true } }),
    radarPrisma.sector.count({ where: { activo: true } }),
    radarPrisma.senal.count({ where: { id_estado: 1, fecha_publicacion: { gte: startOfMonth } } }),
    radarPrisma.pestel.findMany({
      where: { activo: true },
      orderBy: { orden_display: 'asc' },
      include: {
        senal_pestel: true,
        tendencia_pestel: true,
      },
    }),
    radarPrisma.senal.findMany({
      where: { id_estado: 1 },
      orderBy: [
        { fecha_publicacion: 'desc' },
        { fecha_creacion: 'desc' },
      ],
      take: 5,
      include: {
        senal_pestel: { include: { pestel: true } },
      },
    }),
  ]);

  const distribucionPestel = pesteles.map(pestel => ({
    categoria: pestel.nombre_pestel,
    color: pestel.color,
    emoji: pestel.emoji,
    total_senales: pestel.senal_pestel.length,
    total_tendencias: pestel.tendencia_pestel.length,
  }));

  const senalesRecientes = senalesRecientesRaw.map(row => {
    const pestel = row.senal_pestel
      .map(item => item.pestel)
      .filter(Boolean)
      .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0];
    return {
      id_senal: row.id_senal,
      titulo_senal: row.titulo_senal,
      desc_corta_senal: row.desc_corta_senal,
      fecha_publicacion: row.fecha_publicacion,
      categoria: pestel?.nombre_pestel || null,
      color: pestel?.color || null,
      emoji: pestel?.emoji || null,
    };
  });

  return {
    senales: { total: senalesTotal },
    tendencias: { total: tendenciasTotal },
    escenarios: { total: escenariosTotal },
    usuarios: { total: usuariosTotal },
    pesteles: { total: pestelesTotal },
    sectores: { total: sectoresTotal },
    senalesMes: { total: senalesMesTotal },
    distribucionPestel,
    senalesRecientes,
  };
}
