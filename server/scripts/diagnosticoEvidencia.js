/**
 * Diagnostico rapido: para una carrera dada, muestra cuanta evidencia real
 * hay disponible en Radar/Mercado/Benchmarking, y cuantos cursos de su malla
 * tienen sumilla/competencias cargadas -- para saber si "omitidos" alto es
 * por falta real de datos fuente o por un problema del matching.
 *
 * Uso: node scripts/diagnosticoEvidencia.js "Administracion en Turismo"
 */
import { curricularPrisma } from '../prismaClient.js';
import {
  recogerEvidenciaRadar,
  recogerEvidenciaMercado,
  recogerEvidenciaBenchmarking,
} from '../services/motorImpactoCurricularService.js';
import { getCursosConContexto, matchCursoEvidencia } from '../services/curricularEvidenceMatching.js';

const nombreCarrera = process.argv[2];

async function main() {
  const carrera = await curricularPrisma.carrera.findFirst({ where: { nombre_carrera: nombreCarrera } });
  if (!carrera) { console.log('Carrera no encontrada:', nombreCarrera); process.exit(1); }

  const malla = await curricularPrisma.malla_version.findFirst({
    where: { id_carrera: carrera.id_carrera, es_vigente: true },
  });
  console.log(`Carrera: ${carrera.nombre_carrera} (id=${carrera.id_carrera}), malla=${malla?.id_malla}`);

  const [radarEv, mercadoSkills, benchEv] = await Promise.all([
    recogerEvidenciaRadar(carrera.id_carrera),
    recogerEvidenciaMercado(carrera.id_carrera),
    recogerEvidenciaBenchmarking(carrera.id_carrera),
  ]);

  console.log(`\nEVIDENCIA DISPONIBLE (antes de matching por curso):`);
  console.log(`  Radar: ${radarEv.length} señales/tendencias`);
  console.log(`  Mercado: ${mercadoSkills.length} habilidades`);
  console.log(`  Benchmarking: ${benchEv.length} competencias`);

  if (radarEv.length) console.log(`  Radar ejemplos: ${radarEv.slice(0,3).map(r=>r.titulo).join(' | ')}`);
  if (mercadoSkills.length) console.log(`  Mercado ejemplos: ${mercadoSkills.slice(0,5).join(', ')}`);
  if (benchEv.length) console.log(`  Bench ejemplos: ${benchEv.slice(0,5).map(b=>b.nombre_competencia).join(', ')}`);

  const cursos = await getCursosConContexto(malla.id_malla);
  console.log(`\nCURSOS: ${cursos.length} total`);
  const conSumilla = cursos.filter(c => c.sumilla && c.sumilla.trim().length > 10).length;
  const conCompetencias = cursos.filter(c => c.competencias?.length).length;
  console.log(`  Con sumilla: ${conSumilla}/${cursos.length}`);
  console.log(`  Con competencias declaradas: ${conCompetencias}/${cursos.length}`);

  let conEvidencia = 0, sinEvidencia = 0;
  const sinEvidenciaNombres = [];
  for (const curso of cursos) {
    const ev = matchCursoEvidencia(curso, { radarEv, mercadoSkills, benchEv });
    const total = ev.radar.length + ev.mercado.length + ev.bench.length;
    if (total > 0) conEvidencia++;
    else { sinEvidencia++; sinEvidenciaNombres.push(curso.nombre_curso); }
  }
  console.log(`\nMATCHING POR CURSO:`);
  console.log(`  Con evidencia (>=1 match): ${conEvidencia}`);
  console.log(`  Sin evidencia (0 match): ${sinEvidencia}`);
  console.log(`\nPrimeros 15 cursos SIN evidencia:`);
  sinEvidenciaNombres.slice(0, 15).forEach(n => console.log(`  - ${n}`));

  await curricularPrisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err);
  await curricularPrisma.$disconnect();
  process.exit(1);
});
