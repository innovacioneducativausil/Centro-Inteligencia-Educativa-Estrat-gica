import dbRadar      from '../db.js';
import dbEmpl       from '../db_empl.js';
import dbCurricular from '../db_curricular.js';
import logger       from '../logger.js';
import { getIdCarreraEmpleabilidad } from './carreraCorrespondenciaService.js';
import { callLLM, safeParseJson, isRealText, sleep } from './llmProviderService.js';
import { matchCursoEvidencia, getCursosConContexto } from './curricularEvidenceMatching.js';

const PESOS_DEFAULT = { radar: 0.25, mercado_laboral: 0.25, empleabilidad: 0.30, benchmarking: 0.20 };

const TIPOS_BRECHA_VALIDOS = [
  'competencia_faltante', 'contenido_desactualizado', 'baja_cobertura',
  'falta_practica', 'falta_herramienta', 'desalineacion_mercado', 'otro',
];
const NIVELES_IMPACTO_VALIDOS = ['bajo', 'medio', 'alto', 'critico'];
const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta', 'critica'];
const TIPOS_PROPUESTA_VALIDOS = [
  'actualizar_silabo', 'agregar_unidad', 'modificar_unidad', 'aumentar_horas',
  'crear_curso_electivo', 'crear_curso_obligatorio', 'mover_curso_ciclo',
  'conectar_cursos', 'actualizar_competencia',
];

const SYSTEM_PROMPT_IMPACTO = `Eres un especialista en gestión curricular universitaria que evalúa si UN curso
de una malla necesita una acción curricular concreta (actualizar contenido, agregar unidad, crear curso nuevo,
etc.), basándote en evidencia real de radar de tendencias, mercado laboral, empleabilidad de egresados y
benchmarking contra otras universidades.
REGLA CRÍTICA: Solo puedes razonar sobre la evidencia entregada en el prompt. Nunca inventes datos, cifras,
universidades, tecnologías ni fuentes que no estén ahí.
Si la evidencia no sustenta una acción curricular real y concreta sobre ESTE curso específico, responde
hay_impacto=false — no fuerces una recomendación solo para tener algo que decir.
Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown, sin texto adicional.`;

async function recogerEvidenciaRadar(idCarrera) {
  try {
    const [carreras] = await dbCurricular.query(
      'SELECT nombre_carrera FROM carrera WHERE id_carrera = ? LIMIT 1', [idCarrera]
    );
    if (!carreras.length) return [];

    const nombreCarrera = carreras[0].nombre_carrera.toLowerCase();
    const palabrasClave = nombreCarrera.split(/\s+/).filter(p => p.length > 3);
    if (!palabrasClave.length) return [];

    const likeTerms = palabrasClave.map(() => 'descripcion LIKE ?').join(' OR ');
    const params    = palabrasClave.map(p => `%${p}%`);

    const [senales] = await dbRadar.query(
      `SELECT id_senal AS id, 'senal' AS tipo, titulo, descripcion, fuente_url, fecha_publicacion,
              urgencia, impacto
       FROM senal
       WHERE estado = 'publicado' AND (${likeTerms})
       ORDER BY id_senal
       LIMIT 10`,
      params
    );
    const [tendencias] = await dbRadar.query(
      `SELECT id_tendencia AS id, 'tendencia' AS tipo, nombre AS titulo, descripcion,
              NULL AS fuente_url, NULL AS fecha_publicacion, NULL AS urgencia, NULL AS impacto
       FROM tendencia
       WHERE estado = 'publicado' AND (${likeTerms.replace(/descripcion/g, 'descripcion')})
       ORDER BY id_tendencia
       LIMIT 5`,
      params
    );
    return [...senales, ...tendencias];
  } catch { return []; }
}

