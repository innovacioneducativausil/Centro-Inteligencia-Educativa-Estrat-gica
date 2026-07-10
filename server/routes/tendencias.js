import { serverError } from '../middleware/errorHandler.js';

import { Router } from 'express';
import { getTendenciasFiltradas } from '../repositories/principal/tendenciasRepository.js';

const router = Router();

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}


router.get('/tendencias', async (req, res) => {
  try {
    const { pestel, sector, q } = req.query;

    const rows = await getTendenciasFiltradas({ pestel, sector, q });


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
    serverError(res, err, 'GET /tendencias');
  }
});

export default router;
