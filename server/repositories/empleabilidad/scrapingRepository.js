import db_empl from '../../db_empl.js';

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const UNIVERSITY_SOURCE_PATTERNS = [
  { names: ['UNIVERSIDAD PERUANA DE CIENCIAS APLICADAS'], patterns: [/upc\.edu\.pe/i, /upc-cdn\.b-cdn\.net/i, /\bUPC\b/i] },
  { names: ['PONTIFICIA UNIVERSIDAD CATOLICA DEL PERU'], patterns: [/pucp\.edu\.pe/i, /\bPUCP\b/i, /catolica del peru/i] },
  { names: ['UNIVERSIDAD DE LIMA'], patterns: [/ulima\.edu\.pe/i, /universidad de lima/i, /\bULIMA\b/i] },
  { names: ['UNIVERSIDAD DEL PACIFICO'], patterns: [/\/\/(?:www\.)?up\.edu\.pe/i, /universidad del pacifico/i] },
  { names: ['UNIVERSIDAD ESAN'], patterns: [/ue\.edu\.pe/i, /esan/i] },
  { names: ['UNIVERSIDAD DE PIURA'], patterns: [/udep\.edu\.pe/i, /universidad de piura/i] },
  { names: ['UNIVERSIDAD DE INGENIERIA Y TECNOLOGIA'], patterns: [/utec\.edu\.pe/i, /www1\.utec\.edu\.pe/i, /\bUTEC\b/i] },
  { names: ['UNIVERSIDAD PRIVADA DEL NORTE'], patterns: [/upn\.edu\.pe/i, /universidad privada del norte/i, /\bUPN\b/i] },
  { names: ['UNIVERSIDAD TECNOLOGICA DEL PERU'], patterns: [/utp\.edu\.pe/i, /universidad tecnologica del peru/i, /\bUTP\b/i] },
  { names: ['UNIVERSIDAD CIENTIFICA DEL SUR'], patterns: [/cientifica\.edu\.pe/i, /universidad cientifica/i] },
  { names: ['UNIVERSIDAD PERUANA CAYETANO HEREDIA'], patterns: [/cayetano\.edu\.pe/i, /upch-repo/i, /cayetano heredia/i] },
  { names: ['UNIVERSIDAD DE SAN MARTIN DE PORRES'], patterns: [/usmp\.edu\.pe/i, /san martin de porres/i, /\bUSMP\b/i] },
  { names: ['UNIVERSIDAD NACIONAL MAYOR DE SAN MARCOS'], patterns: [/unmsm\.edu\.pe/i, /san marcos/i, /\bUNMSM\b/i] },
  { names: ['UNIVERSIDAD NACIONAL DE INGENIERIA'], patterns: [/uni\.edu\.pe/i, /acreditacion\.uni\.edu\.pe/i, /\bUNI\b/i] },
  { names: ['UNIVERSIDAD RICARDO PALMA'], patterns: [/urp\.edu\.pe/i, /ricardo palma/i] },
  { names: ['UNIVERSIDAD PRIVADA DE TACNA'], patterns: [/upt\.edu\.pe/i, /privada de tacna/i] },
  { names: ['UNIVERSIDAD NACIONAL SAN LUIS GONZAGA'], patterns: [/unica\.edu\.pe/i, /san luis gonzaga/i] },
];

function sourceMatchesUniversity(source, universityName = '') {
  const normalized = normalizeName(universityName);
  const rule = UNIVERSITY_SOURCE_PATTERNS.find(item =>
    item.names.some(name => normalized.includes(name))
  );
  if (!rule) return true;
  const haystack = `${source?.source_url || source?.url || ''} ${source?.titulo || ''}`;
  return rule.patterns.some(pattern => pattern.test(haystack));
}

function sourcePriority(source) {
  const typeScore = {
    malla_curricular: 50,
    plan_estudios: 45,
    brochure_pdf: 40,
    pagina_programa: 30,
  }[source.tipo_fuente] || 10;
  const stateScore = {
    validado: 20,
    extraido: 15,
    pendiente_extraccion: 10,
    pendiente_validacion: 8,
    registrado: 5,
  }[source.estado] || 0;
  return Number(source.es_fuente_principal || 0) * 100 + typeScore + stateScore;
}

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
  const [rows] = await db_empl.query(
    `SELECT id_benchmark_source
     FROM benchmark_source
     WHERE id_programa_benchmark = ?
       AND url COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND activo = 1
     LIMIT 1`,
    [idPrograma, url]
  );
  return rows[0]?.id_benchmark_source || null;
}

export async function insertBenchmarkSource(idPrograma, tipoFuente, title, url, observaciones) {
  const [results] = await db_empl.query('CALL empl_insertBenchmarkSource(?, ?, ?, ?, ?)', [
    idPrograma, tipoFuente, title || `Fuente oficial ${tipoFuente}`, url, observaciones,
  ]);
  return results[0]?.[0]?.id_benchmark_source || null;
}

export async function getCreatedBenchmarkSource(idPrograma, url) {
  const [rows] = await db_empl.query(
    `SELECT id_benchmark_source
     FROM benchmark_source
     WHERE id_programa_benchmark = ?
       AND url COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
     ORDER BY id_benchmark_source DESC
     LIMIT 1`,
    [idPrograma, url]
  );
  return rows[0]?.id_benchmark_source || null;
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
  const [rows] = await db_empl.query(
    `SELECT pb.id_programa_benchmark,
            pb.url_programa,
            ub.nombre_universidad,
            bs.id_benchmark_source,
            bs.url AS source_url,
            bs.tipo_fuente,
            bs.titulo,
            bs.estado,
            bs.es_fuente_principal
     FROM programa_benchmark pb
     JOIN universidad_benchmark ub
       ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
     LEFT JOIN benchmark_source bs
       ON bs.id_programa_benchmark = pb.id_programa_benchmark
      AND bs.activo = 1
     WHERE pb.id_programa_benchmark = ?`,
    [idPrograma]
  );
  if (!rows.length) return null;
  const program = rows[0];
  const sources = rows.filter(row => row.source_url);
  const selected = sources
    .filter(source => sourceMatchesUniversity(source, program.nombre_universidad))
    .sort((a, b) => sourcePriority(b) - sourcePriority(a))[0];
  return {
    id_programa_benchmark: program.id_programa_benchmark,
    url_programa: selected?.source_url || program.url_programa,
  };
}

export async function getProgramaWithEquivalencia(idPrograma) {
  const [rows] = await db_empl.query(
    `SELECT pb.id_programa_benchmark,
            pb.nombre_programa,
            pb.url_programa,
            ub.nombre_universidad,
            ub.sitio_web,
            ub.tipo_benchmark,
            bpe.nombre_oficial_sugerido,
            bpe.aliases_json
     FROM programa_benchmark pb
     JOIN universidad_benchmark ub
       ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
     LEFT JOIN benchmark_program_equivalence bpe
       ON bpe.id_programa_benchmark = pb.id_programa_benchmark
     WHERE pb.id_programa_benchmark = ?
     LIMIT 1`,
    [idPrograma]
  );
  return rows[0] || null;
}
