import { curricularPrisma } from '../../prismaClient.js';
import dbCurricular from '../../db_curricular.js';

function toBoolean(value) {
  return Boolean(Number(value));
}

function stringifyJson(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function latestAnalisis(curso) {
  return curso.analisis_curso?.[0] || {};
}

function mapMalla(malla) {
  return {
    id_malla: malla.id_malla,
    nombre_version: malla.nombre_version,
    anio_inicio: malla.anio_inicio,
    es_vigente: malla.es_vigente,
    nombre_carrera: malla.carrera.nombre_carrera,
    nombre_facultad: malla.carrera.facultad.nombre_facultad,
    total_cursos: malla._count?.curso || 0,
  };
}

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rankMallaForCurricularUx(malla) {
  const carrera = normalizeName(malla.carrera?.nombre_carrera);
  const version = normalizeName(malla.nombre_version);
  if (
    (carrera === 'educacion inicial' || carrera === 'educacion secundaria con especialidad en ingles')
    && version.includes('xlsm')
  ) {
    return -1;
  }
  return 0;
}

async function optionalQuery(sql, params = []) {
  try {
    const [rows] = await dbCurricular.query(sql, params);
    return rows;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === 'ER_BAD_FIELD_ERROR') return [];
    throw err;
  }
}

export async function getCurricularFiltros() {
  const [facultades, carreras] = await Promise.all([
    curricularPrisma.facultad.findMany({
      where: { carrera: { some: {} } },
      orderBy: { nombre_facultad: 'asc' },
      select: { id_facultad: true, nombre_facultad: true },
    }),
    curricularPrisma.carrera.findMany({
      orderBy: { nombre_carrera: 'asc' },
      include: { facultad: { select: { id_facultad: true, nombre_facultad: true } } },
    }),
  ]);

  return {
    facultades,
    carreras: carreras.map(c => ({
      id_carrera: c.id_carrera,
      nombre_carrera: c.nombre_carrera,
      id_facultad: c.id_facultad,
      nombre_facultad: c.facultad.nombre_facultad,
    })),
  };
}

export async function getMallasCurriculares({ carrera, facultad } = {}) {
  const where = {};
  if (carrera || facultad) {
    where.carrera = {};
    if (carrera) where.carrera.nombre_carrera = carrera;
    if (facultad) where.carrera.facultad = { nombre_facultad: facultad };
  }

  const rows = await curricularPrisma.malla_version.findMany({
    where,
    orderBy: [{ es_vigente: 'desc' }, { anio_inicio: 'desc' }],
    include: {
      carrera: { include: { facultad: true } },
      _count: { select: { curso: true } },
    },
  });

  return rows
    .sort((a, b) => rankMallaForCurricularUx(a) - rankMallaForCurricularUx(b))
    .map(mapMalla);
}

export async function getMallaKpis(idMalla) {
  const cursos = await curricularPrisma.curso.findMany({
    where: { id_malla: Number(idMalla) },
    include: {
      analisis_curso: {
        orderBy: { analizado_en: 'desc' },
        take: 1,
      },
    },
  });

  const total = cursos.length;
  let enRiesgo = 0;
  let alineados = 0;
  let oportunidades = 0;
  let criticos = 0;
  const scores = [];

  for (const curso of cursos) {
    const analisis = latestAnalisis(curso);
    const estado = analisis.estado_alineacion;
    const score = analisis.score_alineacion === null || analisis.score_alineacion === undefined
      ? null
      : Number(analisis.score_alineacion);

    if (['critico', 'riesgo'].includes(estado)) enRiesgo += 1;
    if (estado === 'alineado') alineados += 1;
    if (estado === 'oportunidad') oportunidades += 1;
    if (score !== null) {
      scores.push(score);
      if (score < 60) criticos += 1;
    }
  }

  const promedio = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : null;

  return {
    total_cursos: total,
    en_riesgo: enRiesgo,
    alineados,
    oportunidades,
    criticos,
    pct_alineacion_promedio: promedio,
  };
}

