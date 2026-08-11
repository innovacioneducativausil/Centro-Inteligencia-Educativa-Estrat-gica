


import dbRadar      from '../db.js';
import dbEmpl       from '../db_empl.js';
import dbCurricular from '../db_curricular.js';

const PESOS_DEFAULT = { radar: 0.25, mercado_laboral: 0.25, empleabilidad: 0.30, benchmarking: 0.20 };

function nivelImpacto(score) {
  if (score >= 75) return 'critico';
  if (score >= 50) return 'alto';
  if (score >= 25) return 'medio';
  return 'bajo';
}
function prioridad(score) {
  if (score >= 75) return 'critica';
  if (score >= 50) return 'alta';
  if (score >= 25) return 'media';
  return 'baja';
}
function tipoPropuesta(tipoBrecha) {
  const map = {
    competencia_faltante:     'actualizar_silabo',
    contenido_desactualizado: 'actualizar_silabo',
    baja_cobertura:           'agregar_unidad',
    falta_practica:           'agregar_unidad',
    falta_herramienta:        'modificar_unidad',
    desalineacion_mercado:    'actualizar_competencia',
    otro:                     'modificar_unidad',
  };
  return map[tipoBrecha] ?? 'modificar_unidad';
}

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
       LIMIT 10`,
      params
    );
    const [tendencias] = await dbRadar.query(
      `SELECT id_tendencia AS id, 'tendencia' AS tipo, nombre AS titulo, descripcion,
              NULL AS fuente_url, NULL AS fecha_publicacion, NULL AS urgencia, NULL AS impacto
       FROM tendencia
       WHERE estado = 'publicado' AND (${likeTerms.replace(/descripcion/g, 'descripcion')})
       LIMIT 5`,
      params
    );
    return [...senales, ...tendencias];
  } catch { return []; }
}

async function recogerEvidenciaEmpleabilidad(idCarrera) {
  try {
    const [carreras] = await dbCurricular.query(
      'SELECT nombre_carrera FROM carrera WHERE id_carrera = ? LIMIT 1', [idCarrera]
    );
    if (!carreras.length) return null;
    const nombreCarrera = carreras[0].nombre_carrera;

    const [[resumen]] = await dbEmpl.query(
      `SELECT
         COUNT(*) AS total,
         ROUND(SUM(CASE WHEN ea.trabaja=1 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100,1) AS tasaEmpleabilidad,
         ROUND(SUM(CASE WHEN ea.afinidad_laboral='SI' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100,1) AS tasaAfinidad
       FROM encuesta_anual ea
       JOIN egresado eg ON eg.id_egresado = ea.id_egresado
       JOIN carrera ca  ON ca.id_carrera  = eg.id_carrera
       WHERE ca.nombre_carrera = ? AND ea.encuestado = 1`,
      [nombreCarrera]
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
     fuente_url ?? null, nivel_confianza ?? 0.5,
     nivel_confianza >= 0.6 ? 'pendiente' : 'pendiente']
  );
  return r.insertId;
}

async function analizarImpacto(idCarrera, idMallaVersion, pesos = {}, usuarioCreador = 'motor_automatico') {
  const w = { ...PESOS_DEFAULT, ...pesos };

  const [cursos] = await dbCurricular.query(
    `SELECT c.id_curso, c.nombre_curso, c.numero_ciclo, c.creditos,
            ac.brechas_detectadas, ac.score_alineacion, ac.estado_alineacion
     FROM curso c
     LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
     WHERE c.id_malla = ?
     ORDER BY c.numero_ciclo, c.nombre_curso`,
    [idMallaVersion]
  );
  if (!cursos.length) return { ok: false, error: 'No hay cursos en esta versión de malla' };

  const [radarEv, emplEv, mercadoSkills, benchEv] = await Promise.all([
    recogerEvidenciaRadar(idCarrera),
    recogerEvidenciaEmpleabilidad(idCarrera),
    recogerEvidenciaMercado(idCarrera),
    recogerEvidenciaBenchmarking(idCarrera),
  ]);

  const hayRadar    = radarEv.length > 0;
  const hayMercado  = mercadoSkills.length > 0;
  const hayEmpl     = emplEv && Number(emplEv.total) > 0;
  const hayBenchmark= benchEv.length > 0;

  if (!hayRadar && !hayMercado && !hayEmpl && !hayBenchmark) {
    return { ok: false, error: 'Sin evidencia suficiente para analizar impacto curricular' };
  }

  const radarScore    = Math.min(100, radarEv.length * 12.5);
  const mercadoScore  = hayMercado ? Math.min(100, mercadoSkills.length * 5) : 0;
  const emplScore     = hayEmpl
    ? Math.max(0, 100 - (Number(emplEv.tasaAfinidad) || 50))
    : 0;
  const benchScore    = hayBenchmark ? Math.min(100, benchEv.length * 4) : 0;

  const scoreGlobal = (
    radarScore    * w.radar          +
    mercadoScore  * w.mercado_laboral +
    emplScore     * w.empleabilidad   +
    benchScore    * w.benchmarking
  );

  const conn = await dbCurricular.getConnection();
  const creados = { impactos: 0, brechas: 0, propuestas: 0, evidencias: 0 };

  try {
    await conn.beginTransaction();

    await conn.query(
      'DELETE ic FROM impacto_curricular ic WHERE ic.id_carrera=? AND ic.id_malla_version=?',
      [idCarrera, idMallaVersion]
    );

    for (const curso of cursos) {
      const brechas = [];
      try {
        const parsed = JSON.parse(curso.brechas_detectadas || '[]');
        if (Array.isArray(parsed)) brechas.push(...parsed);
      } catch {}
      if (!brechas.length && !hayMercado && !hayBenchmark) continue;

      const cursoBrechas = [
        ...brechas,
        ...mercadoSkills.filter(s => {
          const sLow = s.toLowerCase();
          const cLow = curso.nombre_curso.toLowerCase();
          return sLow.split(' ').some(w => w.length > 4 && cLow.includes(w));
        }).map(s => `Habilidad de mercado no cubierta: ${s}`),
      ].slice(0, 8);

      if (!cursoBrechas.length) continue;

      const cursoScore = scoreGlobal;

      const [impRes] = await conn.query(
        `INSERT INTO impacto_curricular
         (id_carrera, id_malla_version, id_curso, titulo_impacto, descripcion_impacto,
          nivel_impacto, score_impacto, estado)
         VALUES (?,?,?,?,?,?,?,'detectado')`,
        [
          idCarrera, idMallaVersion, curso.id_curso,
          `Impacto en: ${curso.nombre_curso}`,
          `Se detectaron ${cursoBrechas.length} brechas potenciales cruzando evidencia de ${[hayRadar?'Radar':'',hayMercado?'Mercado':'',hayEmpl?'Empleabilidad':'',hayBenchmark?'Benchmarking':''].filter(Boolean).join(', ')}.`,
          nivelImpacto(cursoScore),
          cursoScore,
        ]
      );
      const idImpacto = impRes.insertId;
      creados.impactos++;

      const evidenciaIds = [];

      if (hayRadar && radarEv.length > 0) {
        const ev = radarEv[0];
        const evId = await insertarEvidencia(conn, {
          modulo_origen: 'radar', tipo_evidencia: ev.tipo === 'tendencia' ? 'tendencia' : 'senal',
          referencia_id: ev.id, titulo: ev.titulo,
          descripcion: ev.descripcion?.substring(0, 500),
          fuente_url: ev.fuente_url, nivel_confianza: 0.70,
        });
        evidenciaIds.push({ evId, peso: w.radar, just: 'Señal/tendencia de Radar relacionada con la carrera' });
        creados.evidencias++;
      }
      if (hayMercado) {
        const evId = await insertarEvidencia(conn, {
          modulo_origen: 'mercado_laboral', tipo_evidencia: 'informe_carrera',
          referencia_id: null,
          titulo: `Habilidades de mercado requeridas (${mercadoSkills.length} detectadas)`,
          descripcion: `Habilidades más demandadas: ${mercadoSkills.slice(0,5).join(', ')}`,
          fuente_url: null, nivel_confianza: 0.80,
        });
        evidenciaIds.push({ evId, peso: w.mercado_laboral, just: 'Informe de mercado laboral muestra demanda no cubierta' });
        creados.evidencias++;
      }
      if (hayEmpl && emplEv) {
        const evId = await insertarEvidencia(conn, {
          modulo_origen: 'empleabilidad', tipo_evidencia: 'dato_empleabilidad',
          referencia_id: null,
          titulo: `Empleabilidad: afinidad ${emplEv.tasaAfinidad}% sobre ${emplEv.total} encuestados`,
          descripcion: `Tasa de empleabilidad: ${emplEv.tasaEmpleabilidad}%. Tasa de afinidad laboral: ${emplEv.tasaAfinidad}%.`,
          fuente_url: null, nivel_confianza: 0.85,
        });
        evidenciaIds.push({ evId, peso: w.empleabilidad, just: 'Datos de egresados muestran baja afinidad laboral con la carrera' });
        creados.evidencias++;
      }
      if (hayBenchmark && benchEv.length > 0) {
        const evId = await insertarEvidencia(conn, {
          modulo_origen: 'benchmarking', tipo_evidencia: 'benchmark_universitario',
          referencia_id: benchEv[0].id_programa_benchmark,
          titulo: `Benchmarking: ${benchEv.length} competencias en ${[...new Set(benchEv.map(b => b.nombre_universidad))].length} universidades`,
          descripcion: `Competencias identificadas en benchmarking: ${benchEv.slice(0,5).map(b => b.nombre_competencia).join(', ')}`,
          fuente_url: null, nivel_confianza: 0.65,
        });
        evidenciaIds.push({ evId, peso: w.benchmarking, just: 'Benchmarking universitario identifica competencias no cubiertas en la malla' });
        creados.evidencias++;
      }

      for (const { evId, peso, just } of evidenciaIds) {
        await conn.query(
          'INSERT INTO impacto_curricular_evidencia (id_impacto, id_evidencia, peso, justificacion_relacion) VALUES (?,?,?,?)',
          [idImpacto, evId, peso, just]
        );
      }

      for (const desc of cursoBrechas) {
        const tipoBre = desc.includes('mercado') ? 'desalineacion_mercado'
          : desc.includes('herramienta') ? 'falta_herramienta'
          : 'competencia_faltante';

        const [breRes] = await conn.query(
          `INSERT INTO brecha_curricular
           (id_impacto, id_carrera, id_curso, tipo_brecha, descripcion_brecha,
            competencia_afectada, evidencia_resumen, prioridad)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            idImpacto, idCarrera, curso.id_curso, tipoBre,
            String(desc).substring(0, 499),
            String(desc).substring(0, 299),
            `Evidencia de: ${[hayRadar?'Radar':'',hayMercado?'Mercado':'',hayEmpl?'Empleabilidad':'',hayBenchmark?'Benchmarking':''].filter(Boolean).join(' + ')}`,
            prioridad(cursoScore),
          ]
        );
        creados.brechas++;
        const idBrecha = breRes.insertId;

        const puedeGenerarPropuesta =
          (hayRadar && hayMercado) ||
          (hayRadar && hayEmpl)   ||
          (hayMercado && hayEmpl);

        if (!puedeGenerarPropuesta) continue;

        const tipoP = tipoPropuesta(tipoBre);
        await conn.query(
          `INSERT INTO propuesta_curricular
           (id_brecha, id_carrera, id_malla_version_origen, tipo_propuesta,
            titulo_propuesta, descripcion_propuesta, justificacion, impacto_esperado,
            estado_revision, usuario_creador)
           VALUES (?,?,?,?,?,?,?,?,'pendiente',?)`,
          [
            idBrecha, idCarrera, idMallaVersion, tipoP,
            `Propuesta: ${tipoP.replace(/_/g,' ')} en ${curso.nombre_curso}`,
            `Se propone ${tipoP.replace(/_/g,' ')} del curso "${curso.nombre_curso}" basado en brecha detectada: ${String(desc).substring(0,200)}`,
            `Evidencia de ${evidenciaIds.length} fuentes: ${[hayRadar?'Radar':'',hayMercado?'Mercado':'',hayEmpl?'Empleabilidad':'',hayBenchmark?'Benchmarking':''].filter(Boolean).join(', ')}. Score de impacto: ${cursoScore.toFixed(1)}.`,
            `Mejorar la alineación del curso con las demandas actuales del mercado y los estándares de egresados.`,
            usuarioCreador,
          ]
        );
        creados.propuestas++;
      }
    }

    await conn.commit();
    return { ok: true, scoreGlobal: scoreGlobal.toFixed(1), nivelGlobal: nivelImpacto(scoreGlobal), ...creados };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export {
  analizarImpacto,
  recogerEvidenciaRadar,
  recogerEvidenciaEmpleabilidad,
  recogerEvidenciaMercado,
  recogerEvidenciaBenchmarking,
};
