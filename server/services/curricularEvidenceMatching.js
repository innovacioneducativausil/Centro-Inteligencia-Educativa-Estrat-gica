import dbCurricular from '../db_curricular.js';

function keywordsOf(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/i)
    .filter(w => w.length > 4);
}

function overlaps(a, b) {
  const setB = new Set(b);
  return a.some(w => setB.has(w));
}

/**
 * El curso se compara contra la evidencia usando TODO lo real que tenemos de
 * él (nombre + sumilla + competencias declaradas), no solo el nombre — el
 * nombre por sí solo es demasiado angosto (p.ej. "Coaching Educativo" no
 * comparte palabras con una señal sobre "mentoría docente", pero su sumilla
 * probablemente sí). Nada de esto es inventado: son campos reales ya
 * cargados desde el Excel de la malla. Compartido entre el motor de Visión
 * 360 (analisisCurricularService) y el de Plan de acción (motorImpactoCurricularService).
 */
function textoCursoParaMatching(curso) {
  return [
    curso.nombre_curso,
    curso.sumilla,
    ...(curso.competencias || []).map(c => c.nombre_competencia),
  ].filter(Boolean).join(' ');
}

function matchCursoEvidencia(curso, { radarEv, mercadoSkills, benchEv }) {
  const cursoKw = keywordsOf(textoCursoParaMatching(curso));

  const radar = radarEv.filter(ev => overlaps(cursoKw, keywordsOf(`${ev.titulo} ${ev.descripcion || ''}`)));
  const mercado = mercadoSkills.filter(s => overlaps(cursoKw, keywordsOf(s)));
  const bench = benchEv.filter(b => overlaps(cursoKw, keywordsOf(b.nombre_competencia)));

  return { radar, mercado, bench };
}

/** Cursos de una malla con su sumilla y competencias declaradas (para armar prompts / matching). */
async function getCursosConContexto(idMallaVersion) {
  const [cursos] = await dbCurricular.query(
    `SELECT c.id_curso, c.nombre_curso, c.numero_ciclo, c.creditos, c.tipo_curso,
            cs.sumilla,
            ac.score_alineacion AS analisis_score, ac.estado_alineacion AS analisis_estado,
            ac.brechas_detectadas AS analisis_brechas
     FROM curso c
     LEFT JOIN curso_sumilla cs ON cs.id_curso = c.id_curso
     LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
     WHERE c.id_malla = ?
     ORDER BY c.numero_ciclo, c.nombre_curso`,
    [idMallaVersion]
  );
  if (!cursos.length) return [];

  const [competencias] = await dbCurricular.query(
    `SELECT cc.id_curso, comp.nombre_competencia
     FROM curso_competencia cc
     JOIN competencia_curricular comp ON comp.id_competencia = cc.id_competencia
     WHERE cc.id_curso IN (${cursos.map(() => '?').join(',')})`,
    cursos.map(c => c.id_curso)
  ).catch(() => [[]]);

  const compByCurso = new Map();
  for (const row of competencias) {
    if (!compByCurso.has(row.id_curso)) compByCurso.set(row.id_curso, []);
    compByCurso.get(row.id_curso).push(row);
  }

  return cursos.map(c => ({ ...c, competencias: compByCurso.get(c.id_curso) || [] }));
}

export { keywordsOf, overlaps, textoCursoParaMatching, matchCursoEvidencia, getCursosConContexto };
