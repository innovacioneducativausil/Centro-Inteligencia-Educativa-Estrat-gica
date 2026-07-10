import db from '../../db.js';

export async function getEscenariosFiltrados({ pestel, sector, q } = {}) {
  const conditions = ['e.id_estado = 1'];
  const params = [];

  if (pestel) {
    conditions.push('p.slug_pestel = ?');
    params.push(pestel);
  }
  if (sector) {
    conditions.push('sec.slug_sector = ?');
    params.push(sector);
  }
  if (q) {
    conditions.push('(e.titulo_escenario LIKE ? OR e.desc_corta_escenario LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const [rows] = await db.query(
    `SELECT
       e.id_escenario,
       e.titulo_escenario,
       e.nombre_escenario,
       e.desc_corta_escenario,
       e.desc_larga_escenario,
       e.razon_cambio,
       e.url_imagen_escenario,
       e.fuente_escenario,
       e.url_fuente,
       e.horizonte_escenario,
       e.probabilidad,
       e.fecha_publicacion,
       e.autor,
       MIN(p.nombre_pestel)    AS categoria,
       MIN(p.slug_pestel)      AS pestel_slug,
       MIN(p.color)            AS color_pestel,
       MIN(p.emoji)            AS emoji_pestel,
       MIN(sec.nombre_sector)  AS sector_nombre,
       MIN(sec.slug_sector)    AS sector_slug,
       MIN(sec.color)          AS color_sector,
       MIN(sec.emoji)          AS emoji_sector,
       COUNT(DISTINCT es.id_senal) AS total_senales,
       COUNT(DISTINCT et.id_tendencia) AS total_tendencias,
       tp.nombre AS topico_nombre
     FROM escenario e
     LEFT JOIN escenario_pestel ep ON e.id_escenario = ep.id_escenario
     LEFT JOIN pestel p ON ep.id_pestel = p.id_pestel AND p.activo = 1
     LEFT JOIN escenario_sector esc ON e.id_escenario = esc.id_escenario
     LEFT JOIN sector sec ON esc.id_sector = sec.id_sector AND sec.activo = 1
     LEFT JOIN topico tp ON e.id_topico = tp.id_topico
     LEFT JOIN escenario_senal es ON e.id_escenario = es.id_escenario
     LEFT JOIN escenario_tendencia et ON e.id_escenario = et.id_escenario
     WHERE ${conditions.join(' AND ')}
     GROUP BY e.id_escenario
     ORDER BY e.fecha_publicacion DESC, e.fecha_creacion DESC`,
    params
  );

  return rows;
}
