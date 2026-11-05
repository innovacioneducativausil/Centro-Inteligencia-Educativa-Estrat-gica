import { curricularPrisma } from '../prismaClient.js';
import {
  recogerEvidenciaRadar,
  recogerEvidenciaEmpleabilidad,
  recogerEvidenciaMercado,
  recogerEvidenciaBenchmarking,
} from './motorImpactoCurricularService.js';
import { getCursosConContexto, matchCursoEvidencia } from './curricularEvidenceMatching.js';

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
