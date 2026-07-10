import db from '../../db.js';

export async function getTopicosConElementosActivos() {
  const [rows] = await db.query(
    `SELECT DISTINCT tp.id_topico, tp.nombre
     FROM topico tp
     WHERE EXISTS (SELECT 1 FROM senal s WHERE s.id_topico = tp.id_topico AND s.id_estado = 1)
        OR EXISTS (SELECT 1 FROM tendencia t WHERE t.id_topico = tp.id_topico AND t.id_estado = 1)
        OR EXISTS (SELECT 1 FROM escenario e WHERE e.id_topico = tp.id_topico AND e.id_estado = 1)
     ORDER BY tp.nombre`
  );
  return rows;
}

export async function getCadenaTopico(idTopico) {
  const [[senales], [tendencias], [escenarios], [relST], [relSE], [relTE]] = await Promise.all([
    db.query(
      `SELECT s.id_senal AS uuid, s.titulo_senal AS titulo, s.desc_corta_senal AS descCorta,
              s.url_imagen_senal AS urlImagen, s.fuente_senal AS fuente, s.url_fuente AS urlFuente,
              MIN(p.nombre_pestel) AS pestel, MIN(p.color) AS color
       FROM senal s
       LEFT JOIN senal_pestel sp ON s.id_senal = sp.id_senal
       LEFT JOIN pestel p ON sp.id_pestel = p.id_pestel AND p.activo = 1
       WHERE s.id_topico = ? AND s.id_estado = 1
       GROUP BY s.id_senal
       ORDER BY s.fecha_publicacion DESC`,
      [idTopico]
    ),
    db.query(
      `SELECT t.id_tendencia AS uuid, t.titulo_tendencia AS titulo, t.desc_corta_tendencia AS descCorta,
              MIN(p.nombre_pestel) AS pestel, MIN(p.color) AS color
       FROM tendencia t
       LEFT JOIN tendencia_pestel tp2 ON t.id_tendencia = tp2.id_tendencia
       LEFT JOIN pestel p ON tp2.id_pestel = p.id_pestel AND p.activo = 1
       WHERE t.id_topico = ? AND t.id_estado = 1
       GROUP BY t.id_tendencia
       ORDER BY t.fecha_publicacion DESC`,
      [idTopico]
    ),
    db.query(
      `SELECT e.id_escenario AS uuid, e.titulo_escenario AS titulo, e.desc_corta_escenario AS descCorta,
              e.probabilidad,
              MIN(p.nombre_pestel) AS pestel, MIN(p.color) AS color
       FROM escenario e
       LEFT JOIN escenario_pestel ep ON e.id_escenario = ep.id_escenario
       LEFT JOIN pestel p ON ep.id_pestel = p.id_pestel AND p.activo = 1
       WHERE e.id_topico = ? AND e.id_estado = 1
       GROUP BY e.id_escenario
       ORDER BY e.fecha_publicacion DESC`,
      [idTopico]
    ),
    db.query(
      `SELECT s.id_senal AS idSenal, t.id_tendencia AS idTendencia
       FROM senal_tendencia st
       JOIN senal s ON st.id_senal = s.id_senal AND s.id_topico = ? AND s.id_estado = 1
       JOIN tendencia t ON st.id_tendencia = t.id_tendencia AND t.id_topico = ? AND t.id_estado = 1`,
      [idTopico, idTopico]
    ),
    db.query(
      `SELECT s.id_senal AS idSenal, e.id_escenario AS idEscenario
       FROM senal_escenario se
       JOIN senal s ON se.id_senal = s.id_senal AND s.id_topico = ? AND s.id_estado = 1
       JOIN escenario e ON se.id_escenario = e.id_escenario AND e.id_topico = ? AND e.id_estado = 1`,
      [idTopico, idTopico]
    ),
    db.query(
      `SELECT t.id_tendencia AS idTendencia, e.id_escenario AS idEscenario
       FROM tendencia_escenario te
       JOIN tendencia t ON te.id_tendencia = t.id_tendencia AND t.id_topico = ? AND t.id_estado = 1
       JOIN escenario e ON te.id_escenario = e.id_escenario AND e.id_topico = ? AND e.id_estado = 1`,
      [idTopico, idTopico]
    ),
  ]);

  return { senales, tendencias, escenarios, relST, relSE, relTE };
}