export async function getMallaMapaRows(idMalla) {
  const cursos = await curricularPrisma.curso.findMany({
    where: { id_malla: Number(idMalla) },
    orderBy: [{ numero_ciclo: 'asc' }, { nro_orden: 'asc' }, { nombre_curso: 'asc' }],
    include: {
      analisis_curso: {
        orderBy: { analizado_en: 'desc' },
        take: 1,
      },
    },
  });

  return cursos.map(curso => {
    const analisis = latestAnalisis(curso);
    return {
      id_curso: curso.id_curso,
      nombre_curso: curso.nombre_curso,
      codigo_curso: curso.codigo_curso,
      numero_ciclo: curso.numero_ciclo,
      nro_orden: curso.nro_orden,
      creditos: curso.creditos,
      tipo_curso: curso.tipo_curso,
      horas_teoria: curso.horas_teoria,
      horas_practica: curso.horas_practica,
      horas_lab: curso.horas_lab,
      prerequisito: curso.prerequisito,
      clas_sunedu: curso.clas_sunedu,
      mencion: curso.mencion,
      creditos_minimos: curso.creditos_minimos,
      score_alineacion: analisis.score_alineacion,
      estado_alineacion: analisis.estado_alineacion,
      tendencias_impacto: stringifyJson(analisis.tendencias_impacto),
      brechas_detectadas: stringifyJson(analisis.brechas_detectadas),
      recomendaciones_ia: stringifyJson(analisis.recomendaciones_ia),
      analizado_en: analisis.analizado_en,
    };
  });
}

