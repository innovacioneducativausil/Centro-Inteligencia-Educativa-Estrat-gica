import { serverError } from '../middleware/errorHandler.js';
// server/routes/estadisticas.js
// KPIs globales para el Dashboard
import { Router } from 'express';
import db from '../db.js';

const router = Router();

/** GET /api/estadisticas — conteos para las tarjetas KPI del Dashboard */
router.get('/estadisticas', async (_req, res) => {
  try {
    const [[senales]]    = await db.query('SELECT COUNT(*) AS total FROM senal    WHERE id_estado = 1');
    const [[tendencias]] = await db.query('SELECT COUNT(*) AS total FROM tendencia WHERE id_estado = 1');
    const [[escenarios]] = await db.query('SELECT COUNT(*) AS total FROM escenario WHERE id_estado = 1');
    const [[usuarios]]   = await db.query('SELECT COUNT(*) AS total FROM usuario   WHERE activo = 1');
    const [[pesteles]]   = await db.query('SELECT COUNT(*) AS total FROM pestel    WHERE activo = 1');
    const [[sectores]]   = await db.query('SELECT COUNT(*) AS total FROM sector    WHERE activo = 1');

    // Señales publicadas este mes
    const [[senalesMes]] = await db.query(
      `SELECT COUNT(*) AS total FROM senal
       WHERE id_estado = 1
         AND fecha_publicacion >= DATE_FORMAT(NOW(), '%Y-%m-01')`
    );

    // Distribución PESTEL para el gráfico de dispersión
    const [distribucionPestel] = await db.query(
      `SELECT p.nombre_pestel AS categoria, p.color, p.emoji,
              COUNT(DISTINCT sp.id_senal)    AS total_senales,
              COUNT(DISTINCT tp.id_tendencia) AS total_tendencias
       FROM pestel p
       LEFT JOIN senal_pestel sp   ON p.id_pestel = sp.id_pestel
       LEFT JOIN tendencia_pestel tp ON p.id_pestel = tp.id_pestel
       WHERE p.activo = 1
       GROUP BY p.id_pestel
       ORDER BY p.orden_display`
    );

    // Señales recientes (últimas 5)
    const [senalesRecientes] = await db.query(
      `SELECT s.id_senal, s.titulo_senal, s.desc_corta_senal,
              s.fecha_publicacion,
              MIN(p.nombre_pestel) AS categoria,
              MIN(p.color)         AS color,
              MIN(p.emoji)         AS emoji
       FROM senal s
       LEFT JOIN senal_pestel sp ON s.id_senal = sp.id_senal
       LEFT JOIN pestel p        ON sp.id_pestel = p.id_pestel
       WHERE s.id_estado = 1
       GROUP BY s.id_senal, s.titulo_senal, s.desc_corta_senal, s.fecha_publicacion
       ORDER BY s.fecha_publicacion DESC, s.fecha_creacion DESC
       LIMIT 5`
    );

    res.json({
      kpis: {
        senales:    Number(senales.total),
        tendencias: Number(tendencias.total),
        escenarios: Number(escenarios.total),
        usuarios:   Number(usuarios.total),
        pesteles:   Number(pesteles.total),
        sectores:   Number(sectores.total),
        senalesMes: Number(senalesMes.total),
      },
      distribucionPestel: distribucionPestel.map(r => ({
        categoria:       r.categoria,
        color:           r.color,
        emoji:           r.emoji,
        totalSenales:    Number(r.total_senales),
        totalTendencias: Number(r.total_tendencias),
      })),
      senalesRecientes: senalesRecientes.map(r => ({
        uuid:        r.id_senal,
        title:       r.titulo_senal,
        description: r.desc_corta_senal,
        publishedAt: r.fecha_publicacion,
        categoria:   r.categoria,
        color:       r.color,
        emoji:       r.emoji,
      })),
    });
  } catch (err) {
    console.error('[GET /estadisticas]', err);
    serverError(res, err);
  }
});

export default router;
