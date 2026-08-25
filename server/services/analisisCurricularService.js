import dbCurricular from '../db_curricular.js';
import logger from '../logger.js';
import {
  recogerEvidenciaRadar,
  recogerEvidenciaEmpleabilidad,
  recogerEvidenciaMercado,
  recogerEvidenciaBenchmarking,
} from './motorImpactoCurricularService.js';
import { callLLM, safeParseJson, isRealText } from './llmProviderService.js';
import { matchCursoEvidencia, getCursosConContexto } from './curricularEvidenceMatching.js';

const MODELO_ID  = 'qwen2.5-7b/llama-3.3-70b';
const PROMPT_VERSION = 'v1';

const ESTADOS_VALIDOS = ['alineado', 'riesgo', 'critico', 'oportunidad'];
const IMPACTOS_VALIDOS = ['ALTO', 'MEDIO', 'BAJO'];
const URGENCIAS_VALIDAS = ['CRÍTICA', 'ALTA', 'MEDIA', 'BAJA'];

const SYSTEM_PROMPT = `Eres un especialista en diseño y pertinencia curricular universitaria.
Analizas UN curso de una malla curricular contra evidencia real (señales de mercado laboral,
tendencias del sector, empleabilidad de egresados y benchmarking contra otras universidades).
REGLA CRÍTICA: Solo puedes razonar sobre la evidencia entregada en el prompt. Nunca inventes
datos, cifras, tecnologías ni fuentes que no estén en la evidencia.
Si la evidencia es débil o insuficiente, dilo explícitamente y deja los arrays vacíos en vez de
inventar contenido — pero igual elige el estado_alineacion que mejor describa lo que SÍ hay
(no asumas "riesgo" por defecto; si la evidencia muestra una tendencia emergente sobre un curso
ya alineado, es "oportunidad", no "riesgo").
Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown, sin texto adicional.`;

function buildPrompt(curso, evidencia, emplEv) {
  const lines = [
    `Curso: "${curso.nombre_curso}" (Ciclo ${curso.numero_ciclo}, ${curso.creditos ?? '?'} créditos, tipo: ${curso.tipo_curso || 'Obligatorio'}).`,
  ];

  if (curso.sumilla) lines.push(`Sumilla oficial: ${String(curso.sumilla).substring(0, 500)}`);
  if (curso.competencias?.length) {
    lines.push(`Competencias declaradas del curso: ${curso.competencias.map(c => c.nombre_competencia).join(', ')}`);
  }

  lines.push('', 'EVIDENCIA DISPONIBLE:');

  if (evidencia.radar.length) {
    lines.push(`- Señales/tendencias de Radar relacionadas (${evidencia.radar.length}):`);
    evidencia.radar.slice(0, 4).forEach(ev => lines.push(`  · ${ev.titulo}: ${String(ev.descripcion || '').substring(0, 200)}`));
  }
  if (evidencia.mercado.length) {
    lines.push(`- Habilidades de mercado laboral relacionadas al curso: ${evidencia.mercado.slice(0, 8).join(', ')}`);
  }
  if (evidencia.bench.length) {
    const universidades = [...new Set(evidencia.bench.map(b => b.nombre_universidad))];
    lines.push(`- Competencias equivalentes detectadas en benchmarking (${universidades.join(', ')}): ${evidencia.bench.slice(0, 6).map(b => b.nombre_competencia).join(', ')}`);
  }
  if (emplEv && Number(emplEv.total) > 0) {
    lines.push(`- Empleabilidad de egresados de la carrera: tasa de empleabilidad ${emplEv.tasaEmpleabilidad}%, tasa de afinidad laboral ${emplEv.tasaAfinidad}% (sobre ${emplEv.total} encuestados).`);
  }
  if (!evidencia.radar.length && !evidencia.mercado.length && !evidencia.bench.length) {
    lines.push('- No hay señales de Radar, mercado laboral ni benchmarking directamente relacionadas con este curso.');
  }

  lines.push(
    '',
    'Instrucciones de salida:',
    '- "estado_alineacion", elige UNO según cuál describe mejor lo que muestra la evidencia (no por defecto "riesgo"):',
    '  · "alineado": el curso ya cubre razonablemente lo que pide la evidencia, sin brecha relevante.',
    '  · "riesgo": hay una brecha parcial y cubrible — falta contenido o profundidad, pero el curso sigue siendo relevante.',
    '  · "critico": el curso está claramente desactualizado o desalineado frente a la evidencia — brecha grave.',
    '  · "oportunidad": el curso YA está razonablemente alineado, pero la evidencia muestra una tendencia emergente (tecnología, habilidad o certificación nueva) que el curso podría incorporar para diferenciarse — no es una brecha que corregir, es una mejora que aprovechar.',
    '- "tendencias_impacto": hasta 4 frases cortas y concretas (no genéricas) sobre tendencias de mercado/sector que afectan a ESTE curso. Deja el array vacío [] si la evidencia no sustenta ninguna.',
    '- "brechas_detectadas": hasta 4 frases cortas y concretas sobre brechas de ESTE curso frente a la evidencia. Deja el array vacío [] si no hay evidencia de brechas.',
    '- Nunca copies literalmente estas instrucciones ni frases de ejemplo como contenido de los arrays; si no tienes contenido real, usa un array vacío.',
    '',
    'Devuelve el siguiente JSON exacto (sin comentarios, sin texto fuera del JSON):',
    `{
  "estado_alineacion": "alineado" | "riesgo" | "critico" | "oportunidad",
  "score_alineacion": numero entre 0 y 100,
  "tendencias_impacto": string[],
  "brechas_detectadas": string[],
  "recomendaciones_ia": [{"impacto": "ALTO"|"MEDIO"|"BAJO", "urgencia": "CRÍTICA"|"ALTA"|"MEDIA"|"BAJA", "texto": "recomendacion accionable"}]
}`
  );

  return lines.join('\n');
}

