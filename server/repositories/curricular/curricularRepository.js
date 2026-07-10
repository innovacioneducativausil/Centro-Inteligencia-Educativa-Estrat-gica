import db from '../../db_curricular.js';

export async function getCurricularFiltros() {
  const [[facultades], [carreras]] = await Promise.all([
    db.query(
      `SELECT DISTINCT f.id_facultad, f.nombre_facultad
       FROM facultad f
       JOIN carrera ca ON ca.id_facultad = f.id_facultad
       ORDER BY f.nombre_facultad`
    ),
    db.query(
      `SELECT ca.id_carrera, ca.nombre_carrera, f.id_facultad, f.nombre_facultad
       FROM carrera ca
       JOIN facultad f ON ca.id_facultad = f.id_facultad
       ORDER BY ca.nombre_carrera`
    ),
  ]);
  return { facultades, carreras };
}

export async function getMallasCurriculares({ carrera, facultad } = {}) {
  const where = [];
  const params = [];
  if (carrera) { where.push('ca.nombre_carrera = ?'); params.push(carrera); }
  if (facultad) { where.push('f.nombre_facultad = ?'); params.push(facultad); }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT mv.id_malla, mv.nombre_version, mv.anio_inicio, mv.es_vigente,
            ca.nombre_carrera, f.nombre_facultad,
            COUNT(c.id_curso) AS total_cursos
     FROM malla_version mv
     JOIN carrera ca ON mv.id_carrera = ca.id_carrera
     JOIN facultad f ON ca.id_facultad = f.id_facultad
     LEFT JOIN curso c ON c.id_malla = mv.id_malla
     ${whereSQL}
     GROUP BY mv.id_malla, mv.nombre_version, mv.anio_inicio, mv.es_vigente,
              ca.nombre_carrera, f.nombre_facultad
     ORDER BY mv.es_vigente DESC, mv.anio_inicio DESC`,
    params
  );
  return rows;
}

export async function getMallaKpis(idMalla) {
  const [[row]] = await db.query(
    `SELECT
       COUNT(c.id_curso) AS total_cursos,
       SUM(CASE WHEN ac.estado_alineacion IN ('critico','riesgo') THEN 1 ELSE 0 END) AS en_riesgo,
       SUM(CASE WHEN ac.estado_alineacion = 'alineado' THEN 1 ELSE 0 END) AS alineados,
       SUM(CASE WHEN ac.estado_alineacion = 'oportunidad' THEN 1 ELSE 0 END) AS oportunidades,
       SUM(CASE WHEN ac.score_alineacion IS NOT NULL AND ac.score_alineacion < 60 THEN 1 ELSE 0 END) AS criticos,
       ROUND(AVG(ac.score_alineacion), 1) AS pct_alineacion_promedio
     FROM curso c
     LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
     WHERE c.id_malla = ?`,
    [idMalla]
  );
  return row || {};
}

export async function getMallaMapaRows(idMalla) {
  const [rows] = await db.query(
    `SELECT
       c.id_curso, c.nombre_curso, c.codigo_curso, c.numero_ciclo, c.nro_orden,
       c.creditos, c.tipo_curso, c.horas_teoria, c.horas_practica, c.horas_lab,
       c.prerequisito, c.clas_sunedu, c.mencion, c.creditos_minimos,
       ac.score_alineacion, ac.estado_alineacion,
       ac.tendencias_impacto, ac.brechas_detectadas, ac.recomendaciones_ia,
       ac.analizado_en
     FROM curso c
     LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
     WHERE c.id_malla = ?
     ORDER BY c.numero_ciclo, COALESCE(c.nro_orden, 999), c.nombre_curso`,
    [idMalla]
  );
  return rows;
}

async function setMallaVigente(idMalla, idCarrera) {
  await db.query('UPDATE malla_version SET es_vigente=0 WHERE id_carrera=? AND id_malla!=?', [idCarrera, idMalla]);
  await db.query('UPDATE malla_version SET es_vigente=1 WHERE id_malla=?', [idMalla]);
}

async function getOrCreateFacultad(nombreFacultad) {
  const [rows] = await db.query('SELECT id_facultad FROM facultad WHERE nombre_facultad=? LIMIT 1', [nombreFacultad]);
  if (rows.length) return rows[0].id_facultad;
  const [result] = await db.query('INSERT INTO facultad SET ?', { nombre_facultad: nombreFacultad });
  return result.insertId;
}

async function getOrCreateCarrera({ nombreCarrera, idFacultad }) {
  const [rows] = await db.query(
    'SELECT id_carrera FROM carrera WHERE nombre_carrera=? AND id_facultad=? LIMIT 1',
    [nombreCarrera, idFacultad]
  );
  if (rows.length) return rows[0].id_carrera;
  const [result] = await db.query('INSERT INTO carrera SET ?', {
    nombre_carrera: nombreCarrera,
    id_facultad: idFacultad,
  });
  return result.insertId;
}

async function getOrCreateMalla({ idCarrera, nombreVersion, anioInicio, esVigente }) {
  const [rows] = await db.query(
    'SELECT id_malla FROM malla_version WHERE id_carrera=? AND nombre_version=? LIMIT 1',
    [idCarrera, nombreVersion]
  );
  if (rows.length) return rows[0].id_malla;

  const [result] = await db.query('INSERT INTO malla_version SET ?', {
    id_carrera: idCarrera,
    nombre_version: nombreVersion,
    anio_inicio: anioInicio || new Date().getFullYear(),
    es_vigente: esVigente,
    fuente_carga: 'EXCEL',
  });
  if (esVigente) await setMallaVigente(result.insertId, idCarrera);
  return result.insertId;
}

async function upsertCurso({ idMalla, nombreCurso, numeroCiclo, creditos, tipoCurso }) {
  const [rows] = await db.query(
    'SELECT id_curso FROM curso WHERE id_malla=? AND nombre_curso=? AND numero_ciclo=? LIMIT 1',
    [idMalla, nombreCurso, numeroCiclo]
  );
  if (rows.length) {
    await db.query('UPDATE curso SET creditos=?, tipo_curso=? WHERE id_curso=?', [creditos, tipoCurso, rows[0].id_curso]);
    return rows[0].id_curso;
  }
  const [result] = await db.query('INSERT INTO curso SET ?', {
    id_malla: idMalla,
    nombre_curso: nombreCurso,
    numero_ciclo: numeroCiclo,
    creditos,
    tipo_curso: tipoCurso,
  });
  return result.insertId;
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
  await db.query(
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
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE s.titulo LIKE ? OR c.nombre_curso LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }
  const [rows] = await db.query(
    `SELECT s.id_silabo, s.id_curso, s.titulo, s.url_archivo, s.contenido, s.activo, s.fecha_actualizacion,
            c.nombre_curso, c.codigo_curso
     FROM silabo s
     JOIN curso c ON c.id_curso = s.id_curso
     ${where}
     ORDER BY s.fecha_actualizacion DESC
     LIMIT 200`,
    params
  );
  return rows;
}

export async function searchCursos(q) {
  const [rows] = await db.query(
    'SELECT id_curso, nombre_curso, codigo_curso FROM curso WHERE nombre_curso LIKE ? OR codigo_curso LIKE ? LIMIT 20',
    [`%${q}%`, `%${q}%`]
  );
  return rows;
}

export async function getCursoById(idCurso) {
  const [[row]] = await db.query('SELECT id_curso FROM curso WHERE id_curso = ?', [idCurso]);
  return row || null;
}

export async function createSilabo({ id, idCurso, titulo, urlArchivo, contenido }) {
  await db.query(
    `INSERT INTO silabo (id_silabo, id_curso, titulo, url_archivo, contenido, activo)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [id, idCurso, titulo, urlArchivo || null, contenido || null]
  );
}

export async function getSilaboById(id) {
  const [[row]] = await db.query('SELECT id_silabo, titulo FROM silabo WHERE id_silabo = ?', [id]);
  return row || null;
}

export async function updateSilabo({ id, titulo, urlArchivo, contenido }) {
  await db.query(
    'UPDATE silabo SET titulo = ?, url_archivo = ?, contenido = ?, fecha_actualizacion = NOW() WHERE id_silabo = ?',
    [titulo, urlArchivo || null, contenido || null, id]
  );
}

export async function updateSilaboEstado({ id, activo }) {
  await db.query('UPDATE silabo SET activo = ? WHERE id_silabo = ?', [activo ? 1 : 0, id]);
}
