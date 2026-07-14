import db from '../../db.js';

export const ARCHIVABLE = {
  senales:    { label: 'señal',    procEnsure: 'radar_ensureUniqueSenal',    procArchive: 'radar_archiveSenal' },
  tendencias: { label: 'Tendencia', procEnsure: 'radar_ensureUniqueTendencia', procArchive: 'radar_archiveTendencia' },
  escenarios: { label: 'Escenario', procEnsure: 'radar_ensureUniqueEscenario', procArchive: 'radar_archiveEscenario' },
};

export async function withTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getAdminOptions() {
  const [results] = await db.query('CALL radar_getAdminOptions()');
  return { pestels: results[0], sectors: results[1] };
}

export async function getNotificaciones() {
  const [results] = await db.query('CALL radar_getNotificaciones()');
  return results[0];
}

// ── UTIL: validación de unicidad ─────────────────────────────

export async function ensureUniqueTitleOrName(resource, titulo, nombre, excludeId = null) {
  const cfg = ARCHIVABLE[resource];
  if (!cfg) throw new Error('Recurso invalido para validacion de duplicados.');
  const [results] = await db.query(
    `CALL ${cfg.procEnsure}(?, ?, ?)`,
    [titulo, nombre, excludeId || null]
  );
  const dup = results[0]?.[0];
  if (!dup) return;
  const article = cfg.label === 'Escenario' ? 'un' : 'una';
  const err = new Error(`Ya existe ${article} ${cfg.label.toLowerCase()} con ese titulo o nombre. Usa uno diferente.`);
  err.status = 400;
  throw err;
}

// ── ARCHIVADO ────────────────────────────────────────────────

export async function getResourceForArchive(resource, uuid) {
  const procMap = {
    senales:    'SELECT id_senal AS id, titulo_senal AS titulo, id_estado FROM senal WHERE id_senal = ?',
    tendencias: 'SELECT id_tendencia AS id, titulo_tendencia AS titulo, id_estado FROM tendencia WHERE id_tendencia = ?',
    escenarios: 'SELECT id_escenario AS id, titulo_escenario AS titulo, id_estado FROM escenario WHERE id_escenario = ?',
  };
  const sql = procMap[resource];
  if (!sql) return null;
  const [[row]] = await db.query(sql, [uuid]);
  return row || null;
}

export async function setResourceArchived(resource, uuid, userId) {
  const cfg = ARCHIVABLE[resource];
  if (!cfg) throw new Error('Recurso invalido.');
  await db.query(`CALL ${cfg.procArchive}(?, ?)`, [uuid, userId]);
}

// ── SEÑALES — CONSULTAS ──────────────────────────────────────

export async function countSenales(q, estado, exclArch, pestelCsv, sectorCsv) {
  const [results] = await db.query('CALL radar_countSenales(?, ?, ?, ?, ?)', [
    q || null, estado || null, exclArch ? 1 : 0, pestelCsv || null, sectorCsv || null,
  ]);
  return Number(results[0][0].total);
}

export async function listSenales(q, estado, exclArch, pestelCsv, sectorCsv, limit, offset) {
  const [results] = await db.query('CALL radar_listSenales(?, ?, ?, ?, ?, ?, ?)', [
    q || null, estado || null, exclArch ? 1 : 0, pestelCsv || null, sectorCsv || null, limit, offset,
  ]);
  return results[0];
}

export async function getSenalEstado(uuid) {
  const [results] = await db.query('CALL radar_getSenalEstado(?)', [uuid]);
  return results[0]?.[0] || null;
}

export async function getSenalDetalle(uuid) {
  const [results] = await db.query('CALL radar_getSenalDetalle(?)', [uuid]);
  const row = results[0]?.[0];
  if (!row) return null;
  return {
    row,
    pestels:  results[1],
    sectors:  results[2],
    tendRel:  results[3],
    escRel:   results[4],
  };
}

