import { serverError } from '../middleware/errorHandler.js';
// server/routes/senales.js
import { Router } from 'express';
import db from '../db.js';

const router = Router();

/** Extrae el ID de YouTube de una URL (cualquier formato) */
function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/**
 * GET /api/senales
 * Query params opcionales:
 *   pestel  → slug_pestel  (ej. "social")
 *   sector  → slug_sector  (ej. "educacion")
 *   q       → búsqueda en título / descripción
 */
router.get('/senales', async (req, res) => {
  try {
    const { pestel, sector, q } = req.query;

    // Construcción dinámica del WHERE
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

    const where = conditions.join(' AND ');

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
         MIN(p.id_pestel)      AS pestel_id,
         MIN(p.nombre_pestel)  AS categoria,
         MIN(p.slug_pestel)    AS pestel_slug,
         MIN(p.color)          AS color_pestel,
         MIN(p.emoji)          AS emoji_pestel,
         MIN(p.letra_codigo)   AS pestel_letra,
         MIN(sec.id_sector)    AS sector_id,
         MIN(sec.nombre_sector) AS sector_nombre,
         MIN(sec.slug_sector)  AS sector_slug,
         MIN(sec.color)        AS color_sector,
         MIN(sec.emoji)        AS emoji_sector,
         tp.nombre              AS topico_nombre
       FROM senal s
       LEFT JOIN topico tp         ON s.id_topico  = tp.id_topico
       LEFT JOIN senal_pestel sp  ON s.id_senal   = sp.id_senal
       LEFT JOIN pestel p         ON sp.id_pestel = p.id_pestel AND p.activo = 1
       LEFT JOIN senal_sector ss  ON s.id_senal   = ss.id_senal
       LEFT JOIN sector sec       ON ss.id_sector = sec.id_sector AND sec.activo = 1
       WHERE ${where}
       GROUP BY s.id_senal
       ORDER BY s.fecha_publicacion DESC, s.fecha_creacion DESC`,
      params
    );

    const signals = rows.map((row, idx) => ({
      id:             idx + 1,
      uuid:           row.id_senal,
      title:          row.titulo_senal,
      signalText:     row.desc_corta_senal || '',
      implicationText: row.desc_larga_senal || '',
      reasonText:     row.razon_cambio     || '',
      category:       row.categoria        || 'General',
      pestelSlug:     row.pestel_slug      || null,
      pestelLetra:    row.pestel_letra     || null,
      sector:         row.sector_nombre    || null,
      sectorSlug:     row.sector_slug      || null,
      color:          row.color_pestel     || row.color_sector || '#2A9D8F',
      emoji:          row.emoji_pestel     || row.emoji_sector || '📡',
      youtubeId:      extractYouTubeId(row.url_video_senal),
      imageUrl:       row.url_imagen_senal || null,
      source:         row.fuente_senal     || null,
      sourceUrl:      row.url_fuente       || null,
      publishedAt:    row.fecha_publicacion,
      articleDate:    row.fecha_senal_articulo || null,
      // Métricas calculadas (la BD no tiene estos campos numéricos aún)
      urgency:        60 + (idx * 7) % 40,
      impact:         55 + (idx * 11) % 45,
      maturity:       40 + (idx * 13) % 60,
      topico:         row.topico_nombre || null,
    }));

    res.json({ total: signals.length, data: signals });
  } catch (err) {
    console.error('[GET /senales]', err);
    serverError(res, err);
  }
});

/**
 * GET /api/senales/:uuid
 * Devuelve una señal individual con todos sus PESTEL y sectores asociados
 */
router.get('/senales/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const [[row]] = await db.query(
      `SELECT s.*,
         GROUP_CONCAT(DISTINCT p.nombre_pestel  ORDER BY p.orden_display SEPARATOR '||') AS pesteles,
         GROUP_CONCAT(DISTINCT p.slug_pestel    ORDER BY p.orden_display SEPARATOR '||') AS pestel_slugs,
         GROUP_CONCAT(DISTINCT p.color          ORDER BY p.orden_display SEPARATOR '||') AS pestel_colors,
         GROUP_CONCAT(DISTINCT p.emoji          ORDER BY p.orden_display SEPARATOR '||') AS pestel_emojis,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.orden_display SEPARATOR '||') AS sectores,
         GROUP_CONCAT(DISTINCT sec.slug_sector   ORDER BY sec.orden_display SEPARATOR '||') AS sector_slugs
       FROM senal s
       LEFT JOIN senal_pestel sp ON s.id_senal = sp.id_senal
       LEFT JOIN pestel p        ON sp.id_pestel = p.id_pestel
       LEFT JOIN senal_sector ss  ON s.id_senal = ss.id_senal
       LEFT JOIN sector sec       ON ss.id_sector = sec.id_sector
       WHERE s.id_senal = ? AND s.id_estado = 1
       GROUP BY s.id_senal`,
      [uuid]
    );

    if (!row) return res.status(404).json({ error: 'Señal no encontrada' });

    res.json({
      uuid:           row.id_senal,
      title:          row.titulo_senal,
      signalText:     row.desc_corta_senal,
      implicationText: row.desc_larga_senal,
      youtubeId:      extractYouTubeId(row.url_video_senal),
      imageUrl:       row.url_imagen_senal,
      source:         row.fuente_senal,
      sourceUrl:      row.url_fuente,
      pesteles:       row.pesteles     ? row.pesteles.split('||')     : [],
      pestelSlugs:    row.pestel_slugs ? row.pestel_slugs.split('||') : [],
      pestelColors:   row.pestel_colors ? row.pestel_colors.split('||') : [],
      pestelEmojis:   row.pestel_emojis ? row.pestel_emojis.split('||') : [],
      sectores:       row.sectores     ? row.sectores.split('||')     : [],
      sectorSlugs:    row.sector_slugs ? row.sector_slugs.split('||') : [],
      publishedAt:    row.fecha_publicacion,
    });
  } catch (err) {
    console.error('[GET /senales/:uuid]', err);
    serverError(res, err);
  }
});

export default router;