function normalizeResultado(parsed) {
  if (!parsed) return null;
  const estado = ESTADOS_VALIDOS.includes(parsed.estado_alineacion) ? parsed.estado_alineacion : null;
  if (!estado) return null;

  const score = Math.max(0, Math.min(100, Number(parsed.score_alineacion) || 0));
  const tendencias = Array.isArray(parsed.tendencias_impacto)
    ? parsed.tendencias_impacto.filter(isRealText).slice(0, 4)
    : [];
  const brechas = Array.isArray(parsed.brechas_detectadas)
    ? parsed.brechas_detectadas.filter(isRealText).slice(0, 4)
    : [];
  const recomendaciones = Array.isArray(parsed.recomendaciones_ia)
    ? parsed.recomendaciones_ia
        .filter(r => r && IMPACTOS_VALIDOS.includes(r.impacto) && URGENCIAS_VALIDAS.includes(r.urgencia) && isRealText(r.texto))
        .slice(0, 4)
    : [];

  return { estado, score, tendencias, brechas, recomendaciones };
}

async function upsertAnalisisCurso(idCurso, resultado) {
  await dbCurricular.query(
    `INSERT INTO analisis_curso
      (id_curso, score_alineacion, estado_alineacion, tendencias_impacto, brechas_detectadas,
       recomendaciones_ia, modelo_ia_usado, prompt_version, analizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       score_alineacion = VALUES(score_alineacion),
       estado_alineacion = VALUES(estado_alineacion),
       tendencias_impacto = VALUES(tendencias_impacto),
       brechas_detectadas = VALUES(brechas_detectadas),
       recomendaciones_ia = VALUES(recomendaciones_ia),
       modelo_ia_usado = VALUES(modelo_ia_usado),
       prompt_version = VALUES(prompt_version),
       analizado_en = NOW()`,
    [
      idCurso,
      resultado.score,
      resultado.estado,
      JSON.stringify(resultado.tendencias),
      JSON.stringify(resultado.brechas),
      JSON.stringify(resultado.recomendaciones),
      MODELO_ID,
      PROMPT_VERSION,
    ]
  );
}

/**
 * Analiza curso por curso la malla indicada, cruzando evidencia real de
 * Radar, Mercado Laboral, Empleabilidad y Benchmarking, y escribe el
 * resultado en `analisis_curso` (lo que alimenta el Mapa de Visión 360).
 * Cursos sin ninguna evidencia relacionada se omiten (no se inventa nada).
 */
