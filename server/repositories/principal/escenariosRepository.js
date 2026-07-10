import { radarPrisma } from '../../prismaClient.js';

function firstActivePestel(row) {
  return row.escenario_pestel
    ?.map(item => item.pestel)
    .filter(item => item?.activo)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0] || null;
}

function firstActiveSector(row) {
  return row.escenario_sector
    ?.map(item => item.sector)
    .filter(item => item?.activo)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0] || null;
}

function mapEscenarioRow(row) {
  const pestel = firstActivePestel(row);
  const sector = firstActiveSector(row);
  return {
    ...row,
    categoria: pestel?.nombre_pestel || null,
    pestel_slug: pestel?.slug_pestel || null,
    color_pestel: pestel?.color || null,
    emoji_pestel: pestel?.emoji || null,
    sector_nombre: sector?.nombre_sector || null,
    sector_slug: sector?.slug_sector || null,
    color_sector: sector?.color || null,
    emoji_sector: sector?.emoji || null,
    total_senales: row.escenario_senal?.length || row.senal_escenario?.length || 0,
    total_tendencias: row.escenario_tendencia?.length || row.tendencia_escenario?.length || 0,
    topico_nombre: row.topico?.nombre || null,
  };
}

export async function getEscenariosFiltrados({ pestel, sector, q } = {}) {
  const where = { id_estado: 1 };

  if (pestel) {
    where.escenario_pestel = {
      some: { pestel: { slug_pestel: pestel, activo: true } },
    };
  }
  if (sector) {
    where.escenario_sector = {
      some: { sector: { slug_sector: sector, activo: true } },
    };
  }
  if (q) {
    where.OR = [
      { titulo_escenario: { contains: q } },
      { desc_corta_escenario: { contains: q } },
    ];
  }

  const rows = await radarPrisma.escenario.findMany({
    where,
    include: {
      topico: true,
      escenario_pestel: { include: { pestel: true } },
      escenario_sector: { include: { sector: true } },
      escenario_senal: { select: { id_senal: true } },
      escenario_tendencia: { select: { id_tendencia: true } },
      senal_escenario: { select: { id_senal: true } },
      tendencia_escenario: { select: { id_tendencia: true } },
    },
    orderBy: [
      { fecha_publicacion: 'desc' },
      { fecha_creacion: 'desc' },
    ],
  });

  return rows.map(mapEscenarioRow);
}
