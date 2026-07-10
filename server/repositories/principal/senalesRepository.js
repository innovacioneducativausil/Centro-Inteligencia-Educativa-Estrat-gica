import { radarPrisma } from '../../prismaClient.js';

function firstActivePestel(row) {
  return row.senal_pestel
    ?.map(item => item.pestel)
    .filter(item => item?.activo)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0] || null;
}

function firstActiveSector(row) {
  return row.senal_sector
    ?.map(item => item.sector)
    .filter(item => item?.activo)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0))[0] || null;
}

function mapSenalListRow(row) {
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
    topico_nombre: row.topico?.nombre || null,
  };
}

export async function getSenalesFiltradas({ pestel, sector, q } = {}) {
  const where = {
    id_estado: 1,
  };

  if (pestel) {
    where.senal_pestel = {
      some: { pestel: { slug_pestel: pestel, activo: true } },
    };
  }
  if (sector) {
    where.senal_sector = {
      some: { sector: { slug_sector: sector, activo: true } },
    };
  }
  if (q) {
    where.OR = [
      { titulo_senal: { contains: q } },
      { desc_corta_senal: { contains: q } },
    ];
  }

  const rows = await radarPrisma.senal.findMany({
    where,
    include: {
      topico: true,
      senal_pestel: { include: { pestel: true } },
      senal_sector: { include: { sector: true } },
    },
    orderBy: [
      { fecha_publicacion: 'desc' },
      { fecha_creacion: 'desc' },
    ],
  });

  return rows.map(mapSenalListRow);
}

export async function getSenalActivaByUuid(uuid) {
  const row = await radarPrisma.senal.findFirst({
    where: { id_senal: uuid, id_estado: 1 },
    include: {
      senal_pestel: { include: { pestel: true } },
      senal_sector: { include: { sector: true } },
    },
  });

  if (!row) return null;

  const pesteles = row.senal_pestel
    .map(item => item.pestel)
    .filter(Boolean)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0));
  const sectores = row.senal_sector
    .map(item => item.sector)
    .filter(Boolean)
    .sort((a, b) => (a.orden_display || 0) - (b.orden_display || 0));

  return {
    ...row,
    pesteles: pesteles.map(item => item.nombre_pestel).join('||'),
    pestel_slugs: pesteles.map(item => item.slug_pestel).join('||'),
    pestel_colors: pesteles.map(item => item.color).join('||'),
    pestel_emojis: pesteles.map(item => item.emoji).join('||'),
    sectores: sectores.map(item => item.nombre_sector).join('||'),
    sector_slugs: sectores.map(item => item.slug_sector).join('||'),
  };
}
