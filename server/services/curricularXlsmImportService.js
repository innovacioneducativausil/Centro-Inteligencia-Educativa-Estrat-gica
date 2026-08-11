import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import dbCurricular from '../db_curricular.js';
import logger from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/curricular_xlsm');
const FACULTAD = 'Educación';
const VERSION_NAME = '2025-01 XLSM';
const TEMPLATE = 'USIL_PLAN_CURRICULAR_XLSM_V1';

const FILE_PATTERNS = [
  /^P18_Educaci[oó]n Inicial_presencial_2027-01\(2025-01\) 1\.xlsm$/i,
  /^P25_Educaci[oó]n Secundaria con Especialidad en Ingl[eé]s_Presencial_2027-01\(2025-01\)\.xlsm$/i,
];

const CELL = {
  programa: 'F6',
  modalidad: 'D8',
  periodo: 'F18',
  creditos: 'D16',
};

const PLAN_COLUMNS = {
  ciclo: 'B',
  codigoOficial: 'C',
  codigoCurso: 'D',
  nombre: 'E',
  coordinacion: 'F',
  tipoEstudio: 'G',
  condicion: 'H',
  modalidadCurso: 'I',
  htPresencial: 'J',
  htVirtual: 'K',
  hpPresencial: 'L',
  hpVirtual: 'M',
  hlabPresencial: 'N',
  hlabVirtual: 'O',
  creditos: 'P',
  horasAutonomas: 'Q',
  prerequisito: 'R',
  creditosMinimos: 'X',
  mencion: 'Y',
};

const COMPETENCE_COLUMNS = ['AA', 'AC', 'AE', 'AG', 'AI'];

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|\s|\/|-)([a-záéíóúñ])/g, m => m.toUpperCase());
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cell(sheet, address) {
  const value = sheet[address]?.v;
  return value === undefined ? null : value;
}

function sectionText(sheet, startPattern, endPattern, startRow = 1, endRow = 220) {
  let collecting = false;
  const parts = [];
  for (let row = startRow; row <= endRow; row++) {
    const text = cleanText(cell(sheet, `B${row}`));
    if (!text) continue;
    if (!collecting && startPattern.test(text)) {
      collecting = true;
      continue;
    }
    if (collecting && endPattern.test(text)) break;
    if (collecting) parts.push(text);
  }
  return parts.length ? parts.join('\n') : null;
}

function readSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`No se encontró la hoja "${name}"`);
  return sheet;
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findSourceFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const names = fs.readdirSync(DATA_DIR);
  const found = [];
  for (const pattern of FILE_PATTERNS) {
    const matched = names.find(name => pattern.test(name));
    if (matched) found.push(path.join(DATA_DIR, matched));
  }
  return found;
}

function parseCompetenceDefinition(rawSigla, avanzado, intermedio, basico) {
  const sigla = cleanText(rawSigla);
  if (!sigla || !sigla.includes(':')) return null;
  const [codigoRaw, ...nameParts] = sigla.split(':');
  const codigo = cleanText(codigoRaw)?.toUpperCase();
  const nombre = cleanText(nameParts.join(':'));
  if (!codigo || !nombre) return null;
  return {
    codigo,
    nombre,
    tipo: codigo.startsWith('CG') ? 'general' : codigo.startsWith('CP') ? 'profesional' : 'otra',
    niveles: [
      { nivel: 1, etiqueta: 'Básico', descripcion: cleanText(basico) },
      { nivel: 2, etiqueta: 'Intermedio', descripcion: cleanText(intermedio) },
      { nivel: 3, etiqueta: 'Avanzado', descripcion: cleanText(avanzado) },
    ].filter(n => n.descripcion),
  };
}

function parseCourseCompetence(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const match = text.match(/^([A-Z]{1,3}\d+):\s*([^:]+):\s*N([123])\s*(.*)$/i);
  if (!match) return { codigo: null, nivel: null, evidencia: text };
  return {
    codigo: match[1].toUpperCase(),
    nombre: cleanText(match[2]),
    nivel: Number(match[3]),
    evidencia: cleanText(match[4]) || text,
  };
}

function parseWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false, cellFormula: false, bookVBA: false });
  const fundamentos = readSheet(workbook, '1.Fundamentos');
  const plan = readSheet(workbook, '3.Plan de Estudios');
  const electivos = readSheet(workbook, '4.Electivos');
  const mencionesSheet = readSheet(workbook, '2.Menc._Certif.');
  const sumillas = readSheet(workbook, '7.Sumillas');
  const matriz = readSheet(workbook, '8.Matriz');

  const programaRaw = cleanText(cell(fundamentos, CELL.programa));
  const programa = titleCase(programaRaw);
  const modalidad = cleanText(cell(fundamentos, CELL.modalidad));
  const periodo = cleanText(cell(fundamentos, CELL.periodo)) || '2025-01';
  const totalCreditos = asNumber(cell(fundamentos, CELL.creditos));
  const fundamentosPrograma = {
    codigoPrograma: cleanText(cell(fundamentos, 'F8')),
    gradoOtorgado: cleanText(cell(fundamentos, 'D10')),
    tituloOtorgado: cleanText(cell(fundamentos, 'D12')),
    regimenEstudios: cleanText(cell(fundamentos, 'D14')),
    duracionMeses: asNumber(cell(fundamentos, 'F14')),
    fechaAprobacion: cleanText(cell(fundamentos, 'B18')),
    objetivoAcademico: cleanText(cell(fundamentos, 'B27')),
    perfilIngreso: cleanText(cell(fundamentos, 'B32')),
    perfilEgreso: sectionText(fundamentos, /^5\.\s*PERFIL DE EGRESO/i, /^6\.\s*OBJETIVOS EDUCACIONALES/i, 30, 48),
    objetivosEducacionales: sectionText(fundamentos, /^6\.\s*OBJETIVOS EDUCACIONALES/i, /^7\.\s*COMPETENCIAS/i, 38, 50),
  };
  const resumenPlan = {
    total_cursos: asNumber(cell(plan, 'F8')),
    total_creditos: asNumber(cell(plan, 'O8')),
    modalidad_calculada: cleanText(cell(plan, 'P4')),
    distribucion_tipo_estudio: [
      {
        tipo: 'General',
        cursos: asNumber(cell(plan, 'F9')),
        horas_teoria: asNumber(cell(plan, 'G9')),
        horas_practica: asNumber(cell(plan, 'H9')),
        horas_laboratorio: asNumber(cell(plan, 'I9')),
        horas_total: asNumber(cell(plan, 'J9')),
        creditos_teoria: asNumber(cell(plan, 'L9')),
        creditos_practica: asNumber(cell(plan, 'M9')),
        creditos_laboratorio: asNumber(cell(plan, 'N9')),
        creditos_total: asNumber(cell(plan, 'O9')),
      },
      {
        tipo: 'Específico',
        cursos: asNumber(cell(plan, 'F10')),
        horas_teoria: asNumber(cell(plan, 'G10')),
        horas_practica: asNumber(cell(plan, 'H10')),
        horas_laboratorio: asNumber(cell(plan, 'I10')),
        horas_total: asNumber(cell(plan, 'J10')),
        creditos_teoria: asNumber(cell(plan, 'L10')),
        creditos_practica: asNumber(cell(plan, 'M10')),
        creditos_laboratorio: asNumber(cell(plan, 'N10')),
        creditos_total: asNumber(cell(plan, 'O10')),
      },
      {
        tipo: 'De especialidad',
        cursos: asNumber(cell(plan, 'F11')),
        horas_teoria: asNumber(cell(plan, 'G11')),
        horas_practica: asNumber(cell(plan, 'H11')),
        horas_laboratorio: asNumber(cell(plan, 'I11')),
        horas_total: asNumber(cell(plan, 'J11')),
        creditos_teoria: asNumber(cell(plan, 'L11')),
        creditos_practica: asNumber(cell(plan, 'M11')),
        creditos_laboratorio: asNumber(cell(plan, 'N11')),
        creditos_total: asNumber(cell(plan, 'O11')),
      },
    ],
    distribucion_modalidad: [
      {
        modalidad: 'Presencial',
        horas_teoria: asNumber(cell(plan, 'G12')),
        horas_practica: asNumber(cell(plan, 'H12')),
        horas_laboratorio: asNumber(cell(plan, 'I12')),
        horas_total: asNumber(cell(plan, 'J12')),
        creditos_total: asNumber(cell(plan, 'O12')),
      },
      {
        modalidad: 'Virtual',
        horas_teoria: asNumber(cell(plan, 'G13')),
        horas_practica: asNumber(cell(plan, 'H13')),
        horas_laboratorio: asNumber(cell(plan, 'I13')),
        horas_total: asNumber(cell(plan, 'J13')),
        creditos_total: asNumber(cell(plan, 'O13')),
      },
    ],
  };

  const competencias = [];
  const seenCompetencias = new Set();
  for (let row = 50; row <= 90; row++) {
    const item = parseCompetenceDefinition(
      cell(fundamentos, `B${row}`),
      cell(fundamentos, `D${row}`),
      cell(fundamentos, `E${row}`),
      cell(fundamentos, `F${row}`)
    );
    if (item && !seenCompetencias.has(item.codigo)) {
      seenCompetencias.add(item.codigo);
      competencias.push(item);
    }
  }

  const cursos = [];
  const cycleOrder = new Map();
  for (let row = 19; row <= 171; row++) {
    const nombre = cleanText(cell(plan, `${PLAN_COLUMNS.nombre}${row}`));
    if (!nombre || /^total$/i.test(nombre)) continue;
    const ciclo = asNumber(cell(plan, `${PLAN_COLUMNS.ciclo}${row}`));
    if (!ciclo) continue;
    cycleOrder.set(ciclo, (cycleOrder.get(ciclo) || 0) + 1);
    cursos.push({
      sourceRow: row,
      ciclo,
      orden: cycleOrder.get(ciclo),
      codigoOficial: cleanText(cell(plan, `${PLAN_COLUMNS.codigoOficial}${row}`)),
      codigoCurso: cleanText(cell(plan, `${PLAN_COLUMNS.codigoCurso}${row}`)),
      nombre,
      coordinacion: cleanText(cell(plan, `${PLAN_COLUMNS.coordinacion}${row}`)),
      tipoEstudio: cleanText(cell(plan, `${PLAN_COLUMNS.tipoEstudio}${row}`)),
      condicion: cleanText(cell(plan, `${PLAN_COLUMNS.condicion}${row}`)) || 'Obligatorio',
      modalidadCurso: cleanText(cell(plan, `${PLAN_COLUMNS.modalidadCurso}${row}`)),
      htPresencial: asNumber(cell(plan, `${PLAN_COLUMNS.htPresencial}${row}`)) || 0,
      htVirtual: asNumber(cell(plan, `${PLAN_COLUMNS.htVirtual}${row}`)) || 0,
      hpPresencial: asNumber(cell(plan, `${PLAN_COLUMNS.hpPresencial}${row}`)) || 0,
      hpVirtual: asNumber(cell(plan, `${PLAN_COLUMNS.hpVirtual}${row}`)) || 0,
      hlabPresencial: asNumber(cell(plan, `${PLAN_COLUMNS.hlabPresencial}${row}`)) || 0,
      hlabVirtual: asNumber(cell(plan, `${PLAN_COLUMNS.hlabVirtual}${row}`)) || 0,
      creditos: asNumber(cell(plan, `${PLAN_COLUMNS.creditos}${row}`)),
      horasAutonomas: asNumber(cell(plan, `${PLAN_COLUMNS.horasAutonomas}${row}`)),
      prerequisito: cleanText(cell(plan, `${PLAN_COLUMNS.prerequisito}${row}`)),
      creditosMinimos: asNumber(cell(plan, `${PLAN_COLUMNS.creditosMinimos}${row}`)),
      mencion: cleanText(cell(plan, `${PLAN_COLUMNS.mencion}${row}`)),
      competencias: COMPETENCE_COLUMNS.map(col => parseCourseCompetence(cell(plan, `${col}${row}`))).filter(Boolean),
    });
  }

  const sumillasByName = new Map();
  for (let row = 8; row <= 250; row++) {
    const nombre = cleanText(cell(sumillas, `D${row}`));
    const sumilla = cleanText(cell(sumillas, `E${row}`) || cell(sumillas, `G${row}`));
    if (nombre && sumilla) sumillasByName.set(normalizeName(nombre), { sumilla, sourceRow: row });
  }

  const matrizByName = new Map();
  for (let row = 7; row <= 571; row++) {
    const nombre = cleanText(cell(matriz, `D${row}`));
    if (!nombre) continue;
    matrizByName.set(normalizeName(nombre), {
      sourceRow: row,
      sumilla: cleanText(cell(matriz, `M${row}`)),
      justificacion: cleanText(cell(matriz, `N${row}`)),
      recursos: cleanText(cell(matriz, `O${row}`)),
      competenciasTexto: cleanText(cell(matriz, `P${row}`)),
      resultadoAprendizaje: cleanText(cell(matriz, `Q${row}`)),
      pertinencia: cleanText(cell(matriz, `R${row}`)),
      metodologia: cleanText(cell(matriz, `S${row}`)),
      idoneidad: cleanText(cell(matriz, `T${row}`)),
    });
  }

  cursos.forEach(curso => {
    const key = normalizeName(curso.nombre);
    curso.sumillaInfo = sumillasByName.get(key) || null;
    curso.matrizInfo = matrizByName.get(key) || null;
  });

  const electivosCatalogo = [];
  for (let row = 6; row <= 109; row++) {
    const nombre = cleanText(cell(electivos, `E${row}`));
    const codigoOficial = cleanText(cell(electivos, `C${row}`));
    if (!nombre || !codigoOficial) continue;
    electivosCatalogo.push({
      sourceRow: row,
      ciclo: asNumber(cell(electivos, `B${row}`)),
      codigoOficial,
      codigoCurso: cleanText(cell(electivos, `D${row}`)),
      nombre,
      coordinacion: cleanText(cell(electivos, `F${row}`)),
      tipoEstudio: cleanText(cell(electivos, `G${row}`)),
      condicion: cleanText(cell(electivos, `H${row}`)),
      modalidadCurso: cleanText(cell(electivos, `I${row}`)),
      htPresencial: asNumber(cell(electivos, `J${row}`)) || 0,
      htVirtual: asNumber(cell(electivos, `K${row}`)) || 0,
      hpPresencial: asNumber(cell(electivos, `L${row}`)) || 0,
      hpVirtual: asNumber(cell(electivos, `M${row}`)) || 0,
      hlabPresencial: asNumber(cell(electivos, `N${row}`)) || 0,
      hlabVirtual: asNumber(cell(electivos, `O${row}`)) || 0,
      creditos: asNumber(cell(electivos, `P${row}`)),
      horasAutonomas: asNumber(cell(electivos, `Q${row}`)),
      prerequisito: cleanText(cell(electivos, `R${row}`)),
      creditosMinimos: asNumber(cell(electivos, `V${row}`)),
      mencion: cleanText(cell(electivos, `W${row}`)),
    });
  }

  const mentionBlocks = [
    { codigo: '14.1', nombreCell: 'D7', start: 9, end: 14, cols: ['B', 'C', 'D', 'E', 'F'] },
    { codigo: '14.2', nombreCell: 'J7', start: 9, end: 14, cols: ['H', 'I', 'J', 'K', 'L'] },
    { codigo: '14.3', nombreCell: 'D16', start: 18, end: 23, cols: ['B', 'C', 'D', 'E', 'F'] },
    { codigo: '14.4', nombreCell: 'J16', start: 18, end: 23, cols: ['H', 'I', 'J', 'K', 'L'] },
  ];

  const menciones = mentionBlocks.map(block => {
    const nombre = cleanText(cell(mencionesSheet, block.nombreCell));
    const cursosMencion = [];
    for (let row = block.start; row <= block.end; row++) {
      const [codigoOficialCol, codigoCursoCol, cicloCol, nombreCol, condicionCol] = block.cols;
      const nombreCurso = cleanText(cell(mencionesSheet, `${nombreCol}${row}`));
      const codigoOficial = cleanText(cell(mencionesSheet, `${codigoOficialCol}${row}`));
      if (!nombreCurso && !codigoOficial) continue;
      cursosMencion.push({
        sourceRow: row,
        codigoOficial,
        codigoCurso: cleanText(cell(mencionesSheet, `${codigoCursoCol}${row}`)),
        ciclo: asNumber(cell(mencionesSheet, `${cicloCol}${row}`)),
        nombre: nombreCurso,
        condicion: cleanText(cell(mencionesSheet, `${condicionCol}${row}`)),
      });
    }
    return { codigo: block.codigo, nombre, cursos: cursosMencion };
  }).filter(mencion => mencion.nombre && mencion.cursos.length);

  return {
    archivoNombre: path.basename(filePath),
    archivoHash: fileHash(filePath),
    programa,
    modalidad,
    periodo,
    totalCreditos,
    fundamentosPrograma,
    resumenPlan,
    cursos,
    competencias,
    electivosCatalogo,
    menciones,
  };
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function ensureColumn(conn, table, column, ddl) {
  if (!(await columnExists(conn, table, column))) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS curricular_importacion (
      id_importacion INT UNSIGNED NOT NULL AUTO_INCREMENT,
      archivo_nombre VARCHAR(255) NOT NULL,
      archivo_hash CHAR(64) NOT NULL,
      tipo_archivo VARCHAR(20) NOT NULL DEFAULT 'xlsm',
      plantilla_detectada VARCHAR(80) NULL,
      carrera_detectada VARCHAR(200) NULL,
      modalidad_detectada VARCHAR(80) NULL,
      periodo_aplicacion VARCHAR(20) NULL,
      total_creditos SMALLINT UNSIGNED NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'importado',
      resumen_json JSON NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_importacion),
      KEY idx_curr_imp_hash (archivo_hash),
      KEY idx_curr_imp_carrera (carrera_detectada)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn(conn, 'malla_version', 'periodo_aplicacion', 'periodo_aplicacion VARCHAR(20) NULL');
  await ensureColumn(conn, 'malla_version', 'modalidad', 'modalidad VARCHAR(80) NULL');
  await ensureColumn(conn, 'malla_version', 'total_creditos', 'total_creditos SMALLINT UNSIGNED NULL');
  await ensureColumn(conn, 'malla_version', 'id_importacion', 'id_importacion INT UNSIGNED NULL');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS curso_detalle_curricular (
      id_curso INT UNSIGNED NOT NULL,
      codigo_oficial VARCHAR(40) NULL,
      codigo_interno VARCHAR(40) NULL,
      carrera_coordinacion VARCHAR(160) NULL,
      tipo_estudio VARCHAR(80) NULL,
      modalidad_curso VARCHAR(80) NULL,
      horas_teoria_presencial SMALLINT UNSIGNED NULL,
      horas_teoria_virtual SMALLINT UNSIGNED NULL,
      horas_practica_presencial SMALLINT UNSIGNED NULL,
      horas_practica_virtual SMALLINT UNSIGNED NULL,
      horas_lab_presencial SMALLINT UNSIGNED NULL,
      horas_lab_virtual SMALLINT UNSIGNED NULL,
      horas_autonomas SMALLINT UNSIGNED NULL,
      fila_origen SMALLINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_curso),
      CONSTRAINT fk_cdc_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS malla_fundamento_curricular (
      id_malla INT UNSIGNED NOT NULL,
      codigo_programa VARCHAR(40) NULL,
      grado_otorgado VARCHAR(220) NULL,
      titulo_otorgado VARCHAR(260) NULL,
      regimen_estudios VARCHAR(80) NULL,
      duracion_meses SMALLINT UNSIGNED NULL,
      fecha_aprobacion VARCHAR(80) NULL,
      objetivo_academico TEXT NULL,
      perfil_ingreso TEXT NULL,
      perfil_egreso TEXT NULL,
      objetivos_educacionales TEXT NULL,
      resumen_plan_json JSON NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_malla),
      CONSTRAINT fk_malla_fundamento_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS competencia_curricular (
      id_competencia INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_malla INT UNSIGNED NOT NULL,
      codigo_competencia VARCHAR(30) NOT NULL,
      nombre_competencia VARCHAR(300) NOT NULL,
      tipo_competencia VARCHAR(40) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_competencia),
      UNIQUE KEY uq_comp_malla_codigo (id_malla, codigo_competencia),
      CONSTRAINT fk_comp_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS competencia_nivel (
      id_nivel INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_competencia INT UNSIGNED NOT NULL,
      nivel TINYINT UNSIGNED NOT NULL,
      etiqueta VARCHAR(60) NULL,
      descripcion TEXT NULL,
      PRIMARY KEY (id_nivel),
      UNIQUE KEY uq_comp_nivel (id_competencia, nivel),
      CONSTRAINT fk_comp_nivel_comp FOREIGN KEY (id_competencia) REFERENCES competencia_curricular(id_competencia) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS curso_competencia (
      id_curso INT UNSIGNED NOT NULL,
      id_competencia INT UNSIGNED NOT NULL,
      nivel TINYINT UNSIGNED NOT NULL DEFAULT 0,
      evidencia_textual TEXT NULL,
      PRIMARY KEY (id_curso, id_competencia, nivel),
      CONSTRAINT fk_ccurso_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso) ON DELETE CASCADE,
      CONSTRAINT fk_ccurso_comp FOREIGN KEY (id_competencia) REFERENCES competencia_curricular(id_competencia) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS curso_sumilla (
      id_sumilla INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_curso INT UNSIGNED NOT NULL,
      sumilla TEXT NULL,
      resultado_aprendizaje TEXT NULL,
      justificacion TEXT NULL,
      recursos_necesarios TEXT NULL,
      pertinencia_modalidad TEXT NULL,
      metodologia TEXT NULL,
      idoneidad_modalidad TEXT NULL,
      fila_sumilla SMALLINT UNSIGNED NULL,
      fila_matriz SMALLINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_sumilla),
      UNIQUE KEY uq_sumilla_curso (id_curso),
      CONSTRAINT fk_sumilla_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS electivo_catalogo (
      id_electivo INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_malla INT UNSIGNED NOT NULL,
      ciclo_sugerido TINYINT UNSIGNED NULL,
      codigo_oficial VARCHAR(40) NULL,
      codigo_curso VARCHAR(40) NULL,
      nombre_curso VARCHAR(220) NOT NULL,
      carrera_coordinacion VARCHAR(160) NULL,
      tipo_estudio VARCHAR(80) NULL,
      condicion VARCHAR(40) NULL,
      modalidad_curso VARCHAR(80) NULL,
      creditos TINYINT UNSIGNED NULL,
      horas_teoria_presencial SMALLINT UNSIGNED NULL,
      horas_teoria_virtual SMALLINT UNSIGNED NULL,
      horas_practica_presencial SMALLINT UNSIGNED NULL,
      horas_practica_virtual SMALLINT UNSIGNED NULL,
      horas_lab_presencial SMALLINT UNSIGNED NULL,
      horas_lab_virtual SMALLINT UNSIGNED NULL,
      horas_autonomas SMALLINT UNSIGNED NULL,
      prerequisito TEXT NULL,
      creditos_minimos SMALLINT UNSIGNED NULL,
      mencion VARCHAR(180) NULL,
      fila_origen SMALLINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_electivo),
      KEY idx_electivo_malla (id_malla),
      CONSTRAINT fk_electivo_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS mencion_curricular (
      id_mencion INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_malla INT UNSIGNED NOT NULL,
      codigo_mencion VARCHAR(20) NULL,
      nombre_mencion VARCHAR(220) NOT NULL,
      tipo VARCHAR(40) NOT NULL DEFAULT 'mencion',
      fila_origen SMALLINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_mencion),
      UNIQUE KEY uq_mencion_malla_nombre (id_malla, nombre_mencion),
      CONSTRAINT fk_mencion_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS mencion_curso (
      id_mencion_curso INT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_mencion INT UNSIGNED NOT NULL,
      id_electivo INT UNSIGNED NULL,
      codigo_oficial VARCHAR(40) NULL,
      codigo_curso VARCHAR(40) NULL,
      nombre_curso VARCHAR(220) NOT NULL,
      ciclo TINYINT UNSIGNED NULL,
      condicion VARCHAR(40) NULL,
      nro_orden TINYINT UNSIGNED NULL,
      fila_origen SMALLINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_mencion_curso),
      KEY idx_mencion_curso_mencion (id_mencion),
      KEY idx_mencion_curso_electivo (id_electivo),
      CONSTRAINT fk_mencion_curso_mencion FOREIGN KEY (id_mencion) REFERENCES mencion_curricular(id_mencion) ON DELETE CASCADE,
      CONSTRAINT fk_mencion_curso_electivo FOREIGN KEY (id_electivo) REFERENCES electivo_catalogo(id_electivo) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getOrCreateFacultad(conn, nombre) {
  const [rows] = await conn.query('SELECT id_facultad FROM facultad WHERE nombre_facultad=?', [nombre]);
  if (rows[0]) return rows[0].id_facultad;
  const [result] = await conn.query('INSERT INTO facultad (nombre_facultad) VALUES (?)', [nombre]);
  return result.insertId;
}

async function getOrCreateCarrera(conn, idFacultad, nombreCarrera) {
  const [rows] = await conn.query(
    'SELECT id_carrera FROM carrera WHERE id_facultad=? AND nombre_carrera=?',
    [idFacultad, nombreCarrera]
  );
  if (rows[0]) return rows[0].id_carrera;
  const [result] = await conn.query(
    'INSERT INTO carrera (id_facultad, nombre_carrera, total_ciclos) VALUES (?, ?, 10)',
    [idFacultad, nombreCarrera]
  );
  return result.insertId;
}

async function deleteMallaChildren(conn, idMalla) {
  await conn.query('DELETE FROM curso WHERE id_malla=?', [idMalla]);
  await conn.query('DELETE FROM competencia_curricular WHERE id_malla=?', [idMalla]);
  await conn.query('DELETE FROM electivo_catalogo WHERE id_malla=?', [idMalla]);
  await conn.query('DELETE FROM mencion_curricular WHERE id_malla=?', [idMalla]);
  await conn.query('DELETE FROM malla_fundamento_curricular WHERE id_malla=?', [idMalla]);
}

async function upsertMalla(conn, idCarrera, idImportacion, data) {
  const [rows] = await conn.query(
    'SELECT id_malla FROM malla_version WHERE id_carrera=? AND nombre_version=?',
    [idCarrera, VERSION_NAME]
  );
  if (rows[0]) {
    const idMalla = rows[0].id_malla;
    await deleteMallaChildren(conn, idMalla);
    await conn.query(
      `UPDATE malla_version
       SET anio_inicio=?, es_vigente=0, fuente_carga='XLSM_USIL',
           periodo_aplicacion=?, modalidad=?, total_creditos=?, id_importacion=?
       WHERE id_malla=?`,
      [Number(data.periodo.slice(0, 4)) || 2025, data.periodo, data.modalidad, data.totalCreditos, idImportacion, idMalla]
    );
    return idMalla;
  }
  const [result] = await conn.query(
    `INSERT INTO malla_version
      (id_carrera, nombre_version, anio_inicio, es_vigente, fuente_carga, periodo_aplicacion, modalidad, total_creditos, id_importacion)
     VALUES (?, ?, ?, 0, 'XLSM_USIL', ?, ?, ?, ?)`,
    [idCarrera, VERSION_NAME, Number(data.periodo.slice(0, 4)) || 2025, data.periodo, data.modalidad, data.totalCreditos, idImportacion]
  );
  return result.insertId;
}

async function importCurriculum(conn, data) {
  const resumen = {
    cursos: data.cursos.length,
    competencias: data.competencias.length,
    electivos_catalogo: data.electivosCatalogo.length,
    menciones: data.menciones.length,
    cursos_mencion: data.menciones.reduce((sum, mencion) => sum + mencion.cursos.length, 0),
    creditos_sumados: data.cursos.reduce((sum, c) => sum + (Number(c.creditos) || 0), 0),
  };

  const [importResult] = await conn.query(
    `INSERT INTO curricular_importacion
      (archivo_nombre, archivo_hash, tipo_archivo, plantilla_detectada, carrera_detectada, modalidad_detectada, periodo_aplicacion, total_creditos, estado, resumen_json)
     VALUES (?, ?, 'xlsm', ?, ?, ?, ?, ?, 'importado', ?)`,
    [
      data.archivoNombre,
      data.archivoHash,
      TEMPLATE,
      data.programa,
      data.modalidad,
      data.periodo,
      data.totalCreditos,
      JSON.stringify(resumen),
    ]
  );
  const idImportacion = importResult.insertId;
  const idFacultad = await getOrCreateFacultad(conn, FACULTAD);
  const idCarrera = await getOrCreateCarrera(conn, idFacultad, data.programa);
  const idMalla = await upsertMalla(conn, idCarrera, idImportacion, data);
  await conn.query(
    `INSERT INTO malla_fundamento_curricular
      (id_malla, codigo_programa, grado_otorgado, titulo_otorgado, regimen_estudios, duracion_meses,
       fecha_aprobacion, objetivo_academico, perfil_ingreso, perfil_egreso, objetivos_educacionales, resumen_plan_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idMalla,
      data.fundamentosPrograma.codigoPrograma,
      data.fundamentosPrograma.gradoOtorgado,
      data.fundamentosPrograma.tituloOtorgado,
      data.fundamentosPrograma.regimenEstudios,
      data.fundamentosPrograma.duracionMeses,
      data.fundamentosPrograma.fechaAprobacion,
      data.fundamentosPrograma.objetivoAcademico,
      data.fundamentosPrograma.perfilIngreso,
      data.fundamentosPrograma.perfilEgreso,
      data.fundamentosPrograma.objetivosEducacionales,
      JSON.stringify(data.resumenPlan),
    ]
  );

  const compByCode = new Map();
  for (const comp of data.competencias) {
    const [result] = await conn.query(
      `INSERT INTO competencia_curricular (id_malla, codigo_competencia, nombre_competencia, tipo_competencia)
       VALUES (?, ?, ?, ?)`,
      [idMalla, comp.codigo, comp.nombre, comp.tipo]
    );
    compByCode.set(comp.codigo, result.insertId);
    for (const nivel of comp.niveles) {
      await conn.query(
        `INSERT INTO competencia_nivel (id_competencia, nivel, etiqueta, descripcion)
         VALUES (?, ?, ?, ?)`,
        [result.insertId, nivel.nivel, nivel.etiqueta, nivel.descripcion]
      );
    }
  }

  for (const curso of data.cursos) {
    const [result] = await conn.query(
      `INSERT INTO curso
        (id_malla, nombre_curso, codigo_curso, numero_ciclo, nro_orden, creditos, tipo_curso,
         horas_teoria, horas_practica, horas_lab, prerequisito, clas_sunedu, mencion, creditos_minimos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idMalla,
        curso.nombre,
        curso.codigoOficial || curso.codigoCurso,
        curso.ciclo,
        curso.orden,
        curso.creditos,
        normalizeName(curso.condicion) === 'electivo' ? 'Electivo' : 'Obligatorio',
        curso.htPresencial + curso.htVirtual,
        curso.hpPresencial + curso.hpVirtual,
        curso.hlabPresencial + curso.hlabVirtual,
        curso.prerequisito,
        curso.tipoEstudio,
        curso.mencion,
        curso.creditosMinimos,
      ]
    );
    const idCurso = result.insertId;
    await conn.query(
      `INSERT INTO curso_detalle_curricular
        (id_curso, codigo_oficial, codigo_interno, carrera_coordinacion, tipo_estudio, modalidad_curso,
         horas_teoria_presencial, horas_teoria_virtual, horas_practica_presencial, horas_practica_virtual,
         horas_lab_presencial, horas_lab_virtual, horas_autonomas, fila_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idCurso, curso.codigoOficial, curso.codigoCurso, curso.coordinacion, curso.tipoEstudio, curso.modalidadCurso,
        curso.htPresencial, curso.htVirtual, curso.hpPresencial, curso.hpVirtual,
        curso.hlabPresencial, curso.hlabVirtual, curso.horasAutonomas, curso.sourceRow,
      ]
    );

    const sumilla = curso.sumillaInfo?.sumilla || curso.matrizInfo?.sumilla || null;
    if (sumilla || curso.matrizInfo) {
      await conn.query(
        `INSERT INTO curso_sumilla
          (id_curso, sumilla, resultado_aprendizaje, justificacion, recursos_necesarios, pertinencia_modalidad,
           metodologia, idoneidad_modalidad, fila_sumilla, fila_matriz)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idCurso,
          sumilla,
          curso.matrizInfo?.resultadoAprendizaje || null,
          curso.matrizInfo?.justificacion || null,
          curso.matrizInfo?.recursos || null,
          curso.matrizInfo?.pertinencia || null,
          curso.matrizInfo?.metodologia || null,
          curso.matrizInfo?.idoneidad || null,
          curso.sumillaInfo?.sourceRow || null,
          curso.matrizInfo?.sourceRow || null,
        ]
      );
    }

    for (const rel of curso.competencias) {
      if (!rel.codigo || !compByCode.has(rel.codigo)) continue;
      await conn.query(
        `INSERT IGNORE INTO curso_competencia (id_curso, id_competencia, nivel, evidencia_textual)
         VALUES (?, ?, ?, ?)`,
        [idCurso, compByCode.get(rel.codigo), rel.nivel || 0, rel.evidencia]
      );
    }
  }

  for (const electivo of data.electivosCatalogo) {
    await conn.query(
      `INSERT INTO electivo_catalogo
        (id_malla, ciclo_sugerido, codigo_oficial, codigo_curso, nombre_curso, carrera_coordinacion,
         tipo_estudio, condicion, modalidad_curso, creditos, horas_teoria_presencial, horas_teoria_virtual,
         horas_practica_presencial, horas_practica_virtual, horas_lab_presencial, horas_lab_virtual,
         horas_autonomas, prerequisito, creditos_minimos, mencion, fila_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idMalla, electivo.ciclo, electivo.codigoOficial, electivo.codigoCurso, electivo.nombre, electivo.coordinacion,
        electivo.tipoEstudio, electivo.condicion, electivo.modalidadCurso, electivo.creditos,
        electivo.htPresencial, electivo.htVirtual, electivo.hpPresencial, electivo.hpVirtual,
        electivo.hlabPresencial, electivo.hlabVirtual, electivo.horasAutonomas, electivo.prerequisito,
        electivo.creditosMinimos, electivo.mencion, electivo.sourceRow,
      ]
    );
  }

  const [electivosGuardados] = await conn.query(
    'SELECT id_electivo, codigo_oficial, codigo_curso, nombre_curso FROM electivo_catalogo WHERE id_malla=?',
    [idMalla]
  );
  const electivoByCode = new Map();
  const electivoByName = new Map();
  electivosGuardados.forEach(electivo => {
    if (electivo.codigo_oficial) electivoByCode.set(electivo.codigo_oficial, electivo.id_electivo);
    if (electivo.codigo_curso) electivoByCode.set(String(electivo.codigo_curso), electivo.id_electivo);
    electivoByName.set(normalizeName(electivo.nombre_curso), electivo.id_electivo);
  });

  for (const mencion of data.menciones) {
    const [result] = await conn.query(
      `INSERT INTO mencion_curricular (id_malla, codigo_mencion, nombre_mencion, tipo)
       VALUES (?, ?, ?, 'mencion')`,
      [idMalla, mencion.codigo, mencion.nombre]
    );
    const idMencion = result.insertId;
    for (const [index, curso] of mencion.cursos.entries()) {
      const idElectivo = (curso.codigoOficial && electivoByCode.get(curso.codigoOficial))
        || (curso.codigoCurso && electivoByCode.get(String(curso.codigoCurso)))
        || (curso.nombre && electivoByName.get(normalizeName(curso.nombre)))
        || null;
      await conn.query(
        `INSERT INTO mencion_curso
          (id_mencion, id_electivo, codigo_oficial, codigo_curso, nombre_curso, ciclo, condicion, nro_orden, fila_origen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idMencion,
          idElectivo,
          curso.codigoOficial,
          curso.codigoCurso,
          curso.nombre,
          curso.ciclo,
          curso.condicion,
          index + 1,
          curso.sourceRow,
        ]
      );
    }
  }

  return { idImportacion, idCarrera, idMalla, ...resumen };
}