async function recogerEvidenciaEmpleabilidad(idCarrera) {
  try {
    // Preferir la correspondencia explícita por ID (evita el bug de matchear
    // por nombre, que mezclaba egresados de "Marketing" pregrado con los de
    // "Marketing" educación continua — mismo nombre, tipo_programa distinto).
    const idCarreraEmpleabilidad = await getIdCarreraEmpleabilidad(idCarrera);

    let whereClause;
    let param;
    if (idCarreraEmpleabilidad) {
      whereClause = 'ca.id_carrera = ?';
      param = idCarreraEmpleabilidad;
    } else {
      const [carreras] = await dbCurricular.query(
        'SELECT nombre_carrera FROM carrera WHERE id_carrera = ? LIMIT 1', [idCarrera]
      );
      if (!carreras.length) return null;
      whereClause = 'ca.nombre_carrera = ?';
      param = carreras[0].nombre_carrera;
    }

    const [[resumen]] = await dbEmpl.query(
      `SELECT
         COUNT(*) AS total,
         ROUND(SUM(CASE WHEN ea.trabaja=1 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100,1) AS tasaEmpleabilidad,
         ROUND(SUM(CASE WHEN ea.afinidad_laboral='SI' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100,1) AS tasaAfinidad
       FROM encuesta_anual ea
       JOIN egresado eg ON eg.id_egresado = ea.id_egresado
       JOIN carrera ca  ON ca.id_carrera  = eg.id_carrera
       WHERE ${whereClause} AND ea.encuestado = 1`,
      [param]
    ).catch(() => [[null]]);

    return resumen ?? null;
  } catch { return null; }
}

async function recogerEvidenciaMercado(idCarrera) {
  try {
    const [carreras] = await dbCurricular.query(
      'SELECT nombre_carrera FROM carrera WHERE id_carrera = ? LIMIT 1', [idCarrera]
    );
    if (!carreras.length) return [];
    const nombreCarrera = carreras[0].nombre_carrera;

    const [[informe]] = await dbEmpl.query(
      'SELECT id_informe FROM mercado_informe WHERE nombre_carrera = ? AND activo=1 LIMIT 1',
      [nombreCarrera]
    );
    if (!informe) return [];

    const [cats]  = await dbEmpl.query(
      'SELECT id_categoria FROM mercado_habilidad_categoria WHERE id_informe=?', [informe.id_informe]
    );
    const catIds  = cats.map(c => c.id_categoria);
    if (!catIds.length) return [];

    const [habs]  = await dbEmpl.query(
      `SELECT habilidad FROM mercado_habilidad_item WHERE id_categoria IN (${catIds.map(() => '?').join(',')})`,
      catIds
    );
    return habs.map(h => h.habilidad);
  } catch { return []; }
}

async function recogerEvidenciaBenchmarking(idCarrera) {
  try {
    const [rows] = await dbEmpl.query(
      `SELECT cb.nombre_competencia, cb.tipo_competencia,
              pb.nombre_programa, ub.nombre_universidad, ub.tipo_benchmark, pb.id_programa_benchmark
       FROM competencia_benchmark cb
       JOIN programa_benchmark pb ON pb.id_programa_benchmark = cb.id_programa_benchmark
       JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
       WHERE pb.carrera_equivalente_id = ? AND pb.estado_extraccion IN ('verificado','procesado')
       ORDER BY cb.id_competencia_benchmark
       LIMIT 50`,
      [idCarrera]
    );
    return rows;
  } catch { return []; }
}

async function insertarEvidencia(conn, { modulo_origen, tipo_evidencia, referencia_id, titulo, descripcion, fuente_url, nivel_confianza }) {
  const [r] = await conn.query(
    `INSERT INTO evidencia_curricular
     (modulo_origen, tipo_evidencia, referencia_id, titulo_evidencia, descripcion_evidencia,
      fuente_url, nivel_confianza, estado_verificacion)
     VALUES (?,?,?,?,?,?,?,?)`,
    [modulo_origen, tipo_evidencia, referencia_id ?? null, titulo, descripcion ?? null,
     fuente_url ?? null, nivel_confianza ?? 0.5, 'pendiente']
  );
  return r.insertId;
}

