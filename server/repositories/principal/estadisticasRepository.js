import db from '../../db.js';

export async function getDashboardStats() {
  const [
    [[senales]],
    [[tendencias]],
    [[escenarios]],
    [[usuarios]],
    [[pesteles]],
    [[sectores]],
    [[senalesMes]],
    [distribucionPestel],
    [senalesRecientes],
  ] = await Promise.all([
    db.query('SELECT COUNT(*) AS total FROM senal WHERE id_estado = 1'),
    db.query('SELECT COUNT(*) AS total FROM tendencia WHERE id_estado = 1'),
    db.query('SELECT COUNT(*) AS total FROM escenario WHERE id_estado = 1'),
    db.query('SELECT COUNT(*) AS total FROM usuario WHERE activo = 1'),
    db.query('SELECT COUNT(*) AS total FROM pestel WHERE activo = 1'),
    db.query('SELECT COUNT(*) AS total FROM sector WHERE activo = 1'),
    db.query(
      `SELECT COUNT(*) AS total FROM senal
       WHERE id_estado = 1
         AND fecha_publicacion >= DATE_FORMAT(NOW(), '%Y-%m-01')`
    ),
    db.query(
      `SELECT p.nombre_pestel AS categoria, p.color, p.emoji,
              COUNT(DISTINCT sp.id_senal) AS total_senales,
              COUNT(DISTINCT tp.id_tendencia) AS total_tendencias
       FROM pestel p
       LEFT JOIN senal_pestel sp ON p.id_pestel = sp.id_pestel
       LEFT JOIN tendencia_pestel tp ON p.id_pestel = tp.id_pestel
       WHERE p.activo = 1
       GROUP BY p.id_pestel
       ORDER BY p.orden_display`
    ),
    db.query(
      `SELECT s.id_senal, s.titulo_senal, s.desc_corta_senal,
              s.fecha_publicacion,
              MIN(p.nombre_pestel) AS categoria,
              MIN(p.color) AS color,
              MIN(p.emoji) AS emoji
       FROM senal s
       LEFT JOIN senal_pestel sp ON s.id_senal = sp.id_senal
       LEFT JOIN pestel p ON sp.id_pestel = p.id_pestel
       WHERE s.id_estado = 1
       GROUP BY s.id_senal, s.titulo_senal, s.desc_corta_senal, s.fecha_publicacion
       ORDER BY s.fecha_publicacion DESC, s.fecha_creacion DESC
       LIMIT 5`
    ),
  ]);

  return {
    senales,
    tendencias,
    escenarios,
    usuarios,
    pesteles,
    sectores,
    senalesMes,
    distribucionPestel,
    senalesRecientes,
  };
}