async function analizarMapaCurricular(idCarrera, idMallaVersion) {
  const cursos = await getCursosConContexto(idMallaVersion);
  if (!cursos.length) return { ok: false, error: 'No hay cursos en esta versión de malla' };

  const [radarEv, emplEv, mercadoSkills, benchEv] = await Promise.all([
    recogerEvidenciaRadar(idCarrera),
    recogerEvidenciaEmpleabilidad(idCarrera),
    recogerEvidenciaMercado(idCarrera),
    recogerEvidenciaBenchmarking(idCarrera),
  ]);

  if (!radarEv.length && !mercadoSkills.length && !benchEv.length) {
    return { ok: false, error: 'Sin evidencia suficiente (Radar, Mercado o Benchmarking) para analizar esta carrera' };
  }

  const resumen = { analizados: 0, omitidos: 0, errores: 0, total: cursos.length };
  const providerState = { hfExhausted: false };
  let primeraLlamada = true;

  for (const curso of cursos) {
    const evidencia = matchCursoEvidencia(curso, { radarEv, mercadoSkills, benchEv });

    // Revertido: mandar a la IA cursos SIN ninguna evidencia (radar/mercado/
    // benchmark todos vacíos) resultó en un "alineado ~85%" generico y falso
    // para cada uno -- confirmado revisando el detalle de un curso: "Confianza:
    // Media (1 de 4 fuentes)" con 3 de 4 fuentes vacías, igual marcado
    // "alineado". El enum de estado_alineacion no tiene un valor tipo "sin
    // evidencia" (requeriria migracion de BD), asi que "Sin análisis" honesto
    // es preferible a un "Alineado" que no está respaldado por nada real.
    if (!evidencia.radar.length && !evidencia.mercado.length && !evidencia.bench.length) {
      resumen.omitidos++;
      continue;
    }

    // Throttle: 10s entre llamadas. Necesario porque cuando HuggingFace se
    // queda sin cuota mensual, TODA la corrida cae en el tier gratuito de
    // Groq (6000 tokens/minuto) — con 1.5s se agotaba en segundos.
    if (!primeraLlamada) await new Promise(r => setTimeout(r, 10000));
    primeraLlamada = false;

    try {
      const prompt = buildPrompt(curso, evidencia, emplEv);
      const raw = await callLLM(SYSTEM_PROMPT, prompt, { providerState, maxTokens: 700, context: 'ANALISIS_CURSO' });
      const resultado = normalizeResultado(safeParseJson(raw));
      if (!resultado) {
        resumen.errores++;
        continue;
      }
      await upsertAnalisisCurso(curso.id_curso, resultado);
      resumen.analizados++;
    } catch (err) {
      resumen.errores++;
      logger.error(`Error analizando curso "${curso.nombre_curso}": ${err.message}`, { context: 'ANALISIS_CURSO' });
    }
  }

  return { ok: true, ...resumen };
}

function relevancia(count) {
  if (count >= 2) return 'alta';
  if (count === 1) return 'media';
  return null;
}