export async function getMallaVision360(idMalla) {
  const id = Number(idMalla);
  const malla = await curricularPrisma.malla_version.findUnique({
    where: { id_malla: id },
    include: {
      carrera: { include: { facultad: true } },
      _count: { select: { curso: true } },
    },
  });
  if (!malla) return null;

  const [
    fundamentos,
    detalles,
    sumillas,
    competencias,
    competenciaNiveles,
    cursoCompetencias,
    electivos,
    menciones,
    mencionCursos,
  ] = await Promise.all([
    optionalQuery('SELECT * FROM malla_fundamento_curricular WHERE id_malla = ? LIMIT 1', [id]),
    optionalQuery('SELECT * FROM curso_detalle_curricular WHERE id_curso IN (SELECT id_curso FROM curso WHERE id_malla = ?)', [id]),
    optionalQuery('SELECT * FROM curso_sumilla WHERE id_curso IN (SELECT id_curso FROM curso WHERE id_malla = ?)', [id]),
    optionalQuery('SELECT * FROM competencia_curricular WHERE id_malla = ? ORDER BY codigo_competencia', [id]),
    optionalQuery(
      `SELECT cn.*
         FROM competencia_nivel cn
         INNER JOIN competencia_curricular cc ON cc.id_competencia = cn.id_competencia
        WHERE cc.id_malla = ?
        ORDER BY cc.codigo_competencia, cn.nivel`,
      [id]
    ),
    optionalQuery(
      `SELECT ccu.id_curso, ccu.id_competencia, ccu.nivel, ccu.evidencia_textual
         FROM curso_competencia ccu
         INNER JOIN competencia_curricular cc ON cc.id_competencia = ccu.id_competencia
        WHERE cc.id_malla = ?`,
      [id]
    ),
    optionalQuery('SELECT * FROM electivo_catalogo WHERE id_malla = ? ORDER BY ciclo_sugerido, nombre_curso', [id]),
    optionalQuery('SELECT * FROM mencion_curricular WHERE id_malla = ? ORDER BY codigo_mencion, nombre_mencion', [id]),
    optionalQuery(
      `SELECT mc.*
         FROM mencion_curso mc
         INNER JOIN mencion_curricular m ON m.id_mencion = mc.id_mencion
        WHERE m.id_malla = ?
        ORDER BY m.codigo_mencion, mc.ciclo, mc.nro_orden, mc.nombre_curso`,
      [id]
    ),
  ]);

  const detallesByCurso = Object.fromEntries(detalles.map(row => [row.id_curso, row]));
  const sumillasByCurso = Object.fromEntries(sumillas.map(row => [row.id_curso, row]));
  const nivelesByCompetencia = competenciaNiveles.reduce((acc, row) => {
    acc[row.id_competencia] ||= [];
    acc[row.id_competencia].push({
      nivel: row.nivel,
      etiqueta: row.etiqueta,
      descripcion: row.descripcion,
    });
    return acc;
  }, {});
  const competenciasById = Object.fromEntries(competencias.map(row => [row.id_competencia, row]));
  const competenciasByCurso = cursoCompetencias.reduce((acc, row) => {
    const comp = competenciasById[row.id_competencia];
    if (!comp) return acc;
    acc[row.id_curso] ||= [];
    acc[row.id_curso].push({
      codigo: comp.codigo_competencia,
      nombre: comp.nombre_competencia,
      tipo: comp.tipo_competencia,
      nivel: row.nivel,
      evidencia: row.evidencia_textual,
    });
    return acc;
  }, {});
  const cursosByMencion = mencionCursos.reduce((acc, row) => {
    acc[row.id_mencion] ||= [];
    acc[row.id_mencion].push({
      codigoOficial: row.codigo_oficial,
      codigoCurso: row.codigo_curso,
      nombreCurso: row.nombre_curso,
      ciclo: row.ciclo,
      condicion: row.condicion,
      orden: row.nro_orden,
      idElectivo: row.id_electivo,
    });
    return acc;
  }, {});

  const fundamento = fundamentos[0] || null;
  let resumenPlan = null;
  if (fundamento?.resumen_plan_json) {
    try {
      resumenPlan = typeof fundamento.resumen_plan_json === 'string'
        ? JSON.parse(fundamento.resumen_plan_json)
        : fundamento.resumen_plan_json;
    } catch {
      resumenPlan = null;
    }
  }

  return {
    malla: {
      ...mapMalla(malla),
      periodo_aplicacion: malla.periodo_aplicacion ?? null,
      modalidad: malla.modalidad ?? null,
      total_creditos: malla.total_creditos ?? null,
    },
    fundamento: fundamento ? {
      codigoPrograma: fundamento.codigo_programa,
      gradoOtorgado: fundamento.grado_otorgado,
      tituloOtorgado: fundamento.titulo_otorgado,
      regimenEstudios: fundamento.regimen_estudios,
      duracionMeses: fundamento.duracion_meses,
      fechaAprobacion: fundamento.fecha_aprobacion,
      objetivoAcademico: fundamento.objetivo_academico,
      perfilIngreso: fundamento.perfil_ingreso,
      perfilEgreso: fundamento.perfil_egreso,
      objetivosEducacionales: fundamento.objetivos_educacionales,
      resumenPlan,
    } : null,
    competencias: competencias.map(row => ({
      idCompetencia: row.id_competencia,
      codigo: row.codigo_competencia,
      nombre: row.nombre_competencia,
      tipo: row.tipo_competencia,
      niveles: nivelesByCompetencia[row.id_competencia] || [],
    })),
    cursos: {
      detalles: detallesByCurso,
      sumillas: sumillasByCurso,
      competencias: competenciasByCurso,
    },
    electivos: electivos.map(row => ({
      idElectivo: row.id_electivo,
      cicloSugerido: row.ciclo_sugerido,
      codigoOficial: row.codigo_oficial,
      codigoCurso: row.codigo_curso,
      nombreCurso: row.nombre_curso,
      carreraCoordinacion: row.carrera_coordinacion,
      tipoEstudio: row.tipo_estudio,
      condicion: row.condicion,
      modalidadCurso: row.modalidad_curso,
      creditos: row.creditos,
      prerequisito: row.prerequisito,
      creditosMinimos: row.creditos_minimos,
      mencion: row.mencion,
    })),
    menciones: menciones.map(row => ({
      idMencion: row.id_mencion,
      codigo: row.codigo_mencion,
      nombre: row.nombre_mencion,
      tipo: row.tipo,
      cursos: cursosByMencion[row.id_mencion] || [],
    })),
  };
}

async function setMallaVigente(idMalla, idCarrera) {
  await curricularPrisma.$transaction([
    curricularPrisma.malla_version.updateMany({
      where: { id_carrera: idCarrera, NOT: { id_malla: idMalla } },
      data: { es_vigente: false },
    }),
    curricularPrisma.malla_version.update({
      where: { id_malla: idMalla },
      data: { es_vigente: true },
    }),
  ]);
}

async function getOrCreateFacultad(nombreFacultad) {
  const row = await curricularPrisma.facultad.findUnique({
    where: { nombre_facultad: nombreFacultad },
    select: { id_facultad: true },
  });
  if (row) return row.id_facultad;
  const created = await curricularPrisma.facultad.create({
    data: { nombre_facultad: nombreFacultad },
    select: { id_facultad: true },
  });
  return created.id_facultad;
}