export async function getTopicoById(idTopico) {
  const [[row]] = await db.query('SELECT id_topico, nombre FROM topico WHERE id_topico = ? LIMIT 1', [idTopico]);
  return row || null;
}

export async function getElementosPublicadosByTopico(idTopico) {
  const [[senales], [tendencias], [escenarios]] = await Promise.all([
    db.query(
      'SELECT id_senal AS uuid, titulo_senal AS titulo, desc_corta_senal AS descCorta FROM senal WHERE id_topico=? AND id_estado=1',
      [idTopico]
    ),
    db.query(
      'SELECT id_tendencia AS uuid, titulo_tendencia AS titulo, desc_corta_tendencia AS descCorta FROM tendencia WHERE id_topico=? AND id_estado=1',
      [idTopico]
    ),
    db.query(
      'SELECT id_escenario AS uuid, titulo_escenario AS titulo, desc_corta_escenario AS descCorta FROM escenario WHERE id_topico=? AND id_estado=1',
      [idTopico]
    ),
  ]);

  return { senales, tendencias, escenarios };
}

export async function countRelacionesTopico(idTopico) {
  const [[cntST], [cntSE], [cntTE]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n FROM senal_tendencia st
       JOIN senal s ON st.id_senal=s.id_senal WHERE s.id_topico=?`,
      [idTopico]
    ),
    db.query(
      `SELECT COUNT(*) AS n FROM senal_escenario se
       JOIN senal s ON se.id_senal=s.id_senal WHERE s.id_topico=?`,
      [idTopico]
    ),
    db.query(
      `SELECT COUNT(*) AS n FROM tendencia_escenario te
       JOIN tendencia t ON te.id_tendencia=t.id_tendencia WHERE t.id_topico=?`,
      [idTopico]
    ),
  ]);

  return (cntST[0]?.n || 0) + (cntSE[0]?.n || 0) + (cntTE[0]?.n || 0);
}

export async function getRelacionesTopico(idTopico) {
  const [[relST], [relSE], [relTE]] = await Promise.all([
    db.query(
      `SELECT s.id_senal AS idA, t.id_tendencia AS idB
       FROM senal_tendencia st
       JOIN senal s ON st.id_senal=s.id_senal
       JOIN tendencia t ON st.id_tendencia=t.id_tendencia
       WHERE s.id_topico=? AND t.id_topico=?`,
      [idTopico, idTopico]
    ),
    db.query(
      `SELECT s.id_senal AS idA, e.id_escenario AS idB
       FROM senal_escenario se
       JOIN senal s ON se.id_senal=s.id_senal
       JOIN escenario e ON se.id_escenario=e.id_escenario
       WHERE s.id_topico=? AND e.id_topico=?`,
      [idTopico, idTopico]
    ),
    db.query(
      `SELECT t.id_tendencia AS idA, e.id_escenario AS idB
       FROM tendencia_escenario te
       JOIN tendencia t ON te.id_tendencia=t.id_tendencia
       JOIN escenario e ON te.id_escenario=e.id_escenario
       WHERE t.id_topico=? AND e.id_topico=?`,
      [idTopico, idTopico]
    ),
  ]);

  return [
    ...relST.map(r => ({ tipo: 'senal_tendencia', idA: r.idA, idB: r.idB })),
    ...relSE.map(r => ({ tipo: 'senal_escenario', idA: r.idA, idB: r.idB })),
    ...relTE.map(r => ({ tipo: 'tendencia_escenario', idA: r.idA, idB: r.idB })),
  ];
}

export async function saveRelacionInferida(rel) {
  if (rel.tipo === 'senal_tendencia') {
    await db.query('INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (?,?)', [rel.idA, rel.idB]);
    return;
  }
  if (rel.tipo === 'tendencia_escenario') {
    await db.query('INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (?,?)', [rel.idA, rel.idB]);
    return;
  }
  if (rel.tipo === 'senal_escenario') {
    await db.query('INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (?,?)', [rel.idA, rel.idB]);
  }
}
