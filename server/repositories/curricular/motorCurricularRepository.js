import { curricularPrisma } from '../../prismaClient.js';

let schemaReady = null;

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function impactoToRow(impacto, curso = null) {
  return {
    ...impacto,
    score_impacto: numberOrNull(impacto.score_impacto),
    nombre_curso: curso?.nombre_curso || null,
    numero_ciclo: curso?.numero_ciclo || null,
  };
}

function brechaToRow(brecha, impacto = null, curso = null) {
  return {
    ...brecha,
    titulo_impacto: impacto?.titulo_impacto || null,
    score_impacto: numberOrNull(impacto?.score_impacto),
    nivel_impacto: impacto?.nivel_impacto || null,
    nombre_curso: curso?.nombre_curso || null,
    numero_ciclo: curso?.numero_ciclo || null,
  };
}

function propuestaToRow(propuesta, brecha = null, curso = null) {
  return {
    ...propuesta,
    descripcion_brecha: brecha?.descripcion_brecha || null,
    tipo_brecha: brecha?.tipo_brecha || null,
    prioridad_brecha: brecha?.prioridad || null,
    nombre_curso: curso?.nombre_curso || null,
    numero_ciclo: curso?.numero_ciclo || null,
  };
}

function prioridadRank(prioridad) {
  return { critica: 0, alta: 1, media: 2, baja: 3 }[prioridad] ?? 9;
}

function estadoPropuestaRank(estado) {
  return { pendiente: 0, observada: 1, aprobada: 2, rechazada: 3 }[estado] ?? 9;
}

async function cursosById(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(Number))];
  if (!uniqueIds.length) return new Map();
  const cursos = await curricularPrisma.curso.findMany({
    where: { id_curso: { in: uniqueIds } },
    select: { id_curso: true, nombre_curso: true, numero_ciclo: true },
  });
  return new Map(cursos.map(c => [c.id_curso, c]));
}

async function impactosById(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(Number))];
  if (!uniqueIds.length) return new Map();
  const impactos = await curricularPrisma.impacto_curricular.findMany({
    where: { id_impacto: { in: uniqueIds } },
  });
  return new Map(impactos.map(i => [i.id_impacto, i]));
}

async function brechasById(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(Number))];
  if (!uniqueIds.length) return new Map();
  const brechas = await curricularPrisma.brecha_curricular.findMany({
    where: { id_brecha: { in: uniqueIds } },
  });
  return new Map(brechas.map(b => [b.id_brecha, b]));
}