function buildImpactoPrompt(curso, evidencia, emplEv, pesos) {
  const lines = [
    `Curso: "${curso.nombre_curso}" (Ciclo ${curso.numero_ciclo}, ${curso.creditos ?? '?'} créditos, tipo: ${curso.tipo_curso || 'Obligatorio'}).`,
  ];

  if (curso.sumilla) lines.push(`Sumilla oficial: ${String(curso.sumilla).substring(0, 500)}`);
  if (curso.competencias?.length) {
    lines.push(`Competencias declaradas: ${curso.competencias.map(c => c.nombre_competencia).join(', ')}`);
  }
  if (curso.analisis_estado) {
    lines.push('', `Análisis previo de alineación (Visión 360) de este mismo curso: estado="${curso.analisis_estado}", score=${curso.analisis_score ?? '?'}%.`);
    if (Array.isArray(curso.analisis_brechas) && curso.analisis_brechas.length) {
      lines.push(`Brechas ya detectadas ahí: ${curso.analisis_brechas.join(' | ')}`);
    }
  }

  lines.push('', 'EVIDENCIA DISPONIBLE PARA ESTE CURSO:');
  if (evidencia.radar.length) {
    lines.push(`- Radar (${evidencia.radar.length} señales/tendencias relacionadas):`);
    evidencia.radar.slice(0, 4).forEach(ev => lines.push(`  · ${ev.titulo}: ${String(ev.descripcion || '').substring(0, 200)}`));
  }
  if (evidencia.mercado.length) {
    lines.push(`- Mercado laboral: ${evidencia.mercado.slice(0, 8).join(', ')}`);
  }
  if (evidencia.bench.length) {
    const universidades = [...new Set(evidencia.bench.map(b => b.nombre_universidad))];
    lines.push(`- Benchmarking (${universidades.join(', ')}): ${evidencia.bench.slice(0, 6).map(b => b.nombre_competencia).join(', ')}`);
  }
  if (emplEv && Number(emplEv.total) > 0) {
    lines.push(`- Empleabilidad de egresados de la carrera: tasa de empleabilidad ${emplEv.tasaEmpleabilidad}%, afinidad laboral ${emplEv.tasaAfinidad}% (${emplEv.total} encuestados).`);
  }

  lines.push(
    '',
    `Pesos configurados por el equipo (dale más peso relativo a la evidencia de las fuentes con mayor %): ` +
    `Radar ${Math.round((pesos.radar ?? 0) * 100)}%, Mercado ${Math.round((pesos.mercado_laboral ?? 0) * 100)}%, ` +
    `Empleabilidad ${Math.round((pesos.empleabilidad ?? 0) * 100)}%, Benchmarking ${Math.round((pesos.benchmarking ?? 0) * 100)}%.`
  );

  lines.push(
    '',
    'Instrucciones:',
    '- "hay_impacto": true SOLO si la evidencia sustenta una acción curricular real y concreta sobre ESTE curso. Si es débil, tangencial o no aplica, usa false.',
    '- "nivel_impacto": "bajo"|"medio"|"alto"|"critico" según severidad de la brecha frente a la evidencia.',
    '- "score_impacto": número entre 0 y 100.',
    '- "brechas": hasta 3 objetos {"tipo_brecha","descripcion","competencia_afectada","prioridad"}, cada uno específico de este curso (no genérico).',
    `  tipo_brecha ∈ [${TIPOS_BRECHA_VALIDOS.join(', ')}]. prioridad ∈ [${PRIORIDADES_VALIDAS.join(', ')}].`,
    '- "propuesta": null si la evidencia no es suficientemente fuerte (idealmente al menos 2 fuentes de evidencia distintas para este curso), o un objeto si sí:',
    `  {"tipo_propuesta","titulo_propuesta","descripcion_propuesta","justificacion","impacto_esperado"}, tipo_propuesta ∈ [${TIPOS_PROPUESTA_VALIDOS.join(', ')}].`,
    '- Nunca copies estas instrucciones como contenido; si no hay evidencia real para un campo, usa null o array vacío.',
    '',
    'Devuelve el siguiente JSON exacto (sin comentarios, sin texto fuera del JSON):',
    `{
  "hay_impacto": boolean,
  "nivel_impacto": "bajo" | "medio" | "alto" | "critico",
  "score_impacto": numero entre 0 y 100,
  "brechas": [{"tipo_brecha": string, "descripcion": string, "competencia_afectada": string, "prioridad": string}],
  "propuesta": null | {"tipo_propuesta": string, "titulo_propuesta": string, "descripcion_propuesta": string, "justificacion": string, "impacto_esperado": string}
}`
  );

  return lines.join('\n');
}

