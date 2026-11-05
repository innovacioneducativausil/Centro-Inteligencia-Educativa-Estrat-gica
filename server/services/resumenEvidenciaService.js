import { curricularPrisma } from '../prismaClient.js';
import dbCurricular from '../db_curricular.js';
import {
  recogerEvidenciaRadar,
  recogerEvidenciaEmpleabilidad,
  recogerEvidenciaMercado,
  recogerEvidenciaBenchmarking,
} from './motorImpactoCurricularService.js';
import { getCursosConContexto, matchCursoEvidencia } from './curricularEvidenceMatching.js';

/**
 * Que carreras (malla vigente) ya tienen su mapa de estados analizado y como
 * quedo: cursos analizados sobre el total y cuantos hay de cada estado.
 */
export async function estadoAnalisisCarreras() {
  const [rows] = await dbCurricular.query(
    `SELECT ca.id_carrera, ca.nombre_carrera, mv.id_malla, mv.nombre_version,
            COUNT(DISTINCT cu.id_curso) AS cursos,
            COUNT(DISTINCT CASE WHEN ac.id_analisis IS NOT NULL THEN cu.id_curso END) AS analizados,
            COUNT(DISTINCT CASE WHEN ac.estado_alineacion = 'alineado' THEN cu.id_curso END) AS alineado,
            COUNT(DISTINCT CASE WHEN ac.estado_alineacion = 'riesgo' THEN cu.id_curso END) AS riesgo_parcial,
            COUNT(DISTINCT CASE WHEN ac.estado_alineacion = 'critico' THEN cu.id_curso END) AS obsolescente,
            COUNT(DISTINCT CASE WHEN ac.estado_alineacion = 'oportunidad' THEN cu.id_curso END) AS oportunidad,
            COUNT(DISTINCT CASE WHEN ac.prompt_version = 'v1-general' THEN cu.id_curso END) AS con_evidencia_general
     FROM carrera ca
     JOIN malla_version mv ON mv.id_carrera = ca.id_carrera AND mv.es_vigente = 1
     JOIN curso cu ON cu.id_malla = mv.id_malla
     LEFT JOIN analisis_curso ac ON ac.id_curso = cu.id_curso
     GROUP BY ca.id_carrera, ca.nombre_carrera, mv.id_malla, mv.nombre_version
     ORDER BY analizados DESC, ca.nombre_carrera`
  );
  return rows.map(r => ({
    id_carrera: r.id_carrera,
    carrera: r.nombre_carrera,
    id_malla: r.id_malla,
    malla: r.nombre_version,
    cursos: Number(r.cursos),
    analizados: Number(r.analizados),
    pct_analizado: Number(r.cursos) ? Math.round((Number(r.analizados) / Number(r.cursos)) * 100) : 0,
    alineado: Number(r.alineado),
    riesgo_parcial: Number(r.riesgo_parcial),
    obsolescente: Number(r.obsolescente),
    oportunidad: Number(r.oportunidad),
    con_evidencia_general: Number(r.con_evidencia_general),
  }));
}

/**
 * Cuanta evidencia real tiene cada carrera (en su malla vigente) y, sobre todo,
 * a cuantos cursos les cae al menos una pieza de evidencia con el MISMO cruce
 * que usan los motores. Ese ultimo numero es el que decide cuantos cursos se
 * van a analizar de verdad (los demas se omiten): sirve para elegir las
 * carreras donde el mapa de estados se va a ver mejor.
 */
export async function rankingEvidenciaCarreras() {
  const mallas = await curricularPrisma.malla_version.findMany({
    where: { es_vigente: true },
    include: { carrera: true },
  });

  const filas = [];
  for (const m of mallas) {
    try {
      const [radar, empl, mercado, bench, cursos] = await Promise.all([
        recogerEvidenciaRadar(m.id_carrera),
        recogerEvidenciaEmpleabilidad(m.id_carrera),
        recogerEvidenciaMercado(m.id_carrera),
        recogerEvidenciaBenchmarking(m.id_carrera),
        getCursosConContexto(m.id_malla),
      ]);

      let conEvidencia = 0;
      for (const curso of cursos) {
        const ev = matchCursoEvidencia(curso, { radarEv: radar, mercadoSkills: mercado, benchEv: bench });
        if (ev.radar.length || ev.mercado.length || ev.bench.length) conEvidencia++;
      }

      filas.push({
        id_carrera: m.id_carrera,
        carrera: m.carrera.nombre_carrera,
        id_malla: m.id_malla,
        malla: m.nombre_version,
        cursos: cursos.length,
        cursos_con_evidencia: conEvidencia,
        pct_con_evidencia: cursos.length ? Math.round((conEvidencia / cursos.length) * 100) : 0,
        senales_radar: radar.length,
        habilidades_mercado: mercado.length,
        competencias_benchmark: bench.length,
        egresados_encuestados: Number(empl?.total || 0),
      });
    } catch (err) {
      filas.push({ id_carrera: m.id_carrera, carrera: m.carrera.nombre_carrera, id_malla: m.id_malla, error: err.message });
    }
  }

  return filas.sort((a, b) => (b.cursos_con_evidencia ?? -1) - (a.cursos_con_evidencia ?? -1));
}