async function getOrCreateCarrera({ nombreCarrera, idFacultad }) {
  const row = await curricularPrisma.carrera.findFirst({
    where: { nombre_carrera: nombreCarrera, id_facultad: idFacultad },
    select: { id_carrera: true },
  });
  if (row) return row.id_carrera;
  const created = await curricularPrisma.carrera.create({
    data: { nombre_carrera: nombreCarrera, id_facultad: idFacultad },
    select: { id_carrera: true },
  });
  return created.id_carrera;
}

async function getOrCreateMalla({ idCarrera, nombreVersion, anioInicio, esVigente }) {
  const row = await curricularPrisma.malla_version.findFirst({
    where: { id_carrera: idCarrera, nombre_version: nombreVersion },
    select: { id_malla: true },
  });
  if (row) {
    if (esVigente) await setMallaVigente(row.id_malla, idCarrera);
    return row.id_malla;
  }

  const created = await curricularPrisma.malla_version.create({
    data: {
      id_carrera: idCarrera,
      nombre_version: nombreVersion,
      anio_inicio: anioInicio || new Date().getFullYear(),
      es_vigente: toBoolean(esVigente),
      fuente_carga: 'EXCEL',
    },
    select: { id_malla: true },
  });
  if (esVigente) await setMallaVigente(created.id_malla, idCarrera);
  return created.id_malla;
}

export async function replaceCursosDeMalla(idMalla, cursos) {
  return curricularPrisma.$transaction(async (tx) => {
    await tx.curso.deleteMany({ where: { id_malla: idMalla } });
    let orden = 1;
    for (const c of cursos) {
      await tx.curso.create({
        data: {
          id_malla: idMalla,
          nombre_curso: c.nombreCurso,
          numero_ciclo: c.numeroCiclo,
          nro_orden: orden++,
          codigo_curso: c.codigoCurso ?? null,
          tipo_curso: c.tipoCurso === 'Elect.' ? 'Electivo' : 'Obligatorio',
        },
      });
    }
    return cursos.length;
  });
}

async function upsertCurso({ idMalla, nombreCurso, numeroCiclo, creditos, tipoCurso }) {
  const row = await curricularPrisma.curso.findFirst({
    where: { id_malla: idMalla, nombre_curso: nombreCurso, numero_ciclo: numeroCiclo },
    select: { id_curso: true },
  });
  if (row) {
    await curricularPrisma.curso.update({
      where: { id_curso: row.id_curso },
      data: { creditos, tipo_curso: tipoCurso },
    });
    return row.id_curso;
  }
  const created = await curricularPrisma.curso.create({
    data: {
      id_malla: idMalla,
      nombre_curso: nombreCurso,
      numero_ciclo: numeroCiclo,
      creditos,
      tipo_curso: tipoCurso,
    },
    select: { id_curso: true },
  });
  return created.id_curso;
}

export async function importCurricularRows(rows, col) {
  const facCache = {};
  const carCache = {};
  const mallaCache = {};
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nomFac = col(row, 'FACULTAD', 'Facultad');
      const nomCar = col(row, 'CARRERA', 'Carrera');
      const nomVersion = col(row, 'VERSION_MALLA', 'Version_Malla', 'VERSION MALLA');
      const anioInicio = parseInt(col(row, 'ANIO_INICIO', 'Anio_Inicio', 'AÑO_INICIO') ?? '0', 10);
      const esVigente = /^(si|sí|s|yes|1|true)$/i.test(col(row, 'ES_VIGENTE', 'Es_Vigente') ?? '') ? 1 : 0;
      const numeroCiclo = parseInt(col(row, 'CICLO', 'Ciclo') ?? '0', 10);
      const nomCurso = col(row, 'NOMBRE_CURSO', 'Nombre_Curso', 'NOMBRE CURSO');
      const tipoCurso = col(row, 'TIPO_CURSO', 'Tipo_Curso', 'TIPO CURSO') ?? 'Obligatorio';
      const creditos = parseInt(col(row, 'CREDITOS', 'Créditos', 'Creditos') ?? '0', 10) || null;

      if (!nomFac || !nomCar || !nomVersion || !nomCurso || !numeroCiclo) {
        skipped++;
        continue;
      }

      if (!facCache[nomFac]) facCache[nomFac] = await getOrCreateFacultad(nomFac);
      const idFacultad = facCache[nomFac];

      const carKey = `${nomCar}|${idFacultad}`;
      if (!carCache[carKey]) carCache[carKey] = await getOrCreateCarrera({ nombreCarrera: nomCar, idFacultad });
      const idCarrera = carCache[carKey];

      const mallaKey = `${idCarrera}|${nomVersion}`;
      if (!mallaCache[mallaKey]) {
        mallaCache[mallaKey] = await getOrCreateMalla({
          idCarrera,
          nombreVersion: nomVersion,
          anioInicio,
          esVigente,
        });
      }

      await upsertCurso({
        idMalla: mallaCache[mallaKey],
        nombreCurso: nomCurso,
        numeroCiclo,
        creditos,
        tipoCurso,
      });
      imported++;
    } catch (err) {
      errors.push({ fila: i + 2, error: err.message });
      if (errors.length >= 20) break;
    }
  }

  return { imported, skipped, errors };
}

