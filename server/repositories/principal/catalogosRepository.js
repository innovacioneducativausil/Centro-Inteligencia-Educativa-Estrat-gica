import db from '../../db.js';

export async function getPestelActivos() {
  const [rows] = await db.query(
    `SELECT id_pestel, nombre_pestel, slug_pestel, letra_codigo,
            desc_pestel, emoji, color, orden_display
     FROM pestel
     WHERE activo = 1
     ORDER BY orden_display ASC`
  );

  return rows;
}

export async function getSectoresActivos() {
  const [rows] = await db.query(
    `SELECT id_sector, nombre_sector, slug_sector,
            desc_sector, emoji, color, orden_display
     FROM sector
     WHERE activo = 1
     ORDER BY orden_display ASC`
  );

  return rows;
}