function normalizeImpactoResultado(parsed) {
  if (!parsed) return null;
  if (!parsed.hay_impacto) return { hay_impacto: false, nivel_impacto: null, score_impacto: 0, brechas: [], propuesta: null };

  const nivel_impacto = NIVELES_IMPACTO_VALIDOS.includes(parsed.nivel_impacto) ? parsed.nivel_impacto : null;
  if (!nivel_impacto) return null;
  const score_impacto = Math.max(0, Math.min(100, Number(parsed.score_impacto) || 0));

  const brechas = Array.isArray(parsed.brechas)
    ? parsed.brechas
        .filter(b => b && TIPOS_BRECHA_VALIDOS.includes(b.tipo_brecha) && PRIORIDADES_VALIDAS.includes(b.prioridad) && isRealText(b.descripcion))
        .slice(0, 3)
        .map(b => ({
          tipo_brecha: b.tipo_brecha,
          descripcion: b.descripcion.trim(),
          competencia_afectada: isRealText(b.competencia_afectada) ? b.competencia_afectada.trim() : null,
          prioridad: b.prioridad,
        }))
    : [];

  let propuesta = null;
  if (parsed.propuesta && typeof parsed.propuesta === 'object') {
    const p = parsed.propuesta;
    if (TIPOS_PROPUESTA_VALIDOS.includes(p.tipo_propuesta) && isRealText(p.titulo_propuesta) && isRealText(p.descripcion_propuesta) && isRealText(p.justificacion)) {
      propuesta = {
        tipo_propuesta: p.tipo_propuesta,
        titulo_propuesta: p.titulo_propuesta.trim().substring(0, 299),
        descripcion_propuesta: p.descripcion_propuesta.trim(),
        justificacion: p.justificacion.trim(),
        impacto_esperado: isRealText(p.impacto_esperado) ? p.impacto_esperado.trim() : null,
      };
    }
  }

  return { hay_impacto: true, nivel_impacto, score_impacto, brechas, propuesta };
}

/** Borra impactos/brechas/propuestas de una corrida anterior antes de regenerar.
 * brecha_curricular y propuesta_curricular NO tienen FK real hacia impacto_curricular
 * (MySQL no lo exige), así que sin este borrado explícito quedarían huérfanas —
 * visibles en la UI mezcladas con las nuevas — en cada re-análisis. */