export async function ensureMotorSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS evidencia_curricular (
        id_evidencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        modulo_origen ENUM('radar','empleabilidad','mercado_laboral','benchmarking') NOT NULL,
        tipo_evidencia ENUM('senal','tendencia','escenario','oferta_laboral','dato_empleabilidad','benchmark_universitario','informe_carrera') NOT NULL,
        referencia_id INT UNSIGNED NULL,
        titulo_evidencia VARCHAR(300) NOT NULL,
        descripcion_evidencia TEXT NULL,
        fuente_url VARCHAR(1000) NULL,
        fecha_fuente DATE NULL,
        nivel_confianza DECIMAL(5,2) NOT NULL DEFAULT 0.50,
        estado_verificacion ENUM('pendiente','verificado','rechazado') NOT NULL DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS impacto_curricular (
        id_impacto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_carrera INT UNSIGNED NOT NULL,
        id_malla_version INT UNSIGNED NOT NULL,
        id_curso INT UNSIGNED NULL,
        titulo_impacto VARCHAR(300) NOT NULL,
        descripcion_impacto TEXT NULL,
        nivel_impacto ENUM('bajo','medio','alto','critico') NOT NULL DEFAULT 'bajo',
        score_impacto DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        estado ENUM('detectado','en_revision','aprobado','rechazado') NOT NULL DEFAULT 'detectado',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_imp_carrera (id_carrera),
        KEY idx_imp_malla (id_malla_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS impacto_curricular_evidencia (
        id_impacto INT UNSIGNED NOT NULL,
        id_evidencia INT UNSIGNED NOT NULL,
        peso DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        justificacion_relacion TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_impacto, id_evidencia)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS brecha_curricular (
        id_brecha INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_impacto INT UNSIGNED NOT NULL,
        id_carrera INT UNSIGNED NOT NULL,
        id_curso INT UNSIGNED NULL,
        tipo_brecha ENUM('competencia_faltante','contenido_desactualizado','baja_cobertura','falta_practica','falta_herramienta','desalineacion_mercado','otro') NOT NULL DEFAULT 'otro',
        descripcion_brecha TEXT NOT NULL,
        competencia_afectada VARCHAR(300) NULL,
        evidencia_resumen TEXT NULL,
        prioridad ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_brecha_impacto (id_impacto),
        KEY idx_brecha_carrera (id_carrera)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS propuesta_curricular (
        id_propuesta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_brecha INT UNSIGNED NOT NULL,
        id_carrera INT UNSIGNED NOT NULL,
        id_malla_version_origen INT UNSIGNED NOT NULL,
        tipo_propuesta ENUM('actualizar_silabo','agregar_unidad','modificar_unidad','aumentar_horas','crear_curso_electivo','crear_curso_obligatorio','mover_curso_ciclo','conectar_cursos','actualizar_competencia') NOT NULL,
        titulo_propuesta VARCHAR(300) NOT NULL,
        descripcion_propuesta TEXT NOT NULL,
        justificacion TEXT NOT NULL,
        impacto_esperado TEXT NULL,
        estado_revision ENUM('pendiente','aprobada','rechazada','observada') NOT NULL DEFAULT 'pendiente',
        usuario_creador VARCHAR(120) NULL,
        usuario_revisor VARCHAR(120) NULL,
        fecha_revision DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_prop_brecha (id_brecha),
        KEY idx_prop_carrera (id_carrera),
        KEY idx_prop_estado (estado_revision)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS malla_version_propuesta (
        id_malla_version_propuesta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_malla_version_origen INT UNSIGNED NOT NULL,
        id_propuesta INT UNSIGNED NOT NULL,
        nombre_version VARCHAR(200) NOT NULL,
        descripcion_cambios TEXT NULL,
        estado ENUM('borrador','en_revision','aprobada','rechazada') NOT NULL DEFAULT 'borrador',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_mvp_origen (id_malla_version_origen)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const sql of stmts) await curricularPrisma.$executeRawUnsafe(sql);
  })();
  return schemaReady;
}

export async function getImpactosCurriculares({ idCarrera, idMalla }) {
  const impactos = await curricularPrisma.impacto_curricular.findMany({
    where: {
      id_carrera: Number(idCarrera),
      ...(idMalla ? { id_malla_version: Number(idMalla) } : {}),
    },
    orderBy: [{ score_impacto: 'desc' }, { created_at: 'desc' }],
  });
  const cursos = await cursosById(impactos.map(i => i.id_curso));
  return impactos.map(i => impactoToRow(i, cursos.get(i.id_curso)));
}

export async function getBrechasCurriculares({ idCarrera, idMalla, prioridad }) {
  const impactos = idMalla
    ? await curricularPrisma.impacto_curricular.findMany({
        where: { id_carrera: Number(idCarrera), id_malla_version: Number(idMalla) },
        select: { id_impacto: true },
      })
    : null;
  const impactIds = impactos?.map(i => i.id_impacto);

  const brechas = await curricularPrisma.brecha_curricular.findMany({
    where: {
      id_carrera: Number(idCarrera),
      ...(prioridad ? { prioridad } : {}),
      ...(impactIds ? { id_impacto: { in: impactIds } } : {}),
    },
    orderBy: { created_at: 'desc' },
  });
  const [impactosMap, cursos] = await Promise.all([
    impactosById(brechas.map(b => b.id_impacto)),
    cursosById(brechas.map(b => b.id_curso)),
  ]);

  return brechas
    .map(b => brechaToRow(b, impactosMap.get(b.id_impacto), cursos.get(b.id_curso)))
    .sort((a, b) => prioridadRank(a.prioridad) - prioridadRank(b.prioridad)
      || new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export async function getPropuestasCurriculares({ idCarrera, estado, idMalla }) {
  const propuestas = await curricularPrisma.propuesta_curricular.findMany({
    where: {
      id_carrera: Number(idCarrera),
      ...(estado ? { estado_revision: estado } : {}),
      ...(idMalla ? { id_malla_version_origen: Number(idMalla) } : {}),
    },
  });
  const brechasMap = await brechasById(propuestas.map(p => p.id_brecha));
  const cursos = await cursosById([...brechasMap.values()].map(b => b.id_curso));

  return propuestas
    .map(p => {
      const brecha = brechasMap.get(p.id_brecha);
      return propuestaToRow(p, brecha, cursos.get(brecha?.id_curso));
    })
    .sort((a, b) => estadoPropuestaRank(a.estado_revision) - estadoPropuestaRank(b.estado_revision)
      || prioridadRank(a.prioridad_brecha) - prioridadRank(b.prioridad_brecha));
}

export async function createPropuestaCurricular(data) {
  const created = await curricularPrisma.propuesta_curricular.create({
    data: {
      id_brecha: Number(data.id_brecha),
      id_carrera: Number(data.id_carrera),
      id_malla_version_origen: Number(data.id_malla_version_origen),
      tipo_propuesta: data.tipo_propuesta,
      titulo_propuesta: data.titulo_propuesta,
      descripcion_propuesta: data.descripcion_propuesta,
      justificacion: data.justificacion,
      impacto_esperado: data.impacto_esperado ?? null,
      usuario_creador: data.usuario,
    },
    select: { id_propuesta: true },
  });
  return created.id_propuesta;
}

export async function updatePropuestaEstado({ id, estadoRevision, observacion, usuario }) {
  const current = await curricularPrisma.propuesta_curricular.findUnique({
    where: { id_propuesta: Number(id) },
    select: { impacto_esperado: true },
  });
  const nextImpacto = observacion
    ? `${current?.impacto_esperado || ''} | Obs: ${observacion}`
    : current?.impacto_esperado;

  await curricularPrisma.propuesta_curricular.update({
    where: { id_propuesta: Number(id) },
    data: {
      estado_revision: estadoRevision,
      usuario_revisor: usuario,
      fecha_revision: new Date(),
      impacto_esperado: nextImpacto,
      updated_at: new Date(),
    },
  });
}

export async function getPropuestaForVersion(id) {
  const propuesta = await curricularPrisma.propuesta_curricular.findUnique({
    where: { id_propuesta: Number(id) },
  });
  if (!propuesta) return null;
  const brecha = await curricularPrisma.brecha_curricular.findUnique({
    where: { id_brecha: propuesta.id_brecha },
    select: { descripcion_brecha: true, id_curso: true },
  });
  const curso = brecha?.id_curso
    ? await curricularPrisma.curso.findUnique({ where: { id_curso: brecha.id_curso }, select: { nombre_curso: true } })
    : null;

  return {
    ...propuesta,
    descripcion_brecha: brecha?.descripcion_brecha || null,
    nombre_curso: curso?.nombre_curso || null,
  };
}

export async function getMallaVersionName(idMalla) {
  const row = await curricularPrisma.malla_version.findUnique({
    where: { id_malla: Number(idMalla) },
    select: { nombre_version: true },
  });
  return row?.nombre_version || null;
}

export async function createMallaVersionPropuesta({ idMallaVersionOrigen, idPropuesta, nombreVersion, descripcionCambios }) {
  const created = await curricularPrisma.malla_version_propuesta.create({
    data: {
      id_malla_version_origen: Number(idMallaVersionOrigen),
      id_propuesta: Number(idPropuesta),
      nombre_version: nombreVersion,
      descripcion_cambios: descripcionCambios,
      estado: 'borrador',
    },
    select: { id_malla_version_propuesta: true },
  });
  return created.id_malla_version_propuesta;
}

export async function getEvidenciasImpacto(idImpacto) {
  const relaciones = await curricularPrisma.impacto_curricular_evidencia.findMany({
    where: { id_impacto: Number(idImpacto) },
    orderBy: { peso: 'desc' },
  });
  const evidencias = await curricularPrisma.evidencia_curricular.findMany({
    where: { id_evidencia: { in: relaciones.map(r => r.id_evidencia) } },
  });
  const evidenciasMap = new Map(evidencias.map(e => [e.id_evidencia, e]));

  return relaciones.map(rel => ({
    ...evidenciasMap.get(rel.id_evidencia),
    nivel_confianza: numberOrNull(evidenciasMap.get(rel.id_evidencia)?.nivel_confianza),
    peso: numberOrNull(rel.peso),
    justificacion_relacion: rel.justificacion_relacion,
  })).filter(row => row.id_evidencia);
}

export async function getKpisImpacto({ idCarrera, idMalla }) {
  const impactos = await curricularPrisma.impacto_curricular.findMany({
    where: {
      id_carrera: Number(idCarrera),
      ...(idMalla ? { id_malla_version: Number(idMalla) } : {}),
    },
  });
  const impactIds = impactos.map(i => i.id_impacto);
  const brechas = impactIds.length
    ? await curricularPrisma.brecha_curricular.findMany({ where: { id_impacto: { in: impactIds } } })
    : [];
  const brechaIds = brechas.map(b => b.id_brecha);
  const propuestas = brechaIds.length
    ? await curricularPrisma.propuesta_curricular.findMany({ where: { id_brecha: { in: brechaIds } } })
    : [];
  const evidencias = impactIds.length
    ? await curricularPrisma.impacto_curricular_evidencia.findMany({ where: { id_impacto: { in: impactIds } } })
    : [];
  const scores = impactos.map(i => numberOrNull(i.score_impacto)).filter(score => score !== null);

  return {
    total_impactos: impactos.length,
    total_brechas: brechas.length,
    propuestas_pendientes: propuestas.filter(p => p.estado_revision === 'pendiente').length,
    propuestas_aprobadas: propuestas.filter(p => p.estado_revision === 'aprobada').length,
    evidencias_verificadas: new Set(evidencias.map(e => e.id_evidencia)).size,
    score_promedio: scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null,
    ultima_ejecucion: impactos.reduce((latest, item) => {
      if (!item.created_at) return latest;
      return !latest || item.created_at > latest ? item.created_at : latest;
    }, null),
  };
}
