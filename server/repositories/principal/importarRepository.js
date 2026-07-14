import db from '../../db.js';

export async function findOrCreateTopico(nombre) {
  if (!nombre?.trim()) return null;
  const [[row]] = await db.query('SELECT radar_findOrCreateTopico(?) AS id_topico', [nombre.trim()]);
  return row?.id_topico ?? null;
}

export async function findDuplicateTitleOrName(tipo, titulo, nombre) {
  const procMap = {
    senal:     'radar_ensureUniqueSenal',
    tendencia: 'radar_ensureUniqueTendencia',
    escenario: 'radar_ensureUniqueEscenario',
  };
  const proc = procMap[tipo];
  if (!proc) return null;
  const [results] = await db.query(`CALL ${proc}(?, ?, NULL)`, [titulo, nombre]);
  const dup = results[0]?.[0];
  if (!dup) return null;
  return { ...dup, field: 'titulo o nombre' };
}

export async function loadExistingByTopic(topicoNombre) {
  if (!topicoNombre?.trim()) return { senal: [], tendencia: [], escenario: [] };
  const [[topico]] = await db.query(
    'SELECT id_topico FROM topico WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1',
    [topicoNombre.trim()]
  );
  if (!topico) return { senal: [], tendencia: [], escenario: [] };
  const tid = topico.id_topico;
  const [[senRows], [tendRows], [escRows]] = await Promise.all([
    db.query(
      `SELECT id_senal AS id, titulo_senal AS titulo, nombre_senal AS nombre,
              desc_corta_senal AS descCorta, url_fuente AS url
       FROM senal WHERE id_topico = ?`, [tid]
    ),
    db.query(
      `SELECT id_tendencia AS id, titulo_tendencia AS titulo, nombre_tendencia AS nombre,
              desc_corta_tendencia AS descCorta, url_fuente AS url
       FROM tendencia WHERE id_topico = ?`, [tid]
    ),
    db.query(
      `SELECT id_escenario AS id, titulo_escenario AS titulo, nombre_escenario AS nombre,
              desc_corta_escenario AS descCorta, url_fuente AS url
       FROM escenario WHERE id_topico = ?`, [tid]
    ),
  ]);
  return { senal: senRows, tendencia: tendRows, escenario: escRows };
}

export async function updateSenal(idValue, data, topicoId) {
  const { tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteFin,
          urlImagenFin, urlVideoFin, paisOrigenFin, fechaArticuloFin, finalPestelIds, finalSectorIds } = data;
  await db.query('CALL radar_updateSenalImportar(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    idValue, tituloFin, nombreFin, descCortaFin, descLargaFin,
    razonCambioFin, fuenteFin, urlFuenteFin,
    urlImagenFin, urlVideoFin, paisOrigenFin, fechaArticuloFin, topicoId,
    JSON.stringify(finalPestelIds || []),
    JSON.stringify(finalSectorIds || []),
  ]);
}

export async function updateTendencia(idValue, data, topicoId) {
  const { tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteFin,
          urlImagenFin, urlVideoFin, autor, finalPestelIds, finalSectorIds } = data;
  await db.query('CALL radar_updateTendenciaImportar(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    idValue, tituloFin, nombreFin, descCortaFin, descLargaFin,
    razonCambioFin, fuenteFin, urlFuenteFin,
    urlImagenFin, urlVideoFin, autor || null, topicoId,
    JSON.stringify(finalPestelIds || []),
    JSON.stringify(finalSectorIds || []),
  ]);
}

export async function updateEscenario(idValue, data, topicoIdEsc) {
  const { tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteStored,
          urlImagenFin, urlVideoFin, referenciasFin, horizonteTemporal, probInt,
          autor, finalPestelIds, finalSectorIds } = data;
  await db.query('CALL radar_updateEscenarioImportar(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    idValue, tituloFin, nombreFin, descCortaFin, descLargaFin,
    razonCambioFin, fuenteFin, urlFuenteStored,
    urlImagenFin, urlVideoFin, referenciasFin,
    horizonteTemporal?.trim() || null, probInt,
    autor?.trim() || null, topicoIdEsc,
    JSON.stringify(finalPestelIds || []),
    JSON.stringify(finalSectorIds || []),
  ]);
}

export async function insertSenal(newId, data, topicoId, usuarioId) {
  const { tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteFin,
          paisOrigenFin, fechaArticuloFin, urlImagen, urlVideo, finalPestelIds, finalSectorIds } = data;
  await db.query('CALL radar_insertSenalImportar(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFin, nombreFin, descCortaFin, descLargaFin,
    razonCambioFin, fuenteFin, urlFuenteFin,
    urlImagen?.trim() || null, urlVideo?.trim() || null,
    paisOrigenFin, fechaArticuloFin, topicoId, usuarioId,
    JSON.stringify(finalPestelIds || []),
    JSON.stringify(finalSectorIds || []),
  ]);
}

export async function insertTendencia(newId, data, topicoId, usuarioId) {
  const { tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteFin,
          urlImagen, urlVideo, autor, temasRelacionados, finalPestelIds, finalSectorIds } = data;
  await db.query('CALL radar_insertTendenciaImportar(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFin, nombreFin, descCortaFin, descLargaFin,
    razonCambioFin, fuenteFin, urlFuenteFin,
    urlImagen?.trim() || null, urlVideo?.trim() || null,
    autor?.trim() || null, topicoId, usuarioId,
    JSON.stringify(finalPestelIds || []),
    JSON.stringify(finalSectorIds || []),
  ]);
  for (const tema of (temasRelacionados || [])) {
    if (!tema?.trim()) continue;
    const [[temaRow]] = await db.query('SELECT radar_findOrCreateTopico(?) AS id_topico', [tema.trim()]);
    if (temaRow?.id_topico) {
      await db.query('INSERT IGNORE INTO topico_relac_tendencia (id_topico, id_tendencia) VALUES (?, ?)', [temaRow.id_topico, newId]);
    }
  }
}

export async function insertEscenario(newId, data, topicoIdEsc, usuarioId) {
  const { tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteStored,
          urlImagen, urlVideo, referenciasFin, horizonteFin, probInt,
          autor, finalPestelIds, finalSectorIds } = data;
  await db.query('CALL radar_insertEscenarioImportar(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    newId, tituloFin, nombreFin, descCortaFin, descLargaFin,
    razonCambioFin, fuenteFin, urlFuenteStored,
    urlImagen?.trim() || null, urlVideo?.trim() || null,
    referenciasFin, horizonteFin, probInt,
    autor?.trim() || null, topicoIdEsc, usuarioId,
    JSON.stringify(finalPestelIds || []),
    JSON.stringify(finalSectorIds || []),
  ]);
}

export async function lookupTendenciaByName(nombreTend) {
  const [results] = await db.query('CALL radar_lookupTendenciaByName(?)', [nombreTend.trim()]);
  return results[0]?.[0] || null;
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