/**
 * Importa (idempotente, vía hash de archivo) las mallas enriquecidas de
 * Educación Inicial y Educación Secundaria con Especialidad en Inglés
 * empaquetadas en server/data/curricular_xlsm. Se llama una vez al arrancar
 * el servidor y usa el mismo pool que el resto de la app (Railway en prod).
 */
async function ensureEducationXlsmImported() {
  const files = findSourceFiles();
  if (!files.length) {
    logger.info('No se encontraron archivos xlsm de Educación para importar.', { context: 'CURRICULAR_XLSM' });
    return;
  }

  const conn = await dbCurricular.getConnection();
  try {
    await ensureSchema(conn);

    for (const file of files) {
      const hash = fileHash(file);
      const [existing] = await conn.query(
        'SELECT id_importacion FROM curricular_importacion WHERE archivo_hash = ? LIMIT 1',
        [hash]
      );
      if (existing.length) {
        logger.info(`Malla xlsm ya importada, se omite: ${path.basename(file)}`, { context: 'CURRICULAR_XLSM' });
        continue;
      }

      const data = parseWorkbook(file);
      await conn.beginTransaction();
      try {
        const imported = await importCurriculum(conn, data);
        await conn.commit();
        logger.info(`Malla xlsm importada: ${data.programa} (${imported.cursos} cursos, ${imported.competencias} competencias)`, {
          context: 'CURRICULAR_XLSM',
        });
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }
  } catch (error) {
    logger.error(error?.message || 'Error al importar mallas xlsm de Educación.', {
      context: 'CURRICULAR_XLSM',
      stack: error?.stack,
    });
  } finally {
    conn.release();
  }
}

export { ensureEducationXlsmImported, parseWorkbook, findSourceFiles };
