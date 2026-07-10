import { serverError } from '../middleware/errorHandler.js';

import { Router } from 'express';
import { getEscenariosFiltrados } from '../repositories/principal/escenariosRepository.js';

const router = Router();


router.get('/escenarios', async (req, res) => {
  try {
    const { pestel, sector, q } = req.query;

    const rows = await getEscenariosFiltrados({ pestel, sector, q });

    const scenarios = rows.map((row, idx) => ({
      id:             idx + 1,
      uuid:           row.id_escenario,
      title:          row.titulo_escenario,
      description:    row.desc_corta_escenario || '',
      fullDescription: row.desc_larga_escenario || '',
      reasonText:     row.razon_cambio           || '',
      category:       row.categoria       || 'General',
      pestelSlug:     row.pestel_slug     || null,
      sector:         row.sector_nombre   || null,
      sectorSlug:     row.sector_slug     || null,
      color:          row.color_pestel    || row.color_sector || '#2A9D8F',
      emoji:          row.emoji_pestel    || row.emoji_sector || '🔭',
      imageUrl:       row.url_imagen_escenario || null,
      source:         row.fuente_escenario || null,
      sourceUrl:      row.url_fuente      || null,
      publishedAt:    row.fecha_publicacion,
      totalSenales:   Number(row.total_senales)    || 0,
      totalTendencias: Number(row.total_tendencias) || 0,
      horizon:        row.horizonte_escenario || null,
      probability:    row.probabilidad ?? null,
      topico:         row.topico_nombre || null,
      autor:          row.autor || null,

      referencias:    (() => {
        const raw = row.url_fuente;
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.filter(Boolean);
          if (typeof parsed === 'string' && parsed) return [parsed];
        } catch {}
        return [raw];
      })(),
    }));

    res.json({ total: scenarios.length, data: scenarios });
  } catch (err) {
    serverError(res, err, 'GET /escenarios');
  }
});

export default router;
