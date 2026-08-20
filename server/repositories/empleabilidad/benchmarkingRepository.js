import db from '../../db_empl.js';
import dbCurricular from '../../db_curricular.js';

export async function getUniversidades(activo, tipo) {
  const [results] = await db.query('CALL empl_getUniversidades(?, ?)', [
    activo ?? null, tipo || null,
  ]);
  return results[0];
}

export async function createUniversidad({ nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web }) {
  const [results] = await db.query('CALL empl_createUniversidad(?, ?, ?, ?, ?)', [
    nombre_universidad, pais, ciudad ?? null, tipo_benchmark, sitio_web ?? null,
  ]);
  return results[0][0].id_universidad_benchmark;
}

export async function updateUniversidad(id, { nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web }) {
  await db.query('CALL empl_updateUniversidad(?, ?, ?, ?, ?, ?)', [
    id, nombre_universidad ?? null, pais ?? null, ciudad ?? null, tipo_benchmark ?? null, sitio_web ?? null,
  ]);
}

export async function deleteUniversidad(id) {
  await db.query('CALL empl_deleteUniversidad(?)', [id]);
}

export async function getProgramas(idCarrera, idUniv, tipo) {
  const [results] = await db.query('CALL empl_getProgramas(?, ?, ?)', [
    idCarrera || null, idUniv || null, tipo || null,
  ]);
  return results[0];
}

export async function getPrograma(id) {
  const [results] = await db.query('CALL empl_getPrograma(?)', [id]);
  const prog = results[0]?.[0];
  if (!prog) return null;
  return { programa: prog, competencias: results[1], cursos: results[2], fuentes: results[3] };
}

export async function createPrograma({ id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, modalidad, duracion }) {
  const [results] = await db.query('CALL empl_createPrograma(?, ?, ?, ?, ?, ?)', [
    id_universidad_benchmark, nombre_programa, url_programa ?? null,
    carrera_equivalente_id ?? null, modalidad ?? null, duracion ?? null,
  ]);
  return results[0][0].id_programa_benchmark;
}