// ── SEÑALES — ESCRITURAS ─────────────────────────────────────

export async function updateSenalEstado(uuid, nuevoEstado) {
  await db.query('CALL radar_updateSenalEstado(?, ?)', [uuid, nuevoEstado]);
}

export async function createSenal(newId, data, usuarioId) {
  const { tituloFin, nombreFin, descCorta, descLarga, razonCambio, fuente, urlFuente,
          imagenUrl, videoUrl, autor, fechaArticulo, idEstado,
          pestelsToInsert, sids, tids, eids } = data;
  await db.query('CALL radar_createSenal(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFin, nombreFin, descCorta, descLarga, razonCambio,
    fuente, urlFuente, imagenUrl || null, videoUrl || null,
    autor || null, fechaArticulo || null, idEstado, usuarioId,
    JSON.stringify(pestelsToInsert || []),
    JSON.stringify(sids || []),
    JSON.stringify(tids || []),
    JSON.stringify(eids || []),
  ]);
}

export async function updateSenal(uuid, data, usuarioId) {
  const { tituloFin, nombreFin, descCorta, descLarga, razonCambio, fuente, urlFuente,
          imagenUrl, videoUrl, autor, fechaArticulo, idEstado, pids, sids, tids, eids } = data;
  await db.query('CALL radar_updateSenal(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    uuid, tituloFin, nombreFin, descCorta, descLarga, razonCambio,
    fuente, urlFuente, imagenUrl || null, videoUrl || null,
    autor || null, fechaArticulo || null, idEstado, usuarioId,
    JSON.stringify(pids || []),
    JSON.stringify(sids || []),
    JSON.stringify(tids || []),
    JSON.stringify(eids || []),
  ]);
}

// ── TENDENCIAS — CONSULTAS ───────────────────────────────────

export async function countTendencias(q, estado, exclArch, pestelCsv, sectorCsv) {
  const [results] = await db.query('CALL radar_countTendencias(?, ?, ?, ?, ?)', [
    q || null, estado || null, exclArch ? 1 : 0, pestelCsv || null, sectorCsv || null,
  ]);
  return Number(results[0][0].total);
}

export async function listTendencias(q, estado, exclArch, pestelCsv, sectorCsv, limit, offset) {
  const [results] = await db.query('CALL radar_listTendencias(?, ?, ?, ?, ?, ?, ?)', [
    q || null, estado || null, exclArch ? 1 : 0, pestelCsv || null, sectorCsv || null, limit, offset,
  ]);
  return results[0];
}

export async function getTendenciaEstado(uuid) {
  const [[row]] = await db.query('SELECT id_tendencia FROM tendencia WHERE id_tendencia = ?', [uuid]);
  return row || null;
}

export async function getTendenciaDetalle(uuid) {
  const [results] = await db.query('CALL radar_getTendenciaDetalle(?)', [uuid]);
  const row = results[0]?.[0];
  if (!row) return null;
  return {
    row,
    pestels:       results[1],
    sectors:       results[2],
    topicosRelac:  results[3],
    senRel:        results[4],
    escRel:        results[5],
  };
}

// ── TENDENCIAS — ESCRITURAS ──────────────────────────────────

export async function updateTendenciaEstado(uuid, nuevoEstado) {
  await db.query('CALL radar_updateTendenciaEstado(?, ?)', [uuid, nuevoEstado]);
}

export async function createTendencia(newId, data, usuarioId) {
  const { tituloFin, nombreFin, descCorta, descLarga, razonCambio, fuente, urlFuente,
          imagenUrl, videoUrl, autor, idEstado, pestelsToInsert, sids, senIds, eids } = data;
  await db.query('CALL radar_createTendencia(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFin, nombreFin, descCorta, descLarga, razonCambio,
    fuente, urlFuente, imagenUrl || null, videoUrl || null,
    autor || null, idEstado, usuarioId,
    JSON.stringify(pestelsToInsert || []),
    JSON.stringify(sids || []),
    JSON.stringify(senIds || []),
    JSON.stringify(eids || []),
  ]);
}

