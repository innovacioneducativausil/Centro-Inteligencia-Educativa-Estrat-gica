import { serverError } from '../middleware/errorHandler.js';

import { Router } from 'express';
import { getSenalActivaByUuid, getSenalesFiltradas } from '../repositories/principal/senalesRepository.js';

const router = Router();


function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}


router.get('/senales', async (req, res) => {
  try {
    const { pestel, sector, q } = req.query;

    const rows = await getSenalesFiltradas({ pestel, sector, q });

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

      urgency:        60 + (idx * 7) % 40,
      impact:         55 + (idx * 11) % 45,
      maturity:       40 + (idx * 13) % 60,
      topico:         row.topico_nombre || null,
    }));

    res.json({ total: signals.length, data: signals });
  } catch (err) {
    serverError(res, err, 'GET /senales');
  }
});


router.get('/senales/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const row = await getSenalActivaByUuid(uuid);

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
      articleDate:    row.fecha_senal_articulo || null,
    });
  } catch (err) {
    serverError(res, err, 'GET /senales/:uuid');
  }
});

export default router;
