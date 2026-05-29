import { Router } from 'express';
import db from '../db_empl.js';
import { serverError } from '../middleware/errorHandler.js';
import { mercadoLaboralSeed, metodologiaMercadoLaboralSeed } from '../data/mercadoLaboralSeed.js';
import { CARRERAS_FALTANTES } from '../data/mercadoCarrerasFaltantes.js';

const router = Router();

let bootPromise = null;

export async function ensureMercadoLaboralReady() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await ensureSchema();
      await seedIfEmpty();
      await seedMissingCareers();
    })();
  }
  return bootPromise;
}

async function seedMissingCareers() {
  for (const carrera of CARRERAS_FALTANTES) {
    const [[exists]] = await db.query(
      'SELECT id_informe FROM mercado_informe WHERE nombre_carrera = ? LIMIT 1',
      [carrera.nombre_carrera]
    );
    if (exists) continue;

    const [result] = await db.query(
      `INSERT INTO mercado_informe
        (nombre_facultad, nombre_carrera, periodo, titulo_header, descripcion_header,
         insight_header, descripcion, objetivo_final)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        carrera.nombre_facultad, carrera.nombre_carrera, carrera.periodo,
        carrera.titulo_header, carrera.descripcion_header,
        carrera.insight_header, carrera.descripcion, carrera.objetivo_final,
      ]
    );
    const idInforme = result.insertId;
    await seedChildren(idInforme, {
      puestos:                  carrera.puestos,
      habilidades:              carrera.habilidades,
      herramientas:             carrera.herramientas,
      tendencias:               carrera.tendencias,
      recomendacionesDocentes:  carrera.recomendacionesDocentes,
      recomendacionesCurriculares: carrera.recomendacionesCurriculares,
    });
    console.log(`[MERCADO] Carrera insertada: ${carrera.nombre_carrera}`);
  }
}

async function ensureSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS mercado_informe (
      id_informe INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_carrera INT UNSIGNED NULL,
      nombre_facultad VARCHAR(180) NOT NULL,
      nombre_carrera VARCHAR(200) NOT NULL,
      periodo VARCHAR(80) NOT NULL,
      titulo_header VARCHAR(220) NULL,
      descripcion_header TEXT NULL,
      insight_header TEXT NULL,
      descripcion TEXT NULL,
      objetivo_final TEXT NULL,
      documento_informe_url VARCHAR(500) NULL,
      fuente VARCHAR(160) NOT NULL DEFAULT 'Seed ZIP informes mercado laboral',
      origen_datos VARCHAR(40) NOT NULL DEFAULT 'semilla',
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_mercado_informe (nombre_carrera, periodo),
      KEY idx_mercado_facultad (nombre_facultad),
      KEY idx_mercado_carrera (nombre_carrera)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_puesto_top (
      id_puesto_top INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_informe INT UNSIGNED NOT NULL,
      orden TINYINT UNSIGNED NOT NULL,
      nombre_puesto VARCHAR(220) NOT NULL,
      descripcion TEXT NULL,
      vacantes_texto VARCHAR(80) NULL,
      fuente_dato VARCHAR(40) NOT NULL DEFAULT 'mercado',
      UNIQUE KEY uq_mercado_puesto_orden (id_informe, orden),
      CONSTRAINT fk_mercado_puesto_informe FOREIGN KEY (id_informe) REFERENCES mercado_informe(id_informe) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_habilidad_categoria (
      id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_informe INT UNSIGNED NOT NULL,
      orden TINYINT UNSIGNED NOT NULL,
      categoria VARCHAR(180) NOT NULL,
      origen_datos VARCHAR(40) NOT NULL DEFAULT 'curado',
      UNIQUE KEY uq_mercado_hab_categoria (id_informe, orden),
      CONSTRAINT fk_mercado_habcat_informe FOREIGN KEY (id_informe) REFERENCES mercado_informe(id_informe) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_habilidad_item (
      id_habilidad INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_categoria INT UNSIGNED NOT NULL,
      orden TINYINT UNSIGNED NOT NULL,
      habilidad VARCHAR(220) NOT NULL,
      UNIQUE KEY uq_mercado_habilidad (id_categoria, orden),
      CONSTRAINT fk_mercado_habilidad_categoria FOREIGN KEY (id_categoria) REFERENCES mercado_habilidad_categoria(id_categoria) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_herramienta (
      id_herramienta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_informe INT UNSIGNED NOT NULL,
      orden TINYINT UNSIGNED NOT NULL,
      nombre VARCHAR(180) NOT NULL,
      descripcion TEXT NULL,
      origen_datos VARCHAR(40) NOT NULL DEFAULT 'curado',
      UNIQUE KEY uq_mercado_herramienta (id_informe, orden),
      CONSTRAINT fk_mercado_herramienta_informe FOREIGN KEY (id_informe) REFERENCES mercado_informe(id_informe) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_tendencia (
      id_tendencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_informe INT UNSIGNED NOT NULL,
      orden TINYINT UNSIGNED NOT NULL,
      titulo VARCHAR(180) NOT NULL,
      descripcion TEXT NULL,
      origen_datos VARCHAR(40) NOT NULL DEFAULT 'curado',
      UNIQUE KEY uq_mercado_tendencia (id_informe, orden),
      CONSTRAINT fk_mercado_tendencia_informe FOREIGN KEY (id_informe) REFERENCES mercado_informe(id_informe) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_recomendacion (
      id_recomendacion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      id_informe INT UNSIGNED NOT NULL,
      tipo VARCHAR(40) NOT NULL,
      orden TINYINT UNSIGNED NOT NULL,
      texto TEXT NOT NULL,
      origen_datos VARCHAR(40) NOT NULL DEFAULT 'curado',
      UNIQUE KEY uq_mercado_recomendacion (id_informe, tipo, orden),
      CONSTRAINT fk_mercado_recomendacion_informe FOREIGN KEY (id_informe) REFERENCES mercado_informe(id_informe) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS mercado_metodologia (
      id_metodologia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      orden TINYINT UNSIGNED NOT NULL,
      titulo VARCHAR(160) NOT NULL,
      descripcion TEXT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_mercado_metodologia_orden (orden)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const sql of statements) await db.query(sql);
}

async function seedIfEmpty() {
  const expectedTotal = mercadoLaboralSeed.reduce((sum, facultad) => sum + facultad.carreras.length, 0);
  const [[row]] = await db.query('SELECT COUNT(*) AS total FROM mercado_informe');
  if (Number(row.total) === expectedTotal) return;

  await db.query('DELETE FROM mercado_informe');
  await db.query('DELETE FROM mercado_metodologia');

  for (const [index, step] of metodologiaMercadoLaboralSeed.entries()) {
    await db.query(
      `INSERT INTO mercado_metodologia (orden, titulo, descripcion)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), descripcion=VALUES(descripcion)`,
      [step.orden || index + 1, step.titulo, step.descripcion]
    );
  }

  for (const facultad of mercadoLaboralSeed) {
    for (const carrera of facultad.carreras) {
      const idCarrera = await resolveCarreraId(facultad.nombre, carrera.nombre);
      const [result] = await db.query(
        `INSERT INTO mercado_informe
          (id_carrera, nombre_facultad, nombre_carrera, periodo, titulo_header, descripcion_header,
           insight_header, descripcion, objetivo_final, documento_informe_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id_informe=LAST_INSERT_ID(id_informe),
           id_carrera=VALUES(id_carrera),
           nombre_facultad=VALUES(nombre_facultad),
           titulo_header=VALUES(titulo_header),
           descripcion_header=VALUES(descripcion_header),
           insight_header=VALUES(insight_header),
           descripcion=VALUES(descripcion),
           objetivo_final=VALUES(objetivo_final),
           documento_informe_url=VALUES(documento_informe_url)`,
        [
          idCarrera,
          facultad.nombre,
          carrera.nombre,
          carrera.periodo,
          carrera.tituloHeader ?? carrera.nombre.toUpperCase(),
          carrera.descripcionHeader ?? carrera.descripcion,
          carrera.insightHeader ?? null,
          carrera.descripcion ?? null,
          carrera.objetivoFinal ?? null,
          carrera.documentoInformeUrl ?? null,
        ]
      );
      const idInforme = result.insertId;
      await seedChildren(idInforme, carrera);
    }
  }
}

async function seedChildren(idInforme, carrera) {
  await Promise.all([
    db.query('DELETE FROM mercado_puesto_top WHERE id_informe=?', [idInforme]),
    db.query('DELETE FROM mercado_herramienta WHERE id_informe=?', [idInforme]),
    db.query('DELETE FROM mercado_tendencia WHERE id_informe=?', [idInforme]),
    db.query('DELETE FROM mercado_recomendacion WHERE id_informe=?', [idInforme]),
    db.query('DELETE FROM mercado_habilidad_categoria WHERE id_informe=?', [idInforme]),
  ]);

  for (const puesto of carrera.puestos ?? []) {
    await db.query(
      `INSERT INTO mercado_puesto_top (id_informe, orden, nombre_puesto, descripcion, vacantes_texto)
       VALUES (?, ?, ?, ?, ?)`,
      [idInforme, puesto.id, puesto.nombre, puesto.descripcion ?? null, puesto.vacantes ?? null]
    );
  }

  for (let i = 0; i < (carrera.habilidades ?? []).length; i++) {
    const cat = carrera.habilidades[i];
    const [catResult] = await db.query(
      `INSERT INTO mercado_habilidad_categoria (id_informe, orden, categoria)
       VALUES (?, ?, ?)`,
      [idInforme, i + 1, cat.categoria]
    );
    for (let j = 0; j < (cat.habilidades ?? []).length; j++) {
      await db.query(
        `INSERT INTO mercado_habilidad_item (id_categoria, orden, habilidad)
         VALUES (?, ?, ?)`,
        [catResult.insertId, j + 1, cat.habilidades[j]]
      );
    }
  }

  for (let i = 0; i < (carrera.herramientas ?? []).length; i++) {
    const item = carrera.herramientas[i];
    await db.query(
      `INSERT INTO mercado_herramienta (id_informe, orden, nombre, descripcion)
       VALUES (?, ?, ?, ?)`,
      [idInforme, i + 1, item.nombre, item.descripcion ?? null]
    );
  }

  for (let i = 0; i < (carrera.tendencias ?? []).length; i++) {
    const item = carrera.tendencias[i];
    await db.query(
      `INSERT INTO mercado_tendencia (id_informe, orden, titulo, descripcion)
       VALUES (?, ?, ?, ?)`,
      [idInforme, i + 1, item.titulo, item.descripcion ?? null]
    );
  }

  await seedRecomendaciones(idInforme, 'estudiante_egresado', carrera.recomendacionesDocentes);
  await seedRecomendaciones(idInforme, 'diseno_curricular', carrera.recomendacionesCurriculares);
}

async function seedRecomendaciones(idInforme, tipo, items = []) {
  for (let i = 0; i < items.length; i++) {
    await db.query(
      `INSERT INTO mercado_recomendacion (id_informe, tipo, orden, texto)
       VALUES (?, ?, ?, ?)`,
      [idInforme, tipo, i + 1, items[i]]
    );
  }
}

async function resolveCarreraId(nombreFacultad, nombreCarrera) {
  const [rows] = await db.query(
    `SELECT ca.id_carrera
     FROM carrera ca
     JOIN facultad f ON f.id_facultad = ca.id_facultad
     WHERE ca.nombre_carrera = ? AND f.nombre_facultad = ?
     LIMIT 1`,
    [nombreCarrera, nombreFacultad]
  );
  return rows.length ? rows[0].id_carrera : null;
}

function buildWhere({ carrera, facultad, anio, anios }) {
  const where = ['ea.encuestado = 1'];
  const params = [];
  if (carrera) {
    where.push('ca.nombre_carrera = ?');
    params.push(carrera);
  }
  if (facultad) {
    where.push('f.nombre_facultad = ?');
    params.push(facultad);
  }
  if (anios) {
    const list = String(anios).split(',').map(s => s.trim()).filter(s => /^20\d{2}$/.test(s));
    if (list.length) {
      where.push(`ea.anio_encuesta IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  } else if (anio && /^20\d{2}$/.test(String(anio))) {
    where.push('ea.anio_encuesta = ?');
    params.push(anio);
  }
  return { whereSQL: `WHERE ${where.join(' AND ')}`, params };
}

async function getDatosEgresados(query, informe) {
  const { whereSQL, params } = buildWhere({
    ...query,
    carrera: query.carrera || informe.nombre_carrera,
    facultad: query.facultad || informe.nombre_facultad,
  });

  const baseJoin = `
    FROM encuesta_anual ea
    JOIN egresado eg ON eg.id_egresado = ea.id_egresado
    JOIN carrera ca ON ca.id_carrera = eg.id_carrera
    JOIN facultad f ON f.id_facultad = ca.id_facultad
  `;

  const [[resumen], [topPuestos], [topRubros], [topAreas], [rangos], [niveles]] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) AS totalEncuestas,
        SUM(CASE WHEN ea.trabaja = 1 THEN 1 ELSE 0 END) AS egresadosTrabajando,
        SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 ELSE 0 END) AS egresadosAfinidad,
        SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 ELSE 0 END) AS egresadosEmprendedores,
        ROUND(SUM(CASE WHEN ea.trabaja = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS tasaEmpleabilidad,
        ROUND(SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS tasaAfinidad
      ${baseJoin}
      ${whereSQL}
    `, params),
    db.query(`
      SELECT COALESCE(cp.puesto_oficial, e.puesto_libre, 'Sin puesto registrado') AS nombre,
             COUNT(*) AS total,
             ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
      ${baseJoin}
      JOIN empleo e ON e.id_encuesta = ea.id_encuesta
      LEFT JOIN catalogo_puesto cp ON cp.id_puesto = e.id_puesto
      ${whereSQL} AND ea.trabaja = 1
      GROUP BY nombre
      ORDER BY total DESC
      LIMIT 5
    `, params),
    db.query(`
      SELECT COALESCE(NULLIF(e.rubro, ''), 'Sin rubro registrado') AS nombre,
             COUNT(*) AS total,
             ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
      ${baseJoin}
      JOIN empleo e ON e.id_encuesta = ea.id_encuesta
      ${whereSQL} AND ea.trabaja = 1
      GROUP BY nombre
      ORDER BY total DESC
      LIMIT 5
    `, params),
    db.query(`
      SELECT COALESCE(NULLIF(e.area_trabajo, ''), 'Sin área registrada') AS nombre,
             COUNT(*) AS total,
             ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
      ${baseJoin}
      JOIN empleo e ON e.id_encuesta = ea.id_encuesta
      ${whereSQL} AND ea.trabaja = 1
      GROUP BY nombre
      ORDER BY total DESC
      LIMIT 5
    `, params),
    db.query(`
      SELECT COALESCE(cs.rango_estandar, 'Sin rango registrado') AS nombre,
             COUNT(*) AS total,
             ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
      ${baseJoin}
      LEFT JOIN catalogo_salario cs ON cs.id_salario = ea.id_salario
      ${whereSQL} AND ea.trabaja = 1
      GROUP BY nombre
      ORDER BY total DESC
      LIMIT 5
    `, params),
    db.query(`
      SELECT COALESCE(NULLIF(ea.nivel_puesto, ''), 'Sin nivel registrado') AS nombre,
             COUNT(*) AS total,
             ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
      ${baseJoin}
      ${whereSQL} AND ea.trabaja = 1
      GROUP BY nombre
      ORDER BY total DESC
      LIMIT 5
    `, params),
  ]);

  return {
    resumen: {
      totalEncuestas: Number(resumen[0]?.totalEncuestas) || 0,
      egresadosTrabajando: Number(resumen[0]?.egresadosTrabajando) || 0,
      egresadosAfinidad: Number(resumen[0]?.egresadosAfinidad) || 0,
      egresadosEmprendedores: Number(resumen[0]?.egresadosEmprendedores) || 0,
      tasaEmpleabilidad: Number(resumen[0]?.tasaEmpleabilidad) || 0,
      tasaAfinidad: Number(resumen[0]?.tasaAfinidad) || 0,
    },
    topPuestos,
    topRubros,
    topAreas,
    rangos,
    niveles,
  };
}

function inferirContenidoFaltante(informe, datosEgresados, contenido) {
  const carrera = informe.nombre_carrera.toLowerCase();
  const baseAreas = datosEgresados.topAreas?.slice(0, 3).map(x => x.nombre).filter(Boolean) ?? [];
  const areaText = baseAreas.length ? `Áreas observadas en egresados: ${baseAreas.join(', ')}.` : '';

  const byCareer = carrera.includes('sistemas')
    ? {
        habilidades: [{ categoria: 'Habilidades interpretadas desde tecnología', habilidades: ['Diseño de soluciones digitales', 'Pensamiento lógico y arquitectura de software', 'Gestión de datos y seguridad', 'Trabajo colaborativo con equipos ágiles'] }],
        herramientas: [{ nombre: 'Stack digital y cloud', descripcion: 'Lenguajes de programación, frameworks web, servicios cloud y prácticas DevOps.' }],
        tendencias: [{ titulo: 'Arquitecturas cloud y ciberseguridad', descripcion: 'La demanda se orienta a perfiles capaces de construir, desplegar y proteger soluciones digitales escalables.' }],
      }
    : carrera.includes('marketing')
      ? {
          habilidades: [{ categoria: 'Habilidades interpretadas desde marketing digital', habilidades: ['Análisis de audiencia', 'Optimización de campañas', 'Lectura de métricas', 'Creatividad aplicada a performance'] }],
          herramientas: [{ nombre: 'Analytics y automatización', descripcion: 'Herramientas de analítica, pauta digital, CRM y automatización de marketing.' }],
          tendencias: [{ titulo: 'Marketing aumentado por IA', descripcion: 'Crecen los perfiles que combinan creatividad, datos e IA generativa para personalización y medición.' }],
        }
      : carrera.includes('hotel') || carrera.includes('turismo')
        ? {
            habilidades: [{ categoria: 'Habilidades interpretadas desde servicios', habilidades: ['Atención al cliente', 'Comunicación intercultural', 'Resolución de problemas', 'Gestión de experiencias'] }],
            herramientas: [{ nombre: 'Sistemas de operación y servicio', descripcion: 'Plataformas de reservas, gestión operativa, análisis de ocupación y control de calidad.' }],
            tendencias: [{ titulo: 'Experiencias sostenibles y digitales', descripcion: 'La demanda se desplaza hacia servicios personalizados, sostenibles y apoyados por tecnología.' }],
          }
        : {
            habilidades: [{ categoria: 'Habilidades interpretadas desde empleabilidad', habilidades: ['Análisis de información', 'Gestión de procesos', 'Comunicación efectiva', 'Adaptabilidad profesional'] }],
            herramientas: [{ nombre: 'Analítica y gestión operativa', descripcion: 'Hojas de cálculo, tableros de datos, herramientas de gestión y automatización básica.' }],
            tendencias: [{ titulo: 'Perfiles híbridos con capacidad analítica', descripcion: 'El mercado valora profesionales que combinan dominio técnico, datos y criterio de negocio.' }],
          };

  return {
    habilidades: contenido.habilidades.length ? contenido.habilidades : byCareer.habilidades.map(x => ({ ...x, origenDatos: 'interpretacion_local' })),
    herramientas: contenido.herramientas.length ? contenido.herramientas : byCareer.herramientas.map(x => ({ ...x, origenDatos: 'interpretacion_local' })),
    tendencias: contenido.tendencias.length ? contenido.tendencias : byCareer.tendencias.map(x => ({ ...x, descripcion: `${x.descripcion} ${areaText}`.trim(), origenDatos: 'interpretacion_local' })),
  };
}

async function loadInforme(idInforme) {
  const [[puestos], [cats], [habilidades], [herramientas], [tendencias], [recomendaciones]] = await Promise.all([
    db.query('SELECT orden, nombre_puesto AS nombre, descripcion, vacantes_texto AS vacantes, fuente_dato AS fuenteDato FROM mercado_puesto_top WHERE id_informe=? ORDER BY orden', [idInforme]),
    db.query('SELECT id_categoria, orden, categoria, origen_datos AS origenDatos FROM mercado_habilidad_categoria WHERE id_informe=? ORDER BY orden', [idInforme]),
    db.query(`SELECT hi.id_categoria, hi.orden, hi.habilidad
              FROM mercado_habilidad_item hi
              JOIN mercado_habilidad_categoria hc ON hc.id_categoria = hi.id_categoria
              WHERE hc.id_informe=?
              ORDER BY hc.orden, hi.orden`, [idInforme]),
    db.query('SELECT orden, nombre, descripcion, origen_datos AS origenDatos FROM mercado_herramienta WHERE id_informe=? ORDER BY orden', [idInforme]),
    db.query('SELECT orden, titulo, descripcion, origen_datos AS origenDatos FROM mercado_tendencia WHERE id_informe=? ORDER BY orden', [idInforme]),
    db.query('SELECT tipo, orden, texto, origen_datos AS origenDatos FROM mercado_recomendacion WHERE id_informe=? ORDER BY tipo, orden', [idInforme]),
  ]);

  const habilidadesByCat = new Map(cats.map(cat => [cat.id_categoria, { categoria: cat.categoria, origenDatos: cat.origenDatos, habilidades: [] }]));
  for (const item of habilidades) {
    habilidadesByCat.get(item.id_categoria)?.habilidades.push(item.habilidad);
  }

  return {
    puestos,
    habilidades: Array.from(habilidadesByCat.values()),
    herramientas,
    tendencias,
    recomendacionesEstudiante: recomendaciones.filter(x => x.tipo === 'estudiante_egresado').map(x => x.texto),
    recomendacionesCurriculares: recomendaciones.filter(x => x.tipo === 'diseno_curricular').map(x => x.texto),
  };
}

router.get('/mercado-laboral/filtros', async (_req, res) => {
  try {
    await ensureMercadoLaboralReady();
    const [rows] = await db.query(`
      SELECT nombre_facultad, nombre_carrera
      FROM mercado_informe
      WHERE activo = 1
      ORDER BY nombre_facultad, nombre_carrera
    `);
    const facultades = [];
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.nombre_facultad)) {
        const item = { nombre: row.nombre_facultad, carreras: [] };
        map.set(row.nombre_facultad, item);
        facultades.push(item);
      }
      map.get(row.nombre_facultad).carreras.push(row.nombre_carrera);
    }
    res.json({ facultades });
  } catch (e) {
    serverError(res, e, 'GET /mercado-laboral/filtros');
  }
});

router.get('/mercado-laboral/metodologia', async (_req, res) => {
  try {
    await ensureMercadoLaboralReady();
    const [data] = await db.query('SELECT orden, titulo, descripcion FROM mercado_metodologia WHERE activo=1 ORDER BY orden');
    res.json({ data });
  } catch (e) {
    serverError(res, e, 'GET /mercado-laboral/metodologia');
  }
});

router.get('/mercado-laboral/informe', async (req, res) => {
  try {
    await ensureMercadoLaboralReady();
    const { facultad, carrera } = req.query;
    const where = ['activo = 1'];
    const params = [];
    if (facultad) { where.push('nombre_facultad = ?'); params.push(facultad); }
    if (carrera) { where.push('nombre_carrera = ?'); params.push(carrera); }

    const [rows] = await db.query(
      `SELECT * FROM mercado_informe
       WHERE ${where.join(' AND ')}
       ORDER BY nombre_facultad, nombre_carrera
       LIMIT 1`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'No se encontró informe para la carrera seleccionada.' });

    const informe = rows[0];
    const contenido = await loadInforme(informe.id_informe);

    res.json({
      informe: {
        id: informe.id_informe,
        facultad: informe.nombre_facultad,
        carrera: informe.nombre_carrera,
        periodo: informe.periodo,
        tituloHeader: informe.titulo_header,
        descripcionHeader: informe.descripcion_header,
        insightHeader: informe.insight_header,
        descripcion: informe.descripcion,
        objetivoFinal: informe.objetivo_final,
        documentoInformeUrl: informe.documento_informe_url,
        origenDatos: informe.origen_datos,
      },
      mercado: {
        puestos: contenido.puestos,
        habilidades: contenido.habilidades,
        herramientas: contenido.herramientas,
        tendencias: contenido.tendencias,
        recomendacionesEstudiante: contenido.recomendacionesEstudiante,
        recomendacionesCurriculares: contenido.recomendacionesCurriculares,
      },
      empleabilidad: null,
    });
  } catch (e) {
    serverError(res, e, 'GET /mercado-laboral/informe');
  }
});

export default router;