function mesAnio(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

/**
 * Reconstruye, sin volver a llamar a la IA, la evidencia real (Mercado,
 * Empleabilidad, Benchmark, Tendencias/Radar) que el motor de análisis usó
 * -o usaría- para este curso, agrupada como la necesita el modal
 * "Evidencia del análisis" del frontend. Todo dato mostrado proviene de una
 * fila real; nunca se fabrica fuente, fecha ni contenido.
 */
async function getEvidenciaCurso(idCurso) {
  const [[curso]] = await dbCurricular.query(
    `SELECT c.id_curso, c.nombre_curso, c.numero_ciclo, ca.id_carrera, ca.nombre_carrera, cs.sumilla
     FROM curso c
     JOIN malla_version mv ON mv.id_malla = c.id_malla
     JOIN carrera ca ON ca.id_carrera = mv.id_carrera
     LEFT JOIN curso_sumilla cs ON cs.id_curso = c.id_curso
     WHERE c.id_curso = ?`,
    [idCurso]
  );
  if (!curso) return null;

  const [competencias] = await dbCurricular.query(
    `SELECT comp.nombre_competencia
     FROM curso_competencia cc
     JOIN competencia_curricular comp ON comp.id_competencia = cc.id_competencia
     WHERE cc.id_curso = ?`,
    [idCurso]
  ).catch(() => [[]]);
  curso.competencias = competencias;

  const [[analisis]] = await dbCurricular.query(
    `SELECT score_alineacion, estado_alineacion, tendencias_impacto, brechas_detectadas, recomendaciones_ia, analizado_en
     FROM analisis_curso WHERE id_curso = ? ORDER BY analizado_en DESC LIMIT 1`,
    [idCurso]
  );

  const [radarEv, emplEv, mercadoSkills, benchEv] = await Promise.all([
    recogerEvidenciaRadar(curso.id_carrera),
    recogerEvidenciaEmpleabilidad(curso.id_carrera),
    recogerEvidenciaMercado(curso.id_carrera),
    recogerEvidenciaBenchmarking(curso.id_carrera),
  ]);

  const evidencia = matchCursoEvidencia(curso, { radarEv, mercadoSkills, benchEv });

  const [informe] = await dbCurricular.query(
    `SELECT fuente, periodo, documento_informe_url FROM mercado_informe WHERE nombre_carrera = ? AND activo = 1 LIMIT 1`,
    [curso.nombre_carrera]
  ).then(([r]) => r).catch(() => []);

  const bench = evidencia.bench.length
    ? await dbCurricular.query(
        `SELECT DISTINCT pb.nombre_programa, ub.nombre_universidad, pb.url_programa, pb.fecha_captura
         FROM programa_benchmark pb
         JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
         WHERE pb.id_programa_benchmark IN (${[...new Set(evidencia.bench.map(b => b.id_programa_benchmark))].map(() => '?').join(',') || 'NULL'})`,
        [...new Set(evidencia.bench.map(b => b.id_programa_benchmark))]
      ).then(([rows]) => rows).catch(() => [])
    : [];

  const mercadoTab = {
    señales: evidencia.mercado.map(skill => ({
      titulo: skill,
      fuente: informe?.fuente || 'Informe de Mercado Laboral USIL',
      fecha: informe?.periodo || null,
    })),
    relevancia: relevancia(evidencia.mercado.length),
  };

  const empleabilidadTab = {
    disponible: Boolean(emplEv && Number(emplEv.total) > 0),
    tasaEmpleabilidad: emplEv?.tasaEmpleabilidad ?? null,
    tasaAfinidad: emplEv?.tasaAfinidad ?? null,
    totalEncuestados: emplEv?.total ?? 0,
    relevancia: emplEv && Number(emplEv.total) > 0 ? 'media' : null,
  };

  const benchmarkTab = {
    señales: bench.map(b => ({
      titulo: b.nombre_programa,
      fuente: b.nombre_universidad,
      fuenteUrl: b.url_programa,
      fecha: mesAnio(b.fecha_captura),
    })),
    relevancia: relevancia(evidencia.bench.length),
  };

  const tendenciasTab = {
    señales: evidencia.radar.map(ev => ({
      titulo: ev.titulo,
      descripcion: ev.descripcion ? String(ev.descripcion).substring(0, 240) : null,
      fuente: ev.fuente_url || 'Radar CIE',
      fuenteUrl: ev.fuente_url,
      fecha: mesAnio(ev.fecha_publicacion),
    })),
    relevancia: relevancia(evidencia.radar.length),
  };

  return {
    curso: { id_curso: curso.id_curso, nombre_curso: curso.nombre_curso, numero_ciclo: curso.numero_ciclo },
    analisis: analisis ? {
      score: analisis.score_alineacion !== null ? Number(analisis.score_alineacion) : null,
      estado: analisis.estado_alineacion,
      tendencias: analisis.tendencias_impacto || [],
      brechas: analisis.brechas_detectadas || [],
      recomendaciones: analisis.recomendaciones_ia || [],
      analizadoEn: analisis.analizado_en,
    } : null,
    mercado: mercadoTab,
    empleabilidad: empleabilidadTab,
    benchmark: benchmarkTab,
    tendencias: tendenciasTab,
  };
}

export { analizarMapaCurricular, getEvidenciaCurso };