export async function ensureSilaboSupport() {
  await curricularPrisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS silabo (
      id_silabo VARCHAR(36) NOT NULL PRIMARY KEY,
      id_curso INT NOT NULL,
      titulo VARCHAR(200) NOT NULL,
      url_archivo TEXT NULL,
      contenido TEXT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_curso (id_curso)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

export async function getSilabos({ q = '' } = {}) {
  const term = q.trim();
  let cursoIds = [];

  if (term) {
    const cursos = await curricularPrisma.curso.findMany({
      where: {
        OR: [
          { nombre_curso: { contains: term } },
          { codigo_curso: { contains: term } },
        ],
      },
      select: { id_curso: true },
      take: 200,
    });
    cursoIds = cursos.map(c => c.id_curso);
  }

  const silabos = await curricularPrisma.silabo.findMany({
    where: term
      ? { OR: [{ titulo: { contains: term } }, { id_curso: { in: cursoIds } }] }
      : {},
    orderBy: { fecha_actualizacion: 'desc' },
    take: 200,
  });

  const cursos = await curricularPrisma.curso.findMany({
    where: { id_curso: { in: [...new Set(silabos.map(s => s.id_curso))] } },
    select: { id_curso: true, nombre_curso: true, codigo_curso: true },
  });
  const cursosById = new Map(cursos.map(c => [c.id_curso, c]));

  return silabos.map(s => ({
    id_silabo: s.id_silabo,
    id_curso: s.id_curso,
    titulo: s.titulo,
    url_archivo: s.url_archivo,
    contenido: s.contenido,
    activo: s.activo,
    fecha_actualizacion: s.fecha_actualizacion,
    nombre_curso: cursosById.get(s.id_curso)?.nombre_curso || null,
    codigo_curso: cursosById.get(s.id_curso)?.codigo_curso || null,
  }));
}

export async function searchCursos(q) {
  return curricularPrisma.curso.findMany({
    where: {
      OR: [
        { nombre_curso: { contains: q } },
        { codigo_curso: { contains: q } },
      ],
    },
    select: { id_curso: true, nombre_curso: true, codigo_curso: true },
    take: 20,
  });
}

export async function getCursoById(idCurso) {
  return curricularPrisma.curso.findUnique({
    where: { id_curso: Number(idCurso) },
    select: { id_curso: true },
  });
}

export async function createSilabo({ id, idCurso, titulo, urlArchivo, contenido }) {
  await curricularPrisma.silabo.create({
    data: {
      id_silabo: id,
      id_curso: Number(idCurso),
      titulo,
      url_archivo: urlArchivo || null,
      contenido: contenido || null,
      activo: true,
    },
  });
}

export async function getSilaboById(id) {
  return curricularPrisma.silabo.findUnique({
    where: { id_silabo: id },
    select: { id_silabo: true, titulo: true },
  });
}

export async function updateSilabo({ id, titulo, urlArchivo, contenido }) {
  await curricularPrisma.silabo.update({
    where: { id_silabo: id },
    data: {
      titulo,
      url_archivo: urlArchivo || null,
      contenido: contenido || null,
      fecha_actualizacion: new Date(),
    },
  });
}

export async function updateSilaboEstado({ id, activo }) {
  await curricularPrisma.silabo.update({
    where: { id_silabo: id },
    data: { activo: Boolean(activo) },
  });
}