async function limpiarCorridaAnterior(idCarrera, idMallaVersion) {
  const conn = await dbCurricular.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE pc FROM propuesta_curricular pc
       JOIN brecha_curricular bc ON bc.id_brecha = pc.id_brecha
       JOIN impacto_curricular ic ON ic.id_impacto = bc.id_impacto
       WHERE ic.id_carrera=? AND ic.id_malla_version=?`,
      [idCarrera, idMallaVersion]
    );
    await conn.query(
      `DELETE ice FROM impacto_curricular_evidencia ice
       JOIN impacto_curricular ic ON ic.id_impacto = ice.id_impacto
       WHERE ic.id_carrera=? AND ic.id_malla_version=?`,
      [idCarrera, idMallaVersion]
    );
    await conn.query(
      `DELETE bc FROM brecha_curricular bc
       JOIN impacto_curricular ic ON ic.id_impacto = bc.id_impacto
       WHERE ic.id_carrera=? AND ic.id_malla_version=?`,
      [idCarrera, idMallaVersion]
    );
    await conn.query('DELETE FROM impacto_curricular WHERE id_carrera=? AND id_malla_version=?', [idCarrera, idMallaVersion]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Genera impactos/brechas/propuestas curso por curso con un LLM, cruzando la
 * misma evidencia real (Radar/Mercado/Empleabilidad/Benchmarking) que usa el
 * motor de Visión 360, y reusando su análisis previo (si existe) como
 * contexto para no contradecirlo. Reemplaza la fórmula anterior, que
 * calculaba UN score para toda la carrera y lo repetía en cada curso.
 */
async function analizarImpacto(idCarrera, idMallaVersion, pesos = {}, usuarioCreador = 'motor_automatico') {
  const w = { ...PESOS_DEFAULT, ...pesos };

  const cursos = await getCursosConContexto(idMallaVersion);
  if (!cursos.length) return { ok: false, error: 'No hay cursos en esta versión de malla' };

  const [radarEv, emplEv, mercadoSkills, benchEv] = await Promise.all([
    recogerEvidenciaRadar(idCarrera),
    recogerEvidenciaEmpleabilidad(idCarrera),
    recogerEvidenciaMercado(idCarrera),
    recogerEvidenciaBenchmarking(idCarrera),
  ]);

  const hayEmpl = emplEv && Number(emplEv.total) > 0;
  if (!radarEv.length && !mercadoSkills.length && !hayEmpl && !benchEv.length) {
    return { ok: false, error: 'Sin evidencia suficiente para analizar impacto curricular' };
  }

  await limpiarCorridaAnterior(idCarrera, idMallaVersion);

  const resumen = { total: cursos.length, analizados: 0, omitidos: 0, errores: 0, impactos: 0, brechas: 0, propuestas: 0, evidencias: 0 };
  const providerState = { hfExhausted: false };
  let primeraLlamada = true;

  for (const curso of cursos) {
    const evidencia = matchCursoEvidencia(curso, { radarEv, mercadoSkills, benchEv });
    if (!evidencia.radar.length && !evidencia.mercado.length && !evidencia.bench.length) {
      resumen.omitidos++;
      continue;
    }

    // Throttle: 10s entre llamadas. Necesario porque cuando HuggingFace se
    // queda sin cuota mensual, TODA la corrida cae en el tier gratuito de
    // Groq (6000 tokens/minuto) — con 1.5s se agotaba en segundos.
    if (!primeraLlamada) await sleep(10000);
    primeraLlamada = false;

    try {
      const prompt = buildImpactoPrompt(curso, evidencia, emplEv, w);
      const raw = await callLLM(SYSTEM_PROMPT_IMPACTO, prompt, { providerState, maxTokens: 900, context: 'IMPACTO_CURRICULAR' });
      const resultado = normalizeImpactoResultado(safeParseJson(raw));

      if (!resultado) { resumen.errores++; continue; }
      if (!resultado.hay_impacto || !resultado.brechas.length) { resumen.analizados++; continue; }

      const conn = await dbCurricular.getConnection();
      try {
        await conn.beginTransaction();

        const [impRes] = await conn.query(
          `INSERT INTO impacto_curricular
           (id_carrera, id_malla_version, id_curso, titulo_impacto, descripcion_impacto, nivel_impacto, score_impacto, estado)
           VALUES (?,?,?,?,?,?,?,'detectado')`,
          [
            idCarrera, idMallaVersion, curso.id_curso,
            `Impacto en: ${curso.nombre_curso}`,
            resultado.brechas[0].descripcion,
            resultado.nivel_impacto,
            resultado.score_impacto,
          ]
        );
        const idImpacto = impRes.insertId;
        resumen.impactos++;

        const evidenciaIds = [];
        for (const ev of evidencia.radar.slice(0, 3)) {
          const evId = await insertarEvidencia(conn, {
            modulo_origen: 'radar', tipo_evidencia: ev.tipo === 'tendencia' ? 'tendencia' : 'senal',
            referencia_id: ev.id, titulo: ev.titulo, descripcion: ev.descripcion?.substring(0, 500),
            fuente_url: ev.fuente_url, nivel_confianza: 0.70,
          });
          evidenciaIds.push({ evId, peso: w.radar, just: 'Señal/tendencia de Radar relacionada con este curso' });
        }
        if (evidencia.mercado.length) {
          const evId = await insertarEvidencia(conn, {
            modulo_origen: 'mercado_laboral', tipo_evidencia: 'informe_carrera', referencia_id: null,
            titulo: `Habilidades de mercado relacionadas (${evidencia.mercado.length})`,
            descripcion: `Habilidades: ${evidencia.mercado.slice(0, 5).join(', ')}`,
            fuente_url: null, nivel_confianza: 0.80,
          });
          evidenciaIds.push({ evId, peso: w.mercado_laboral, just: 'Informe de mercado laboral relacionado con este curso' });
        }
        if (hayEmpl) {
          const evId = await insertarEvidencia(conn, {
            modulo_origen: 'empleabilidad', tipo_evidencia: 'dato_empleabilidad', referencia_id: null,
            titulo: `Empleabilidad: afinidad ${emplEv.tasaAfinidad}% sobre ${emplEv.total} encuestados`,
            descripcion: `Tasa de empleabilidad: ${emplEv.tasaEmpleabilidad}%. Tasa de afinidad laboral: ${emplEv.tasaAfinidad}%.`,
            fuente_url: null, nivel_confianza: 0.85,
          });
          evidenciaIds.push({ evId, peso: w.empleabilidad, just: 'Datos de egresados de la carrera' });
        }
        if (evidencia.bench.length) {
          const universidades = [...new Set(evidencia.bench.map(b => b.nombre_universidad))];
          const evId = await insertarEvidencia(conn, {
            modulo_origen: 'benchmarking', tipo_evidencia: 'benchmark_universitario',
            referencia_id: evidencia.bench[0].id_programa_benchmark,
            titulo: `Benchmarking: ${evidencia.bench.length} competencias en ${universidades.length} universidades`,
            descripcion: `Competencias: ${evidencia.bench.slice(0, 5).map(b => b.nombre_competencia).join(', ')}`,
            fuente_url: null, nivel_confianza: 0.65,
          });
          evidenciaIds.push({ evId, peso: w.benchmarking, just: 'Benchmarking universitario relacionado con este curso' });
        }
        for (const { evId, peso, just } of evidenciaIds) {
          await conn.query(
            'INSERT INTO impacto_curricular_evidencia (id_impacto, id_evidencia, peso, justificacion_relacion) VALUES (?,?,?,?)',
            [idImpacto, evId, peso, just]
          );
        }
        resumen.evidencias += evidenciaIds.length;

        let primeraBrechaId = null;
        for (const brecha of resultado.brechas) {
          const [breRes] = await conn.query(
            `INSERT INTO brecha_curricular
             (id_impacto, id_carrera, id_curso, tipo_brecha, descripcion_brecha, competencia_afectada, evidencia_resumen, prioridad)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
              idImpacto, idCarrera, curso.id_curso, brecha.tipo_brecha,
              brecha.descripcion.substring(0, 499),
              (brecha.competencia_afectada || brecha.descripcion).substring(0, 299),
              `Evidencia de: ${[evidencia.radar.length ? 'Radar' : '', evidencia.mercado.length ? 'Mercado' : '', hayEmpl ? 'Empleabilidad' : '', evidencia.bench.length ? 'Benchmarking' : ''].filter(Boolean).join(' + ')}`,
              brecha.prioridad,
            ]
          );
          resumen.brechas++;
          if (primeraBrechaId === null) primeraBrechaId = breRes.insertId;
        }

        if (resultado.propuesta && primeraBrechaId !== null) {
          await conn.query(
            `INSERT INTO propuesta_curricular
             (id_brecha, id_carrera, id_malla_version_origen, tipo_propuesta, titulo_propuesta, descripcion_propuesta, justificacion, impacto_esperado, estado_revision, usuario_creador)
             VALUES (?,?,?,?,?,?,?,?,'pendiente',?)`,
            [
              primeraBrechaId, idCarrera, idMallaVersion, resultado.propuesta.tipo_propuesta,
              resultado.propuesta.titulo_propuesta, resultado.propuesta.descripcion_propuesta,
              resultado.propuesta.justificacion, resultado.propuesta.impacto_esperado, usuarioCreador,
            ]
          );
          resumen.propuestas++;
        }

        await conn.commit();
        resumen.analizados++;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      resumen.errores++;
      logger.error(`Error generando impacto para curso "${curso.nombre_curso}": ${err.message}`, { context: 'IMPACTO_CURRICULAR' });
    }
  }

  return { ok: true, ...resumen };
}

export {
  analizarImpacto,
  recogerEvidenciaRadar,
  recogerEvidenciaEmpleabilidad,
  recogerEvidenciaMercado,
  recogerEvidenciaBenchmarking,
};
