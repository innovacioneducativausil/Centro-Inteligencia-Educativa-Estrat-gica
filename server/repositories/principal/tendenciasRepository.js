import db from '../../db.js';

export async function getTendenciasFiltradas({ pestel, sector, q } = {}) {
  const conditions = ['t.id_estado = 1'];
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
    conditions.push('(t.titulo_tendencia LIKE ? OR t.desc_corta_tendencia LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const [rows] = await db.query(
    `SELECT
       t.id_tendencia,
       t.titulo_tendencia,
       t.nombre_tendencia,
       t.desc_corta_tendencia,
       t.desc_larga_tendencia,
       t.razon_cambio,
       t.url_video_tendencia,
       t.url_imagen_tendencia,
       t.fuente_tendencia,
       t.url_fuente,
       t.fecha_publicacion,
       t.autor,
       MIN(p.id_pestel)       AS pestel_id,
       MIN(p.nombre_pestel)   AS categoria,
       MIN(p.slug_pestel)     AS pestel_slug,
       MIN(p.color)           AS color_pestel,
       MIN(p.emoji)           AS emoji_pestel,
       MIN(p.letra_codigo)    AS pestel_letra,
       MIN(sec.id_sector)     AS sector_id,
       MIN(sec.nombre_sector) AS sector_nombre,
       MIN(sec.slug_sector)   AS sector_slug,
       MIN(sec.color)         AS color_sector,
       MIN(sec.emoji)         AS emoji_sector,
       COUNT(DISTINCT st.id_senal) AS total_senales,
       tpc.nombre AS topico_nombre,
       GROUP_CONCAT(DISTINCT tpr.nombre ORDER BY tpr.nombre SEPARATOR '|') AS topicos_relacionados
     FROM tendencia t
     LEFT JOIN topico tpc ON t.id_topico = tpc.id_topico
     LEFT JOIN topico_relac_tendencia trt ON t.id_tendencia = trt.id_tendencia
     LEFT JOIN topico tpr ON trt.id_topico = tpr.id_topico
     LEFT JOIN tendencia_pestel tp ON t.id_tendencia = tp.id_tendencia
     LEFT JOIN pestel p ON tp.id_pestel = p.id_pestel AND p.activo = 1
     LEFT JOIN tendencia_sector ts ON t.id_tendencia = ts.id_tendencia
     LEFT JOIN sector sec ON ts.id_sector = sec.id_sector AND sec.activo = 1
     LEFT JOIN senal st ON st.id_tendencia = t.id_tendencia AND st.id_estado = 1
     WHERE ${conditions.join(' AND ')}
     GROUP BY t.id_tendencia
     ORDER BY t.fecha_publicacion DESC, t.fecha_creacion DESC`,
    params
  );

  return rows;
}