export async function updateTendencia(uuid, data, usuarioId) {
  const { tituloFin, nombreFin, descCorta, descLarga, razonCambio, fuente, urlFuente,
          imagenUrl, videoUrl, autor, idEstado, pids, sids, senIds, eids } = data;
  await db.query('CALL radar_updateTendencia(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    uuid, tituloFin, nombreFin, descCorta, descLarga, razonCambio,
    fuente, urlFuente, imagenUrl || null, videoUrl || null,
    autor || null, idEstado, usuarioId,
    JSON.stringify(pids || []),
    JSON.stringify(sids || []),
    JSON.stringify(senIds || []),
    JSON.stringify(eids || []),
  ]);
}

// ── ESCENARIOS — CONSULTAS ───────────────────────────────────

export async function countEscenarios(q, estado, exclArch, pestelCsv, sectorCsv) {
  const [results] = await db.query('CALL radar_countEscenarios(?, ?, ?, ?, ?)', [
    q || null, estado || null, exclArch ? 1 : 0, pestelCsv || null, sectorCsv || null,
  ]);
  return Number(results[0][0].total);
}

export async function listEscenarios(q, estado, exclArch, pestelCsv, sectorCsv, limit, offset) {
  const [results] = await db.query('CALL radar_listEscenarios(?, ?, ?, ?, ?, ?, ?)', [
    q || null, estado || null, exclArch ? 1 : 0, pestelCsv || null, sectorCsv || null, limit, offset,
  ]);
  return results[0];
}

export async function getEscenarioEstado(uuid) {
  const [[row]] = await db.query('SELECT id_escenario FROM escenario WHERE id_escenario = ?', [uuid]);
  return row || null;
}

export async function getEscenarioDetalle(uuid) {
  const [results] = await db.query('CALL radar_getEscenarioDetalle(?)', [uuid]);
  const row = results[0]?.[0];
  if (!row) return null;
  return {
    row,
    pestels:  results[1],
    sectors:  results[2],
    senRel:   results[3],
    tendRel:  results[4],
  };
}

// ── ESCENARIOS — ESCRITURAS ──────────────────────────────────

export async function updateEscenarioEstado(uuid, nuevoEstado) {
  await db.query('CALL radar_updateEscenarioEstado(?, ?)', [uuid, nuevoEstado]);
}

export async function createEscenario(newId, data, usuarioId) {
  const { tituloFin, nombreFin, descCorta, descLarga, razonCambio, fuente, urlFuenteStored,
          imagenUrl, videoUrl, horizonte, autor, idEstado, pestelsToInsert, sids, senIds, tids } = data;
  await db.query('CALL radar_createEscenario(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFin, nombreFin, descCorta, descLarga, razonCambio,
    fuente, urlFuenteStored, imagenUrl || null, videoUrl || null,
    horizonte || null, autor || null, idEstado, usuarioId,
    JSON.stringify(pestelsToInsert || []),
    JSON.stringify(sids || []),
    JSON.stringify(senIds || []),
    JSON.stringify(tids || []),
  ]);
}

export async function updateEscenario(uuid, data, usuarioId) {
  const { tituloFin, nombreFin, descCorta, descLarga, razonCambio, fuente, urlFuenteStored,
          imagenUrl, videoUrl, horizonte, autor, idEstado, pids, sids, senIds, tids } = data;
  await db.query('CALL radar_updateEscenario(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    uuid, tituloFin, nombreFin, descCorta, descLarga, razonCambio,
    fuente, urlFuenteStored, imagenUrl || null, videoUrl || null,
    horizonte || null, autor || null, idEstado, usuarioId,
    JSON.stringify(pids || []),
    JSON.stringify(sids || []),
    JSON.stringify(senIds || []),
    JSON.stringify(tids || []),
  ]);
}
