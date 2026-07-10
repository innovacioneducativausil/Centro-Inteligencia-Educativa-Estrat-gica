import db from '../../db.js';

export async function getSenalesFiltradas({ pestel, sector, q } = {}) {
  const conditions = ['s.id_estado = 1'];
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
    conditions.push('(s.titulo_senal LIKE ? OR s.desc_corta_senal LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const [rows] = await db.query(
    `SELECT
       s.id_senal,
       s.titulo_senal,
       s.nombre_senal,
       s.desc_corta_senal,
       s.desc_larga_senal,
       s.razon_cambio,
       s.url_video_senal,
       s.url_imagen_senal,
       s.fuente_senal,
       s.url_fuente,
       s.fecha_publicacion,
       s.fecha_senal_articulo,
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
       tp.nombre              AS topico_nombre
     FROM senal s
     LEFT JOIN topico tp        ON s.id_topico  = tp.id_topico
     LEFT JOIN senal_pestel sp  ON s.id_senal   = sp.id_senal
     LEFT JOIN pestel p         ON sp.id_pestel = p.id_pestel AND p.activo = 1
     LEFT JOIN senal_sector ss  ON s.id_senal   = ss.id_senal
     LEFT JOIN sector sec       ON ss.id_sector = sec.id_sector AND sec.activo = 1
     WHERE ${conditions.join(' AND ')}
     GROUP BY s.id_senal
     ORDER BY s.fecha_publicacion DESC, s.fecha_creacion DESC`,
    params
  );

  return rows;
}

export async function getSenalActivaByUuid(uuid) {
  const [[row]] = await db.query(
    `SELECT s.*,
       GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '||') AS pesteles,
       GROUP_CONCAT(DISTINCT p.slug_pestel ORDER BY p.orden_display SEPARATOR '||') AS pestel_slugs,
       GROUP_CONCAT(DISTINCT p.color ORDER BY p.orden_display SEPARATOR '||') AS pestel_colors,
       GROUP_CONCAT(DISTINCT p.emoji ORDER BY p.orden_display SEPARATOR '||') AS pestel_emojis,
       GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.orden_display SEPARATOR '||') AS sectores,
       GROUP_CONCAT(DISTINCT sec.slug_sector ORDER BY sec.orden_display SEPARATOR '||') AS sector_slugs
     FROM senal s
     LEFT JOIN senal_pestel sp ON s.id_senal = sp.id_senal
     LEFT JOIN pestel p        ON sp.id_pestel = p.id_pestel
     LEFT JOIN senal_sector ss ON s.id_senal = ss.id_senal
     LEFT JOIN sector sec      ON ss.id_sector = sec.id_sector
     WHERE s.id_senal = ? AND s.id_estado = 1
     GROUP BY s.id_senal`,
    [uuid]
  );

  return row || null;
}
