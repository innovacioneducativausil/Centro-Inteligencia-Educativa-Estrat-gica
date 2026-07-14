import db from '../../db.js';

export async function getPestelsAndSectors() {
  const [results] = await db.query('CALL radar_getPestelsAndSectors()');
  return { pestels: results[0], sectors: results[1] };
}

export async function findDuplicateTitleOrName(table, idColumn, titleColumn, nameColumn, titulo, nombre) {
  const typeMap = {
    senal:     'senal',
    tendencia: 'tendencia',
    escenario: 'escenario',
  };
  const tipo = typeMap[table] || table;
  const procMap = {
    senal:     'radar_ensureUniqueSenal',
    tendencia: 'radar_ensureUniqueTendencia',
    escenario: 'radar_ensureUniqueEscenario',
  };
  const proc = procMap[tipo];
  if (!proc) return null;
  const [results] = await db.query(`CALL ${proc}(?, ?, NULL)`, [titulo, nombre]);
  return results[0]?.[0] || null;
}

export async function resolveTopico(nombre) {
  if (!nombre?.trim()) return null;
  const [results] = await db.query('CALL radar_resolveTopico(?)', [nombre.trim()]);
  return results[0]?.[0]?.id_topico ?? null;
}

export async function insertSenal(data) {
  const {
    newId, tituloFinal, nombre, descCorta, descLarga,
    fuente, urlFuente, urlImagen, urlVideo,
    paisOrigen, idTopico, fechaArticulo,
    idEstado, usuarioId, fechaPublicacion,
  } = data;
  await db.query('CALL radar_insertSenalImport(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFinal, nombre, descCorta, descLarga,
    fuente, urlFuente, urlImagen, urlVideo,
    paisOrigen, idTopico, fechaArticulo,
    idEstado, usuarioId, fechaPublicacion,
  ]);
}

export async function insertSenalPestel(idSenal, idPestel) {
  await db.query('CALL radar_insertSenalRelaciones(?, ?, NULL, NULL, NULL)', [idSenal, idPestel]);
}

export async function insertSenalSector(idSenal, idSector) {
  await db.query('CALL radar_insertSenalRelaciones(?, NULL, ?, NULL, NULL)', [idSenal, idSector]);
}

export async function insertTendencia(data) {
  const {
    newId, tituloFinal, nombreFinal, descCorta, descLarga,
    fuente, urlFuente, urlImagen, urlVideo,
    paisOrigen, logica, idTopicoPrincipal,
    idEstado, usuarioId, fechaPub,
  } = data;
  await db.query('CALL radar_insertTendenciaImport(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFinal, nombreFinal, descCorta, descLarga,
    fuente, urlFuente, urlImagen, urlVideo,
    paisOrigen, logica, idTopicoPrincipal,
    idEstado, usuarioId, fechaPub,
  ]);
}

export async function insertTendenciaPestel(idTendencia, idPestel) {
  await db.query('CALL radar_insertTendenciaRelaciones(?, ?, NULL, NULL)', [idTendencia, idPestel]);
}

export async function insertTendenciaSector(idTendencia, idSector) {
  await db.query('CALL radar_insertTendenciaRelaciones(?, NULL, ?, NULL)', [idTendencia, idSector]);
}

export async function insertTopicoRelacTendencia(idTopico, idTendencia) {
  await db.query('CALL radar_insertTendenciaRelaciones(?, NULL, NULL, ?)', [idTendencia, idTopico]);
}

export async function insertEscenario(data) {
  const {
    newId, tituloFinal, nombreFinal, descCorta, descLarga,
    fuente, urlFuente, urlImagen, urlVideo,
    horizonte, probabilidad, idTopico,
    idEstado, usuarioId, fechaPub,
  } = data;
  await db.query('CALL radar_insertEscenarioImport(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFinal, nombreFinal, descCorta, descLarga,
    fuente, urlFuente, urlImagen, urlVideo,
    horizonte, probabilidad, idTopico,
    idEstado, usuarioId, fechaPub,
  ]);
}

export async function insertEscenarioPestel(idEscenario, idPestel) {
  await db.query('CALL radar_insertEscenarioRelaciones(?, ?, NULL)', [idEscenario, idPestel]);
}

export async function insertEscenarioSector(idEscenario, idSector) {
  await db.query('CALL radar_insertEscenarioRelaciones(?, NULL, ?)', [idEscenario, idSector]);
}

export async function resolveItem(tipo, nombre) {
  if (!nombre?.trim()) return null;
  const [results] = await db.query('CALL radar_resolveItem(?, ?)', [tipo, nombre.trim()]);
  return results[0]?.[0]?.id ?? null;
}

export async function insertRelacionSenalTendencia(senId, tendId) {
  await db.query('CALL radar_insertRelacionSenalTendencia(?, ?)', [senId, tendId]);
}

export async function insertRelacionSenalEscenario(senId, escId) {
  await db.query('CALL radar_insertRelacionSenalEscenario(?, ?)', [senId, escId]);
}

export async function insertRelacionTendenciaEscenario(tendId, escId) {
  await db.query('CALL radar_insertRelacionTendenciaEscenario(?, ?)', [tendId, escId]);
}
