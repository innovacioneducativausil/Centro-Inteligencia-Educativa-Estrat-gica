import { serverError } from '../middleware/errorHandler.js';


import { Router } from 'express';
import { getDashboardStats } from '../repositories/principal/estadisticasRepository.js';

const router = Router();


router.get('/estadisticas', async (_req, res) => {
  try {
    const {
      senales,
      tendencias,
      escenarios,
      usuarios,
      pesteles,
      sectores,
      senalesMes,
      distribucionPestel,
      senalesRecientes,
    } = await getDashboardStats();

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
    serverError(res, err, 'GET /estadisticas');
  }
});

export default router;
