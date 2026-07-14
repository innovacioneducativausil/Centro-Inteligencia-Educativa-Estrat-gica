import db_empl from '../../db_empl.js';

export async function getProgramaForNormalizacion(idPrograma) {
  const [results] = await db_empl.query('CALL empl_getProgramaForNormalizacion(?)', [idPrograma]);
  return results[0]?.[0] || null;
}

export async function getCursosBenchmark(idPrograma) {
  const [results] = await db_empl.query('CALL empl_getCursosBenchmark(?)', [idPrograma]);
  return results[0];
}

export async function executeNormalizationTransaction(idPrograma, { competencias, habilidadesTec, habilidadesBla, cursos, textoCurricular, prog, parsedResult }) {
  const competenciasJson = [
    ...competencias.filter(c => c && c !== 'no_identificado').map(c => ({ nombre: String(c).substring(0, 299), tipo: 'tecnica' })),
    ...habilidadesTec.filter(h => h && h !== 'no_identificado').map(h => ({ nombre: String(h).substring(0, 299), tipo: 'tecnica' })),
    ...habilidadesBla.filter(h => h && h !== 'no_identificado').map(h => ({ nombre: String(h).substring(0, 299), tipo: 'blanda' })),
  ];

  const areas = Array.isArray(parsedResult.areas_tematicas) ? parsedResult.areas_tematicas : [];
  const competenciasIA = Array.isArray(parsedResult.competencias) ? parsedResult.competencias : [];
  const tecnologias = Array.isArray(parsedResult.tecnologias) ? parsedResult.tecnologias : [];

  const cursosJson = cursos.map(curso => ({
    nombre:            String(curso.nombre).substring(0, 299),
    ciclo:             curso.ciclo || null,
    area:              curso.origen === 'parser' ? 'malla_externa' : (areas[0] ?? 'sugerido_ia'),
    evidencia:         curso.evidencia || null,
    competencias_json: JSON.stringify(competenciasIA.filter(c => c !== 'no_identificado')),
    tecnologias_json:  JSON.stringify(tecnologias.filter(t => t !== 'no_identificado')),
  }));

  const perfil = parsedResult.perfil_egreso_resumen !== 'no_identificado'
    ? parsedResult.perfil_egreso_resumen
    : prog.fuente_texto_original?.substring(0, 2000);

  const [results] = await db_empl.query('CALL empl_executeNormalizacion(?, ?, ?, ?, ?, ?, ?)', [
    idPrograma,
    JSON.stringify(competenciasJson),
    JSON.stringify(cursosJson),
    textoCurricular || null,
    prog.fuente_texto_original || null,
    perfil || null,
    prog.url_programa || null,
  ]);
  const conteo = results[0]?.[0] || { cursos: 0, competencias: 0 };
  return { cursos: Number(conteo.cursos), competencias: Number(conteo.competencias) };
}
