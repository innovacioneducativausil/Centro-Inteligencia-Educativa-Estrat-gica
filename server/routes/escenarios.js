import { serverError } from '../middleware/errorHandler.js';
// server/routes/escenarios.js
import { Router } from 'express';
import db from '../db.js';

const router = Router();

/**
 * GET /api/escenarios
 * Query params opcionales: pestel, sector, q
 */
router.get('/escenarios', async (req, res) => {
  try {
    const { pestel, sector, q } = req.query;

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

    const where = conditions.join(' AND ');

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
         COUNT(DISTINCT es.id_senal)      AS total_senales,
         COUNT(DISTINCT et.id_tendencia)  AS total_tendencias,
         tp.nombre AS topico_nombre
       FROM escenario e
       LEFT JOIN escenario_pestel ep ON e.id_escenario = ep.id_escenario
       LEFT JOIN pestel p            ON ep.id_pestel   = p.id_pestel AND p.activo = 1
       LEFT JOIN escenario_sector esc ON e.id_escenario = esc.id_escenario
       LEFT JOIN sector sec           ON esc.id_sector  = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tp            ON e.id_topico    = tp.id_topico
       LEFT JOIN escenario_senal es   ON e.id_escenario = es.id_escenario
       LEFT JOIN escenario_tendencia et ON e.id_escenario = et.id_escenario
       WHERE ${where}
       GROUP BY e.id_escenario
       ORDER BY e.fecha_publicacion DESC, e.fecha_creacion DESC`,
      params
    );

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
      // url_fuente puede ser JSON array o URL simple
      referencias:    (() => {
        const raw = row.url_fuente;
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.filter(Boolean);
          if (typeof parsed === 'string' && parsed) return [parsed];
        } catch { /* no es JSON válido */ }
        return [raw];
      })(),
    }));

    res.json({ total: scenarios.length, data: scenarios });
  } catch (err) {
    console.error('[GET /escenarios]', err);
    serverError(res, err);
  }
});

export default router;