export async function deleteProgramaIfEmpty(id) {
  const [[counts]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM competencia_benchmark WHERE id_programa_benchmark = ?) AS competencias,
       (SELECT COUNT(*) FROM curso_benchmark WHERE id_programa_benchmark = ?) AS cursos,
       (SELECT COUNT(*) FROM benchmark_source WHERE id_programa_benchmark = ? AND estado = 'validado') AS fuentesValidadas`,
    [id, id, id]
  );
  if (counts.competencias || counts.cursos || counts.fuentesValidadas) {
    throw new Error('El programa tiene datos asociados (fuentes validadas, cursos o competencias); no se puede eliminar.');
  }
  await db.query('DELETE FROM benchmark_source_candidate WHERE id_programa_benchmark = ?', [id]);
  await db.query('DELETE FROM benchmark_source WHERE id_programa_benchmark = ?', [id]);
  const [result] = await db.query('DELETE FROM programa_benchmark WHERE id_programa_benchmark = ?', [id]);
  return result.affectedRows > 0;
}

export async function getCarrerasCurriculares() {
  const [rows] = await dbCurricular.query(
    'SELECT ca.id_carrera, ca.nombre_carrera FROM carrera ca ORDER BY ca.nombre_carrera'
  );
  return rows;
}

export async function getCarrerasCurricularesWithFacultad() {
  const [rows] = await dbCurricular.query(
    `SELECT ca.id_carrera, ca.nombre_carrera, f.nombre_facultad
     FROM carrera ca
     JOIN facultad f ON f.id_facultad = ca.id_facultad
     ORDER BY f.nombre_facultad, ca.nombre_carrera`
  );
  return rows;
}

export async function getCarreraByIdCurricular(idCarrera) {
  const [[row]] = await dbCurricular.query(
    'SELECT nombre_carrera FROM carrera WHERE id_carrera = ? LIMIT 1', [idCarrera]
  );
  return row || null;
}

export async function getCoberturaStats() {
  const [results] = await db.query('CALL empl_getCoberturaStats()');
  return results[0];
}

export async function updateTipoBenchmarkInternacional() {
  await db.query('CALL empl_updateTipoBenchmarkInternacional()');
}

export async function findUniversidadByNombreTipo(nombre, tipo) {
  const [results] = await db.query('CALL empl_findUniversidadByNombreTipo(?, ?)', [nombre, tipo]);
  return results[0]?.[0]?.id_universidad_benchmark || null;
}

export async function insertUniversidad({ nombre, pais, ciudad, tipo, web }) {
  const [results] = await db.query('CALL empl_insertUniversidad(?, ?, ?, ?, ?)', [nombre, pais, ciudad, tipo, web]);
  return results[0][0].id_universidad_benchmark;
}

export async function findProgramaByUnivCarreraNombre(idUniv, idCarrera, nombrePrograma) {
  const [results] = await db.query('CALL empl_findProgramaByUnivCarreraNombre(?, ?, ?)', [
    idUniv, idCarrera, nombrePrograma,
  ]);
  return results[0]?.[0]?.id_programa_benchmark || null;
}

export async function insertProgramaBenchmark({ idUniv, nombrePrograma, idCarrera }) {
  const [results] = await db.query('CALL empl_insertProgramaBenchmark(?, ?, ?)', [
    idUniv, nombrePrograma, idCarrera,
  ]);
  return results[0][0].id_programa_benchmark;
}

export async function upsertBenchmarkSource({ idProg, tipoFuente, titulo, url, estado, esFilasPrincipal, evidenciaResumen, observaciones }) {
  const [results] = await db.query('CALL empl_upsertBenchmarkSource(?, ?, ?, ?, ?, ?, ?, ?)', [
    idProg, tipoFuente, titulo, url, estado, esFilasPrincipal ? 1 : 0,
    evidenciaResumen ?? null, observaciones ?? null,
  ]);
  return { insertId: results[0][0].id_benchmark_source };
}

export async function demoteOtherBenchmarkSources(idProg, keepUrl) {
  await db.query(
    `UPDATE benchmark_source SET es_fuente_principal = 0
     WHERE id_programa_benchmark = ? AND url <> ? AND es_fuente_principal = 1`,
    [idProg, keepUrl]
  );
}

export async function updateProgramaUrlCurado(idProg, url, observaciones) {
  await db.query('CALL empl_updateProgramaUrlCurado(?, ?, ?)', [idProg, url, observaciones]);
}

export async function insertBenchmarkSourceIgnore({ idProg, tipoFuente, titulo, url, observaciones }) {
  await db.query('CALL empl_insertBenchmarkSourceIgnore(?, ?, ?, ?, ?)', [
    idProg, tipoFuente, titulo, url, observaciones,
  ]);
}

export async function getFuentes(idPrograma) {
  const [results] = await db.query('CALL empl_getFuentes(?)', [idPrograma]);
  return results[0];
}

export async function updateFuente(id, { estado, titulo, url, tipo, observaciones }) {
  await db.query('CALL empl_updateFuente(?, ?, ?, ?, ?, ?)', [
    id, estado || null, titulo || null, url || null, tipo || null, observaciones || null,
  ]);
}

export async function getCandidatos(idPrograma, incluirHistorial) {
  const [results] = await db.query('CALL empl_getCandidatos(?, ?)', [
    idPrograma, incluirHistorial ? 1 : 0,
  ]);
  return results[0];
}

export async function getCandidatoWithPrograma(id) {
  const [results] = await db.query('CALL empl_getCandidatoWithPrograma(?)', [id]);
  return results[0]?.[0] || null;
}

export async function demoteCandidatosAprobados(idPrograma, excludeId) {
  await db.query('CALL empl_demoteCandidatosAprobados(?, ?)', [idPrograma, excludeId]);
}

export async function approveCandidato(id, usuario) {
  await db.query('CALL empl_approveCandidato(?, ?)', [id, usuario]);
}

export async function discardCandidato(id, motivo, usuario) {
  await db.query('CALL empl_discardCandidato(?, ?, ?)', [id, motivo || null, usuario]);
}

export async function updateProgramaAprobado(idPrograma, url, score) {
  await db.query('CALL empl_updateProgramaAprobado(?, ?, ?)', [idPrograma, url, score]);
}

export async function upsertEquivalencia(idPrograma, { nombre_oficial_sugerido, aliases, nivel_equivalencia, observaciones }) {
  await db.query('CALL empl_upsertEquivalencia(?, ?, ?, ?, ?)', [
    idPrograma,
    nombre_oficial_sugerido || null,
    JSON.stringify(Array.isArray(aliases) ? aliases : []),
    nivel_equivalencia,
    observaciones || null,
  ]);
}

export async function getCompararData(idCarrera) {
  const [results] = await db.query('CALL empl_getCompararData(?)', [idCarrera]);
  return { competencias: results[0], cursos: results[1] };
}

export async function getCompararByTipo(idCarrera, tipoBenchmark) {
  const [results] = await db.query('CALL empl_getCompararByTipo(?, ?)', [idCarrera, tipoBenchmark]);
  return { competencias: results[0], programas: results[1] };
}

export async function getFuentesByProgramas(ids) {
  if (!ids.length) return [];
  const [results] = await db.query('CALL empl_getFuentesByProgramas(?)', [JSON.stringify(ids)]);
  return results[0];
}

export async function getCandidatosByProgramas(ids) {
  if (!ids.length) return [];
  const [results] = await db.query('CALL empl_getCandidatosByProgramas(?)', [JSON.stringify(ids)]);
  return results[0];
}

export async function getCursosByProgramas(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id_curso_benchmark, id_programa_benchmark, nombre_curso, ciclo, area_formacion, descripcion_curso, fuente_url,
            id_curso_usil_match, match_confianza, match_metodo
     FROM curso_benchmark
     WHERE id_programa_benchmark IN (${placeholders})
     ORDER BY
       CASE WHEN ciclo REGEXP '^[0-9]+$' THEN 0 WHEN ciclo IS NULL OR ciclo = '' THEN 2 ELSE 1 END,
       CAST(NULLIF(ciclo, '') AS UNSIGNED),
       ciclo,
       nombre_curso`,
    ids
  );
  return rows;
}
