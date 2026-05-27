import { serverError } from '../middleware/errorHandler.js';
// server/routes/tendencias.js
import { Router } from 'express';
import db from '../db.js';

const router = Router();

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/**
 * GET /api/tendencias
 * Query params opcionales: pestel, sector, q
 */
router.get('/tendencias', async (req, res) => {
  try {
    const { pestel, sector, q } = req.query;

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

    const where = conditions.join(' AND ');

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
       LEFT JOIN topico tpc           ON t.id_topico    = tpc.id_topico
       LEFT JOIN topico_relac_tendencia trt ON t.id_tendencia = trt.id_tendencia
       LEFT JOIN topico tpr                 ON trt.id_topico   = tpr.id_topico
       LEFT JOIN tendencia_pestel tp ON t.id_tendencia = tp.id_tendencia
       LEFT JOIN pestel p            ON tp.id_pestel   = p.id_pestel AND p.activo = 1
       LEFT JOIN tendencia_sector ts ON t.id_tendencia = ts.id_tendencia
       LEFT JOIN sector sec          ON ts.id_sector   = sec.id_sector AND sec.activo = 1
       LEFT JOIN senal st            ON st.id_tendencia = t.id_tendencia AND st.id_estado = 1
       WHERE ${where}
       GROUP BY t.id_tendencia
       ORDER BY t.fecha_publicacion DESC, t.fecha_creacion DESC`,
      params
    );

    // Estado semaforo basado en cantidad de señales asociadas
    const statusMap = (count) => {
      if (count >= 5) return 'Crítico';
      if (count >= 2) return 'Alto';
      return 'Emergente';
    };

    const trends = rows.map((row, idx) => ({
      id:             idx + 1,
      uuid:           row.id_tendencia,
      name:           row.titulo_tendencia,
      nombreTendencia: row.nombre_tendencia || null,
      description:    row.desc_corta_tendencia || '',
      fullDescription: row.desc_larga_tendencia || '',
      reasonText:     row.razon_cambio          || '',
      category:       row.categoria        || 'General',
      pestelSlug:     row.pestel_slug      || null,
      pestelLetra:    row.pestel_letra     || null,
      sector:         row.sector_nombre    || null,
      sectorSlug:     row.sector_slug      || null,
      color:          row.color_pestel     || row.color_sector || '#2A9D8F',
      emoji:          row.emoji_pestel     || row.emoji_sector || '📈',
      youtubeId:      extractYouTubeId(row.url_video_tendencia),
      imageUrl:       row.url_imagen_tendencia || null,
      source:         row.fuente_tendencia || null,
      sourceUrl:      row.url_fuente       || null,
      publishedAt:    row.fecha_publicacion,
      totalSenales:   Number(row.total_senales) || 0,
      // Métricas calculadas
      status:         statusMap(Number(row.total_senales)),
      impact:         60 + (idx * 9) % 40,
      maturity:       45 + (idx * 13) % 55,
      horizon:        idx % 3 === 0 ? 'Corto Plazo' : idx % 3 === 1 ? 'Medio Plazo' : 'Largo Plazo',
      topico:         row.topico_nombre || null,
      topicosRelacionados: row.topicos_relacionados ? row.topicos_relacionados.split('|') : [],
      autor:          row.autor || null,
    }));

    res.json({ total: trends.length, data: trends });
  } catch (err) {
    console.error('[GET /tendencias]', err);
    serverError(res, err);
  }
});

export default router;
