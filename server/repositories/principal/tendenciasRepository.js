import { radarPrisma } from '../../prismaClient.js';

function firstActivePestel(row) {
  return row.tendencia_pestel
    ?.map(item => item.pestel)
    .filter(item => item?.activo)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0] || null;
}

function firstActiveSector(row) {
  return row.tendencia_sector
    ?.map(item => item.sector)
    .filter(item => item?.activo)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0] || null;
}

function mapTendenciaRow(row) {
  const pestel = firstActivePestel(row);
  const sector = firstActiveSector(row);
  return {
    ...row,
    pestel_id: pestel?.id_pestel || null,
    categoria: pestel?.nombre_pestel || null,
    pestel_slug: pestel?.slug_pestel || null,
    color_pestel: pestel?.color || null,
    emoji_pestel: pestel?.emoji || null,
    pestel_letra: pestel?.letra_codigo || null,
    sector_id: sector?.id_sector || null,
    sector_nombre: sector?.nombre_sector || null,
    sector_slug: sector?.slug_sector || null,
    color_sector: sector?.color || null,
    emoji_sector: sector?.emoji || null,
    total_senales: row.senal?.length || 0,
    topico_nombre: row.topico?.nombre || null,
    topicos_relacionados: row.topico_relac_tendencia
      ?.map(item => item.topico?.nombre)
      .filter(Boolean)
      .sort()
      .join('|') || null,
  };
}

export async function getTendenciasFiltradas({ pestel, sector, q } = {}) {
  const where = { id_estado: 1 };

  if (pestel) {
    where.tendencia_pestel = {
      some: { pestel: { slug_pestel: pestel, activo: true } },
    };
  }
  if (sector) {
    where.tendencia_sector = {
      some: { sector: { slug_sector: sector, activo: true } },
    };
  }
  if (q) {
    where.OR = [
      { titulo_tendencia: { contains: q } },
      { desc_corta_tendencia: { contains: q } },
    ];
  }

  const rows = await radarPrisma.tendencia.findMany({
    where,
    include: {
      topico: true,
      tendencia_pestel: { include: { pestel: true } },
      tendencia_sector: { include: { sector: true } },
      topico_relac_tendencia: { include: { topico: true } },
      senal: { where: { id_estado: 1 }, select: { id_senal: true } },
    },
    orderBy: [
      { fecha_publicacion: 'desc' },
      { fecha_creacion: 'desc' },
    ],
  });

  return rows.map(mapTendenciaRow);
}
