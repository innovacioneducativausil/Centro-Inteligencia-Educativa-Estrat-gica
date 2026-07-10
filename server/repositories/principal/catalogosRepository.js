import { radarPrisma } from '../../prismaClient.js';

export async function getPestelActivos() {
  return radarPrisma.pestel.findMany({
    where: { activo: true },
    orderBy: { orden_display: 'asc' },
    select: {
      id_pestel: true,
      nombre_pestel: true,
      slug_pestel: true,
      letra_codigo: true,
      desc_pestel: true,
      emoji: true,
      color: true,
      orden_display: true,
    },
  });
}

export async function getSectoresActivos() {
  return radarPrisma.sector.findMany({
    where: { activo: true },
    orderBy: { orden_display: 'asc' },
    select: {
      id_sector: true,
      nombre_sector: true,
      slug_sector: true,
      desc_sector: true,
      emoji: true,
      color: true,
      orden_display: true,
    },
  });
}
