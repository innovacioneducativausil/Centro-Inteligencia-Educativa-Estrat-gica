import db_empl from '../../db_empl.js';

export async function setCandidatosDuplicado(idPrograma) {
  await db_empl.query('CALL empl_setCandidatosDuplicado(?)', [idPrograma]);
}

export async function upsertCuratedSource(idPrograma, source) {
  await db_empl.query('CALL empl_upsertCuratedSource(?, ?, ?, ?, ?)', [
    idPrograma,
    source.tipoFuente,
    source.titulo,
    source.url,
    'Fuente curada desde mapa base de benchmarking. Requiere validacion humana.',
  ]);
}

export async function upsertCuratedCandidate(idPrograma, source) {
  await db_empl.query('CALL empl_upsertCuratedCandidate(?, ?, ?, ?, ?, ?)', [
    idPrograma,
    source.url,
    source.titulo,
    source.tipoFuente,
    JSON.stringify({ curada: 100, carrera: 0, curricular: 0, url: 0 }),
    'Coincidencia exacta en mapa base de fuentes oficiales.',
  ]);
}

export async function updateProgramaUrlAndObservaciones(idPrograma, url, observaciones) {
  await db_empl.query('CALL empl_updateProgramaUrlAndObservaciones(?, ?, ?)', [idPrograma, url, observaciones]);
}

export async function upsertCandidate(idPrograma, item, domain) {
  await db_empl.query('CALL empl_upsertCandidate(?, ?, ?, ?, ?, ?, ?, ?)', [
    idPrograma,
    item.url,
    item.title,
    item.snippet,
    item.tipo,
    item.score,
    JSON.stringify(item.detail),
    `Candidato oficial en ${domain}. Tipo detectado: ${item.tipo}. Score ${item.score}.`,
  ]);
}

export async function updateProgramaObservaciones(idPrograma, observaciones) {
  await db_empl.query('CALL empl_updateProgramaObservaciones(?, ?)', [idPrograma, observaciones]);
}

export async function findExistingBenchmarkSource(idPrograma, url) {
  const [results] = await db_empl.query('CALL empl_findExistingBenchmarkSource(?, ?)', [idPrograma, url]);
  return results[0]?.[0]?.id_benchmark_source || null;
}

export async function insertBenchmarkSource(idPrograma, tipoFuente, title, url, observaciones) {
  const [results] = await db_empl.query('CALL empl_insertBenchmarkSource(?, ?, ?, ?, ?)', [
    idPrograma, tipoFuente, title || `Fuente oficial ${tipoFuente}`, url, observaciones,
  ]);
  return results[0]?.[0]?.id_benchmark_source || null;
}

export async function getCreatedBenchmarkSource(idPrograma, url) {
  const [results] = await db_empl.query('CALL empl_getCreatedBenchmarkSource(?, ?)', [idPrograma, url]);
  return results[0]?.[0]?.id_benchmark_source || null;
}

export async function insertSourceSnapshot({ idBenchmarkSource, idPrograma, url, urlFinal, title, safeText, hash, parser, estadoParseo, cursosDetectados, observaciones }) {
  const [results] = await db_empl.query('CALL empl_insertSourceSnapshot(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    idBenchmarkSource || null,
    idPrograma,
    url,
    urlFinal || url,
    title || null,
    safeText,
    hash,
    parser || null,
    estadoParseo || 'sin_parsear',
    cursosDetectados || 0,
    observaciones || null,
  ]);
  return results[0][0].id_snapshot;
}

export async function insertParseLog({ idPrograma, idSnapshot, parser, estado, cursosDetectados, detalle }) {
  await db_empl.query('CALL empl_insertParseLog(?, ?, ?, ?, ?, ?)', [
    idPrograma,
    idSnapshot || null,
    parser || 'sin_parser',
    estado || 'requiere_revision',
    cursosDetectados || 0,
    detalle || null,
  ]);
}

export async function replaceBenchmarkCourses(idPrograma, url, courses) {
  await db_empl.query('CALL empl_deleteCursosBenchmark(?)', [idPrograma]);
  for (const course of courses) {
    await db_empl.query('CALL empl_insertCursoBenchmark(?, ?, ?, ?, ?, ?)', [
      idPrograma,
      course.nombreCurso,
      course.ciclo || null,
      'malla_externa',
      course.evidencia || null,
      url,
    ]);
  }
}

export async function updateBenchmarkSourceAfterExtraction(idBenchmarkSource, { estado, evidenciaResumen, snapshotHash }) {
  await db_empl.query('CALL empl_updateBenchmarkSourceAfterExtraction(?, ?, ?, ?)', [
    idBenchmarkSource, estado, evidenciaResumen, snapshotHash,
  ]);
}

export async function updateProgramaAfterExtraction(idPrograma, { textoOriginal, url, observaciones }) {
  await db_empl.query('CALL empl_updateProgramaAfterExtraction(?, ?, ?, ?)', [
    idPrograma, textoOriginal, url, observaciones,
  ]);
}

export async function setScrapingStatus(idPrograma, estado, observaciones) {
  await db_empl.query('CALL empl_setScrapingStatus(?, ?, ?)', [idPrograma, estado, observaciones]);
}

export async function getProgramaUrl(idPrograma) {
  const [results] = await db_empl.query('CALL empl_getProgramaUrl(?)', [idPrograma]);
  return results[0]?.[0] || null;
}

export async function getProgramaWithEquivalencia(idPrograma) {
  const [results] = await db_empl.query('CALL empl_getProgramaWithEquivalencia(?)', [idPrograma]);
  return results[0]?.[0] || null;
}
