


import { Router } from 'express';
import db from '../db_empl.js';
import dbCurricular from '../db_curricular.js';
import * as benchmarkingRepository from '../repositories/empleabilidad/benchmarkingRepository.js';
import { adminOnly } from '../middleware/roles.js';
import { serverError } from '../middleware/errorHandler.js';
import { scraperBatch, cargarTextoManual, discoverOfficialSources } from '../services/scrapingService.js';
import { normalizarPrograma } from '../services/normalizacionIAService.js';
import { matchCursosInternacionales } from '../services/cursoMatchingService.js';
import { BENCHMARK_SEED_BY_CAREER, BENCHMARK_UNIVERSITIES } from '../data/benchmarkingSeed.js';
import {
  getAllCuratedDirectBenchmarkSources,
  getAllCuratedInternationalBenchmarkSources,
  getCuratedDirectBenchmarkSources,
  getCuratedDirectUniversityCodesForCareer,
  getCuratedInternationalBenchmarkSources,
  getCuratedInternationalUniversityCodesForCareer,
  getCuratedSourcesByBenchmarkType,
} from '../data/benchmarkingCuratedSources.js';

const router = Router();

let schemaReady = null;
const TIPOS_BENCHMARK = ['competencia_directa','referente_nacional','competencia_internacional','referente_internacional','referente_tecnologico'];

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ñ/g, 'N')
    .replace(/ñ/g, 'n')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function resolveBenchmarkSeed(careerName = '') {
  const name = normalizeName(careerName);
  const exact = BENCHMARK_SEED_BY_CAREER[name];
  if (exact) return { seed: exact, match: 'exacto' };

  const has = (...terms) => terms.some(term => name.includes(term));
  if (has('MEDICINA', 'ENFERMERIA', 'NUTRICION', 'PSICOLOGIA', 'TECNOLOGIA MEDICA', 'TERAPIA FISICA')) {
    return { seed: { direct: ['UPCH', 'UCSUR', 'UPC', 'USMP', 'UNMSM'], international: ['HARVARD', 'STANFORD', 'TEC'] }, match: 'area_salud' };
  }
  if (has('INGENIERIA', 'CIENCIA DE DATOS', 'CIBERSEGURIDAD', 'SOFTWARE', 'SISTEMAS', 'MECATRONICA')) {
    return { seed: { direct: ['UPC', 'UTEC', 'PUCP', 'ULIMA', 'UPN', 'UTP'], international: ['MIT', 'STANFORD', 'CALTECH'] }, match: 'area_ingenieria' };
  }
  if (has('ADMINISTRACION', 'BUSINESS', 'MARKETING', 'ECONOMIA', 'FINANZAS', 'NEGOCIOS')) {
    return { seed: { direct: ['PUCP', 'UPC', 'ULIMA', 'UP', 'ESAN', 'UDEP'], international: ['TEC', 'USFQ'] }, match: 'area_negocios' };
  }
  if (has('TURISMO', 'HOTELERA', 'GASTRONOMIA', 'CULINARIO')) {
    return { seed: { direct: ['PUCP', 'UPC', 'ULIMA', 'UDEP', 'UTP'], international: ['TEC', 'USFQ'] }, match: 'area_hospitalidad' };
  }
  if (has('ARQUITECTURA')) {
    return { seed: { direct: ['UPC', 'PUCP', 'ULIMA', 'URP', 'UNI', 'UPN', 'UTP', 'UCSUR'], international: ['MIT', 'HARVARD', 'TEC'] }, match: 'area_arquitectura' };
  }
  if (has('DERECHO', 'COMUNICACIONES', 'RELACIONES INTERNACIONALES', 'EDUCACION', 'MUSICA', 'ARTE')) {
    return { seed: { direct: ['PUCP', 'ULIMA', 'UPC', 'UDEP'], international: ['TEC', 'USFQ'] }, match: 'area_humanidades' };
  }

  return { seed: { direct: ['UPC', 'ULIMA', 'PUCP', 'UDEP'], international: ['TEC', 'USFQ'] }, match: 'fallback_general' };
}

function careerDistinctiveTerms(careerName = '') {
  const generic = new Set([
    'administracion', 'gestion', 'ciencias', 'ciencia', 'ingenieria', 'tecnologia',
    'negocios', 'empresarial', 'empresariales', 'internacional', 'internacionales',
    'comercial', 'educacion', 'humana', 'medica', 'carrera', 'pregrado', 'programa',
    'equivalente',
  ]);
  return normalizeName(careerName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !generic.has(t));
}

function careerFallbackTerms(careerName = '') {
  return normalizeName(careerName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !['programa', 'equivalente', 'carrera', 'pregrado'].includes(t));
}

function careerEquivalentRoots(careerName = '') {
  const selected = normalizeName(careerName).toLowerCase();
  const groups = [
    {
      selected: ['administracion en turismo', 'turismo', 'turistica', 'turistico', 'servicios turisticos'],
      roots: ['turism', 'turistic', 'hotel'],
    },
    {
      selected: ['administracion hotelera', 'hoteleria', 'hotelera'],
      roots: ['hotel', 'turism', 'turistic'],
    },
    {
      selected: ['arte culinario', 'gastronomia', 'culinario', 'culinaria'],
      roots: ['gastron', 'culinar'],
    },
    {
      selected: ['administracion'],
      roots: ['administracion', 'gestion', 'business', 'management', 'strategy'],
    },
    {
      selected: ['digital business management'],
      roots: ['digital', 'business', 'marketing', 'administracion', 'management'],
    },
    {
      selected: ['administracion y finanzas corporativas', 'economia y finanzas'],
      roots: ['finanza', 'finance', 'economia', 'economics'],
    },
    {
      selected: ['economia y negocios internacionales', 'international business'],
      roots: ['negocio', 'internacional', 'international', 'business', 'economia'],
    },
    {
      selected: ['ingenieria de sistemas de informacion'],
      roots: ['sistema', 'informatica', 'informacion', 'systems'],
    },
    {
      selected: ['ingenieria en industrias alimentarias', 'ingenieria agroindustrial'],
      roots: ['agroindustrial', 'alimentaria', 'alimentos'],
    },
    {
      selected: ['ingenieria ambiental'],
      roots: ['ambiental', 'environmental'],
    },
    {
      selected: ['ingenieria biomedica'],
      roots: ['biomedic', 'bioingenieria', 'bioengineering'],
    },
    {
      selected: ['ciencia de datos'],
      roots: ['datos', 'data', 'computacion', 'computer'],
    },
    {
      selected: ['comunicacion', 'comunicaciones'],
      roots: ['comunicacion', 'communication', 'periodismo', 'audiovisual'],
    },
    {
      selected: ['educacion secundaria con especialidad en ingles', 'educacion inicial'],
      roots: ['educacion', 'education', 'aprendizaje', 'secundaria', 'inicial'],
    },
  ];

  const match = groups.find(group => group.selected.some(term => selected.includes(term)));
  return match?.roots || [];
}

function getBenchmarkProgramBaseName(nombrePrograma = '') {
  return String(nombrePrograma).replace(/\s*\/\s*programa equivalente\s*$/i, '').trim();
}

function sourceTermMatches(haystack = '', term = '') {
  if (haystack.includes(term)) return true;
  const roots = {
    turismo: ['turism', 'turistic'],
    turistica: ['turism', 'turistic'],
    turistico: ['turism', 'turistic'],
    turisticos: ['turism', 'turistic'],
    hotelera: ['hotel'],
    hoteleria: ['hotel'],
    gastronomia: ['gastron'],
    culinario: ['culinar'],
    culinaria: ['culinar'],
  };
  return (roots[term] || []).some(root => haystack.includes(root));
}

function sourceHasConflictingCareer(haystack = '', careerName = '') {
  const selected = normalizeName(careerName).toLowerCase();
  if (selected.includes('administracion') && /\b(business|management|strategy|entrepreneurship)\b/.test(haystack)) {
    return false;
  }
  if (selected.includes('finanza') && /\b(economia|economics|finance)\b/.test(haystack)) {
    return false;
  }
  if (selected.includes('arquitect') && haystack.includes('urbanismo ambiental')) {
    return false;
  }
  if (
    haystack.includes('medicina.unmsm.edu.pe')
    && ['enfermer', 'tecnologia medica', 'terapia fisica', 'rehabilitacion', 'nutric'].some(term => selected.includes(term))
  ) {
    return false;
  }
  const groups = [
    ['psicologia', ['psicolog']],
    ['derecho', ['derecho']],
    ['arquitectura', ['arquitect']],
    ['economia', ['economia', 'económico', 'economico']],
    ['comunicacion', ['comunicacion', 'communication']],
    ['ingenieria ambiental', ['ambiental', 'environmental']],
    ['ingenieria civil', ['civil']],
    ['ingenieria mecatronica', ['mecatron']],
    ['hospitalidad', ['turism', 'turistic', 'hotel', 'gastron', 'culinar']],
    ['medicina', ['medicina']],
    ['enfermeria', ['enfermer']],
    ['nutricion', ['nutric']],
  ];

  for (const [careerKey, roots] of groups) {
    const sourceHasGroup = roots.some(root => haystack.includes(root));
    if (!sourceHasGroup) continue;
    const selectedHasGroup = roots.some(root => selected.includes(root)) || selected.includes(careerKey);
    if (!selectedHasGroup) return true;
  }
  return false;
}

function sourceMatchesCareer(source, careerName = '') {
  const terms = careerDistinctiveTerms(careerName);
  const matchTerms = terms.length ? terms : careerFallbackTerms(careerName);
  const equivalentRoots = careerEquivalentRoots(careerName);
  if (!matchTerms.length && !equivalentRoots.length) return false;
  const haystack = normalizeName(`${source?.url || ''} ${source?.titulo || ''}`).toLowerCase();
  if (haystack.includes('fuente exacta pendiente') || haystack.includes('url institucional base')) return false;
  if (sourceHasConflictingCareer(haystack, careerName)) return false;
  if (/academic-programs|undergraduate-programs|degree-charts\/?$|fields%20of%20concentration|graduation-requirements-all-options\/?$|bulletin\.stanford\.edu\/programs\/?$/i.test(source?.url || '')) {
    return false;
  }
  const selectedCareer = normalizeName(careerName).toLowerCase();
  if (
    selectedCareer.includes('administracion y finanzas corporativas')
    && ['economia', 'economics', 'finanza', 'finance'].some(root => haystack.includes(root))
  ) {
    return true;
  }
  return matchTerms.some(term => sourceTermMatches(haystack, term))
    || equivalentRoots.some(root => haystack.includes(root));
}

const UNIVERSITY_SOURCE_PATTERNS = {
  UPC: [/upc\.edu\.pe/i, /upc-cdn\.b-cdn\.net/i, /\bUPC\b/i],
  PUCP: [/pucp\.edu\.pe/i, /\bPUCP\b/i, /catolica del peru/i],
  ULIMA: [/ulima\.edu\.pe/i, /universidad de lima/i, /\bULIMA\b/i],
  UP: [/\/\/(?:www\.)?up\.edu\.pe/i, /universidad del pacifico/i],
  ESAN: [/ue\.edu\.pe/i, /esan/i],
  UDEP: [/udep\.edu\.pe/i, /universidad de piura/i],
  UTEC: [/utec\.edu\.pe/i, /www1\.utec\.edu\.pe/i, /\bUTEC\b/i],
  UPN: [/upn\.edu\.pe/i, /universidad privada del norte/i, /\bUPN\b/i],
  UTP: [/utp\.edu\.pe/i, /universidad tecnologica del peru/i, /\bUTP\b/i],
  UCSUR: [/cientifica\.edu\.pe/i, /universidad cientifica/i],
  UNIFE: [/unife\.edu\.pe/i, /sagrado corazon/i],
  CHAMPAGNAT: [/umch\.edu\.pe/i, /champagnat/i],
  UCH: [/uch\.edu\.pe/i, /ciencias y humanidades/i],
  UPCH: [/cayetano\.edu\.pe/i, /upch-repo/i, /cayetano heredia/i],
  USMP: [/usmp\.edu\.pe/i, /san martin de porres/i, /\bUSMP\b/i],
  UNMSM: [/unmsm\.edu\.pe/i, /san marcos/i, /\bUNMSM\b/i],
  UNI: [/uni\.edu\.pe/i, /acreditacion\.uni\.edu\.pe/i, /\bUNI\b/i],
  URP: [/urp\.edu\.pe/i, /ricardo palma/i],
  UPT: [/upt\.edu\.pe/i, /privada de tacna/i],
  UNICA: [/unica\.edu\.pe/i, /san luis gonzaga/i],
  USFQ: [/usfq\.edu\.ec/i, /wsexternal\.usfq\.edu\.ec/i],
  TEC: [/tec\.mx/i, /tecnologico de monterrey/i, /tec de monterrey/i],
  ROSARIO: [/urosario\.edu\.co/i, /universidad del rosario/i],
  AUSTRAL: [/austral\.edu\.ar/i, /universidad austral/i],
  NAVARRA: [/unav\.edu/i, /universidad de navarra/i],
  UBA: [/uba\.ar/i, /universidad de buenos aires/i],
  TORINO: [/unito\.it/i, /torino/i],
  VILLANOVA: [/villanova\.edu/i],
  USP: [/usp\.br/i, /universidade de sao paulo/i],
  JAVERIANA: [/javeriana\.edu\.co/i],
  UC_CHILE: [/uc\.cl/i, /catolica de chile/i],
  UAI_CHILE: [/uai\.cl/i, /adolfo ibanez/i],
  USS_CHILE: [/uss\.cl/i, /san sebastian/i],
  UNAM: [/unam\.mx/i],
  MIT: [/mit\.edu/i],
  STANFORD: [/stanford\.edu/i],
  HARVARD: [/harvard\.edu/i],
  CALTECH: [/caltech\.edu/i],
};

function getBenchmarkUniversityCode(universityName = '') {
  const normalized = normalizeName(universityName);
  return Object.entries(BENCHMARK_UNIVERSITIES)
    .sort((a, b) => b[1].nombre.length - a[1].nombre.length)
    .find(([code, university]) => {
      const officialName = normalizeName(university.nombre);
      const codeAsWord = new RegExp(`(^|\\s)${code.replace(/_/g, ' ')}(\\s|$)`);
      return normalized.includes(officialName) || codeAsWord.test(normalized);
    })?.[0] || null;
}

function sourceMatchesUniversity(source, universityName = '') {
  const code = getBenchmarkUniversityCode(universityName);
  if (!code) return true;
  const patterns = UNIVERSITY_SOURCE_PATTERNS[code] || [];
  if (!patterns.length) return true;
  const haystack = `${source?.url || ''} ${source?.titulo || ''}`;
  return patterns.some(pattern => pattern.test(haystack));
}

async function ensureBenchmarkingSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS universidad_benchmark (
        id_universidad_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre_universidad VARCHAR(220) NOT NULL,
        pais VARCHAR(100) NOT NULL DEFAULT 'Peru',
        ciudad VARCHAR(120) NULL,
        tipo_benchmark ENUM('competencia_directa','referente_nacional','competencia_internacional','referente_internacional','referente_tecnologico') NOT NULL,
        sitio_web VARCHAR(500) NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tipo_benchmark (tipo_benchmark)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `ALTER TABLE universidad_benchmark
        MODIFY tipo_benchmark ENUM('competencia_directa','referente_nacional','competencia_internacional','referente_internacional','referente_tecnologico') NOT NULL`,
      `CREATE TABLE IF NOT EXISTS programa_benchmark (
        id_programa_benchmark    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_universidad_benchmark INT UNSIGNED NOT NULL,
        nombre_programa          VARCHAR(300) NOT NULL,
        url_programa             VARCHAR(1000) NULL,
        carrera_equivalente_id   INT UNSIGNED NULL,
        modalidad                VARCHAR(100) NULL,
        duracion                 VARCHAR(100) NULL,
        perfil_egreso_texto      MEDIUMTEXT NULL,
        plan_estudios_texto      MEDIUMTEXT NULL,
        fuente_texto_original    MEDIUMTEXT NULL,
        fecha_captura            DATETIME NULL,
        estado_extraccion        ENUM('pendiente','procesado','error','verificado') NOT NULL DEFAULT 'pendiente',
        estado_validacion        ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado',
        observaciones            TEXT NULL,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_pb_univ (id_universidad_benchmark),
        CONSTRAINT fk_pb_univ FOREIGN KEY (id_universidad_benchmark)
          REFERENCES universidad_benchmark(id_universidad_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS benchmark_source (
        id_benchmark_source       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark     INT UNSIGNED NOT NULL,
        tipo_fuente               ENUM('pagina_programa','malla_curricular','plan_estudios','perfil_egreso','competencias','campo_laboral','acreditacion','brochure_pdf','actualizacion_curricular','repositorio','otra') NOT NULL DEFAULT 'pagina_programa',
        titulo                    VARCHAR(300) NOT NULL,
        url                       VARCHAR(1200) NOT NULL,
        estado                    ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado',
        es_fuente_principal       TINYINT(1) NOT NULL DEFAULT 0,
        fecha_captura             DATETIME NULL,
        fecha_validacion          DATETIME NULL,
        validado_por              VARCHAR(160) NULL,
        extractor                 VARCHAR(80) NULL,
        extractor_version         VARCHAR(40) NULL,
        evidencia_resumen         TEXT NULL,
        observaciones             TEXT NULL,
        snapshot_hash             VARCHAR(128) NULL,
        activo                    TINYINT(1) NOT NULL DEFAULT 1,
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_benchmark_source_url (id_programa_benchmark, url(255)),
        KEY idx_bs_programa (id_programa_benchmark),
        KEY idx_bs_estado (estado),
        KEY idx_bs_tipo (tipo_fuente),
        CONSTRAINT fk_bs_programa FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS benchmark_source_candidate (
        id_candidate              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark     INT UNSIGNED NOT NULL,
        url                       VARCHAR(1200) NOT NULL,
        titulo                    VARCHAR(400) NULL,
        snippet                   TEXT NULL,
        tipo_fuente_detectado     ENUM('pagina_programa','malla_curricular','plan_estudios','perfil_egreso','competencias','brochure_pdf','otra') NOT NULL DEFAULT 'otra',
        score_total               DECIMAL(6,2) NOT NULL DEFAULT 0,
        score_detalle_json        JSON NULL,
        estado                    ENUM('candidato','aprobado','descartado','duplicado','no_oficial') NOT NULL DEFAULT 'candidato',
        motivo                    TEXT NULL,
        buscado_en                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revisado_en               DATETIME NULL,
        revisado_por              VARCHAR(160) NULL,
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_candidate_program_url (id_programa_benchmark, url(255)),
        KEY idx_candidate_programa (id_programa_benchmark),
        KEY idx_candidate_estado (estado),
        KEY idx_candidate_score (score_total),
        CONSTRAINT fk_candidate_programa FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS benchmark_program_equivalence (
        id_equivalence            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark     INT UNSIGNED NOT NULL,
        nombre_oficial_sugerido   VARCHAR(300) NULL,
        aliases_json              JSON NULL,
        nivel_equivalencia        ENUM('exacta','parcial','cercana','referente','no_equivalente') NOT NULL DEFAULT 'cercana',
        observaciones             TEXT NULL,
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_equivalence_programa (id_programa_benchmark),
        CONSTRAINT fk_equivalence_programa FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS curso_benchmark (
        id_curso_benchmark          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark       INT UNSIGNED NOT NULL,
        nombre_curso                VARCHAR(300) NOT NULL,
        ciclo                       VARCHAR(50) NULL,
        area_formacion              VARCHAR(180) NULL,
        descripcion_curso           TEXT NULL,
        competencias_detectadas_json JSON NULL,
        tecnologias_detectadas_json  JSON NULL,
        fuente_url                   VARCHAR(1000) NULL,
        created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_cb_prog (id_programa_benchmark),
        CONSTRAINT fk_cb_prog FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS benchmark_source_snapshot (
        id_snapshot              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_benchmark_source      INT UNSIGNED NULL,
        id_programa_benchmark    INT UNSIGNED NOT NULL,
        url                      VARCHAR(1200) NOT NULL,
        url_final                VARCHAR(1200) NULL,
        titulo                   VARCHAR(500) NULL,
        texto_extraido           MEDIUMTEXT NULL,
        hash_contenido           VARCHAR(128) NOT NULL,
        parser_usado             VARCHAR(80) NULL,
        estado_parseo            ENUM('sin_parsear','parseado','requiere_revision','error') NOT NULL DEFAULT 'sin_parsear',
        cursos_detectados        INT UNSIGNED NOT NULL DEFAULT 0,
        observaciones            TEXT NULL,
        fecha_captura            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_bss_programa (id_programa_benchmark),
        KEY idx_bss_fuente (id_benchmark_source),
        KEY idx_bss_hash (hash_contenido),
        CONSTRAINT fk_bss_programa FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE,
        CONSTRAINT fk_bss_fuente FOREIGN KEY (id_benchmark_source)
          REFERENCES benchmark_source(id_benchmark_source) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS benchmark_parse_log (
        id_parse_log            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark   INT UNSIGNED NOT NULL,
        id_snapshot             INT UNSIGNED NULL,
        parser_usado            VARCHAR(80) NOT NULL,
        estado                  ENUM('ok','sin_malla','error','requiere_revision') NOT NULL DEFAULT 'ok',
        cursos_detectados       INT UNSIGNED NOT NULL DEFAULT 0,
        detalle                 TEXT NULL,
        created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_bpl_programa (id_programa_benchmark),
        KEY idx_bpl_snapshot (id_snapshot),
        CONSTRAINT fk_bpl_programa FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE,
        CONSTRAINT fk_bpl_snapshot FOREIGN KEY (id_snapshot)
          REFERENCES benchmark_source_snapshot(id_snapshot) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS competencia_benchmark (
        id_competencia_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id_programa_benchmark    INT UNSIGNED NOT NULL,
        nombre_competencia       VARCHAR(300) NOT NULL,
        descripcion_competencia  TEXT NULL,
        tipo_competencia         ENUM('tecnica','blanda','investigacion','gestion','digital','otro') NOT NULL DEFAULT 'otro',
        evidencia_textual        TEXT NULL,
        fuente_url               VARCHAR(1000) NULL,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_compb_prog (id_programa_benchmark),
        CONSTRAINT fk_compb_prog FOREIGN KEY (id_programa_benchmark)
          REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const sql of stmts) {
      try {
        await db.query(sql);
      } catch (e) {
        if (!/Duplicate column|check that column\/key exists|syntax/i.test(e.message)) throw e;
      }
    }
    const [cols] = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'programa_benchmark'
         AND COLUMN_NAME = 'estado_validacion'`
    );
    if (!cols.length) {
      await db.query(
        `ALTER TABLE programa_benchmark
         ADD COLUMN estado_validacion ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado' AFTER estado_extraccion`
      );
    }
    const [cbCols] = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'curso_benchmark'
         AND COLUMN_NAME = 'id_curso_usil_match'`
    );
    if (!cbCols.length) {
      await db.query(
        `ALTER TABLE curso_benchmark
         ADD COLUMN id_curso_usil_match INT UNSIGNED NULL AFTER fuente_url,
         ADD COLUMN match_confianza TINYINT UNSIGNED NULL AFTER id_curso_usil_match,
         ADD COLUMN match_metodo VARCHAR(30) NULL AFTER match_confianza,
         ADD COLUMN match_calculado_en TIMESTAMP NULL AFTER match_metodo,
         ADD KEY idx_cb_usil_match (id_curso_usil_match)`
      );
    }
    console.log('✅ Schema benchmarking listo en empleabilidad_usil');
  })();
  return schemaReady;
}

router.use(async (req, res, next) => {
  try { await ensureBenchmarkingSchema(); next(); } catch (e) { next(e); }
});


router.get('/mercado-laboral/benchmarking/universidades', async (req, res) => {
  try {
    const { tipo } = req.query;
    const rows = await benchmarkingRepository.getUniversidades(1, tipo || null);
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/universidades'); }
});


router.post('/mercado-laboral/benchmarking/universidades', adminOnly, async (req, res) => {
  try {
    const { nombre_universidad, pais = 'Peru', ciudad, tipo_benchmark, sitio_web } = req.body;
    if (!nombre_universidad?.trim()) return res.status(400).json({ error: 'nombre_universidad es requerido' });
    if (!TIPOS_BENCHMARK.includes(tipo_benchmark)) {
      return res.status(400).json({ error: 'tipo_benchmark inválido' });
    }
    const id = await benchmarkingRepository.createUniversidad({
      nombre_universidad: nombre_universidad.trim(), pais, ciudad, tipo_benchmark, sitio_web,
    });
    res.status(201).json({ id, nombre_universidad: nombre_universidad.trim() });
  } catch (e) { serverError(res, e, 'POST /benchmarking/universidades'); }
});


router.put('/mercado-laboral/benchmarking/universidades/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web, activo } = req.body;
    const sets = []; const params = [];
    if (nombre_universidad !== undefined) { sets.push('nombre_universidad=?'); params.push(nombre_universidad); }
    if (pais               !== undefined) { sets.push('pais=?');               params.push(pais); }
    if (ciudad             !== undefined) { sets.push('ciudad=?');             params.push(ciudad); }
    if (tipo_benchmark     !== undefined) { sets.push('tipo_benchmark=?');     params.push(tipo_benchmark); }
    if (sitio_web          !== undefined) { sets.push('sitio_web=?');          params.push(sitio_web); }
    if (activo             !== undefined) { sets.push('activo=?');             params.push(activo ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(id);
    await db.query(`UPDATE universidad_benchmark SET ${sets.join(',')} WHERE id_universidad_benchmark=?`, params);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'PUT /benchmarking/universidades/:id'); }
});


router.delete('/mercado-laboral/benchmarking/universidades/:id', adminOnly, async (req, res) => {
  try {
    await benchmarkingRepository.deleteUniversidad(req.params.id);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'DELETE /benchmarking/universidades/:id'); }
});


router.get('/mercado-laboral/benchmarking/programas', async (req, res) => {
  try {
    const { id_universidad, carrera_id } = req.query;
    const rows = await benchmarkingRepository.getProgramas(carrera_id || null, id_universidad || null, null);
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas'); }
});


router.get('/mercado-laboral/benchmarking/cobertura', async (_req, res) => {
  try {
    const carreras = await benchmarkingRepository.getCarrerasCurricularesWithFacultad();
    const rows = await benchmarkingRepository.getCoberturaStats();

    const byCareer = new Map();
    for (const row of rows) {
      if (!byCareer.has(Number(row.id_carrera))) byCareer.set(Number(row.id_carrera), {});
      byCareer.get(Number(row.id_carrera))[row.tipo_benchmark] = {
        total_programas: Number(row.total_programas) || 0,
        total_fuentes: Number(row.total_fuentes) || 0,
        fuentes_validadas: Number(row.fuentes_validadas) || 0,
        fuentes_pendientes: Number(row.fuentes_pendientes) || 0,
        ultima_revision: row.ultima_revision,
      };
    }

    res.json(carreras.map(c => {
      const benchmarking = byCareer.get(Number(c.id_carrera)) || {};
      const curatedDirect = getAllCuratedDirectBenchmarkSources(c.nombre_carrera);
      if (curatedDirect.length) {
        benchmarking.competencia_directa = {
          total_programas: new Set(curatedDirect.map(source => source.code)).size,
          total_fuentes: curatedDirect.length,
          fuentes_validadas: 0,
          fuentes_pendientes: curatedDirect.length,
          ultima_revision: new Date().toISOString(),
        };
      }
      const curatedInternational = getAllCuratedInternationalBenchmarkSources(c.nombre_carrera);
      if (curatedInternational.length) {
        benchmarking.competencia_internacional = {
          total_programas: new Set(curatedInternational.map(source => source.code)).size,
          total_fuentes: curatedInternational.length,
          fuentes_validadas: 0,
          fuentes_pendientes: curatedInternational.length,
          ultima_revision: new Date().toISOString(),
        };
      }
      return {
        ...c,
        benchmarking,
      };
    }));
  } catch (e) { serverError(res, e, 'GET /benchmarking/cobertura'); }
});


router.post('/mercado-laboral/benchmarking/seed-inicial', adminOnly, async (_req, res) => {
  try {
    await db.query(`UPDATE universidad_benchmark SET activo=0 WHERE nombre_universidad LIKE '%Cesar Vallejo%'`);
    await db.query(`UPDATE universidad_benchmark SET tipo_benchmark='competencia_internacional' WHERE tipo_benchmark='referente_tecnologico'`);
    await db.query(
      `UPDATE universidad_benchmark ub
       JOIN programa_benchmark pb ON pb.id_universidad_benchmark = ub.id_universidad_benchmark
       SET ub.tipo_benchmark='competencia_internacional'
       WHERE ub.tipo_benchmark='referente_internacional'
         AND pb.nombre_programa LIKE '%/ programa equivalente'`
    );
    await db.query(
      `UPDATE programa_benchmark
       SET estado_extraccion='pendiente', fecha_captura=NULL
       WHERE estado_extraccion='error'
         AND nombre_programa LIKE '%/ programa equivalente'`
    );

    const [carreras] = await dbCurricular.query(
      `SELECT ca.id_carrera, ca.nombre_carrera
       FROM carrera ca
       ORDER BY ca.nombre_carrera`
    );

    let carrerasMapeadas = 0;
    let universidadesCreadas = 0;
    let programasCreados = 0;
    let fuentesCreadas = 0;
    const mapeos = {};

    for (const carrera of carreras) {
      const { seed, match } = resolveBenchmarkSeed(carrera.nombre_carrera);
      carrerasMapeadas++;
      mapeos[match] = (mapeos[match] || 0) + 1;

      const curatedDirectCodes = getCuratedDirectUniversityCodesForCareer(carrera.nombre_carrera);
      const directCodes = curatedDirectCodes.length
        ? curatedDirectCodes
        : (seed.direct || []);
      const curatedInternationalCodes = getCuratedInternationalUniversityCodesForCareer(carrera.nombre_carrera);
      const internationalCodes = curatedInternationalCodes.length
        ? curatedInternationalCodes
        : (seed.international || []);
      if (curatedDirectCodes.length) {
        const directNames = curatedDirectCodes
          .map(code => BENCHMARK_UNIVERSITIES[code]?.nombre)
          .filter(Boolean);
        if (directNames.length) {
          await db.query(
            `UPDATE programa_benchmark pb
             JOIN universidad_benchmark ub
               ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
             SET pb.carrera_equivalente_id = NULL,
                 pb.observaciones = CONCAT(COALESCE(pb.observaciones, ''), '\nRetirado de competencia directa por no estar en el mapa curado vigente.')
             WHERE pb.carrera_equivalente_id = ?
               AND ub.tipo_benchmark = 'competencia_directa'
               AND ub.nombre_universidad NOT IN (?)`,
            [carrera.id_carrera, directNames]
          );
        }
      }
      if (curatedInternationalCodes.length) {
        const internationalNames = curatedInternationalCodes
          .map(code => BENCHMARK_UNIVERSITIES[code]?.nombre)
          .filter(Boolean);
        if (internationalNames.length) {
          await db.query(
            `UPDATE programa_benchmark pb
             JOIN universidad_benchmark ub
               ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
             SET pb.carrera_equivalente_id = NULL,
                 pb.observaciones = CONCAT(COALESCE(pb.observaciones, ''), '\nRetirado de competencia internacional por no estar en el mapa curado vigente.')
             WHERE pb.carrera_equivalente_id = ?
               AND ub.tipo_benchmark = 'competencia_internacional'
               AND ub.nombre_universidad NOT IN (?)`,
            [carrera.id_carrera, internationalNames]
          );
        }
      }
      const entries = [
        ...[...new Set(directCodes)].map(code => ({ code, tipo: 'competencia_directa' })),
        ...[...new Set(internationalCodes)].map(code => ({ code, tipo: 'competencia_internacional' })),
      ];

      for (const entry of entries) {
        const univ = BENCHMARK_UNIVERSITIES[entry.code];
        if (!univ) continue;

        const [existingUniv] = await db.query(
          `SELECT id_universidad_benchmark
           FROM universidad_benchmark
           WHERE nombre_universidad=? AND tipo_benchmark=?
           LIMIT 1`,
          [univ.nombre, entry.tipo]
        );
        let idUniv = existingUniv[0]?.id_universidad_benchmark;
        if (!idUniv) {
          const [rUniv] = await db.query(
            `INSERT INTO universidad_benchmark
             (nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web)
             VALUES (?,?,?,?,?)`,
            [univ.nombre, univ.pais, univ.ciudad, entry.tipo, univ.web]
          );
          idUniv = rUniv.insertId;
          universidadesCreadas++;
        }

        const nombrePrograma = `${carrera.nombre_carrera} / programa equivalente`;
        const [existingProg] = await db.query(
          `SELECT id_programa_benchmark
           FROM programa_benchmark
           WHERE id_universidad_benchmark=? AND carrera_equivalente_id=? AND nombre_programa=?
           LIMIT 1`,
          [idUniv, carrera.id_carrera, nombrePrograma]
        );
        let idProg = existingProg[0]?.id_programa_benchmark;
        if (!idProg) {
          const [rProg] = await db.query(
            `INSERT INTO programa_benchmark
             (id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, estado_validacion, observaciones)
             VALUES (?,?,?,?,?,?)`,
            [
              idUniv,
              nombrePrograma,
              null,
              carrera.id_carrera,
              'registrado',
              'Semilla inicial. Requiere que admin reemplace o complemente con URL oficial especifica de carrera, malla, perfil o plan de estudios.',
            ]
          );
          idProg = rProg.insertId;
          programasCreados++;
        }

        const curatedSources = entry.tipo === 'competencia_directa'
          ? getCuratedDirectBenchmarkSources(carrera.nombre_carrera, univ.nombre)
          : getCuratedInternationalBenchmarkSources(carrera.nombre_carrera, univ.nombre);
        if (curatedSources.length) {
          for (const [sourceIndex, source] of curatedSources.entries()) {
            const [rSource] = await db.query(
              `INSERT INTO benchmark_source
               (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
               VALUES (?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE
                 tipo_fuente=VALUES(tipo_fuente),
                 titulo=VALUES(titulo),
                 estado=VALUES(estado),
                 es_fuente_principal=VALUES(es_fuente_principal),
                 observaciones=VALUES(observaciones),
                 activo=1`,
              [
                idProg,
                source.tipoFuente,
                source.titulo,
                source.url,
                'pendiente_validacion',
                sourceIndex === 0 ? 1 : 0,
                'Fuente curada desde mapa base de benchmarking. Requiere validacion humana antes de usar como evidencia final.',
              ]
            );
            if (rSource.affectedRows) fuentesCreadas++;

            await db.query(
              `INSERT INTO benchmark_source_candidate
               (id_programa_benchmark, url, titulo, snippet, tipo_fuente_detectado,
                score_total, score_detalle_json, estado, motivo)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE
                 titulo=VALUES(titulo),
                 snippet=VALUES(snippet),
                 tipo_fuente_detectado=VALUES(tipo_fuente_detectado),
                 score_total=VALUES(score_total),
                 score_detalle_json=VALUES(score_detalle_json),
                 estado=VALUES(estado),
                 motivo=VALUES(motivo),
                 buscado_en=NOW(),
                 updated_at=CURRENT_TIMESTAMP`,
              [
                idProg,
                source.url,
                source.titulo,
                'URL curada desde mapa base de benchmarking; disponible para aprobacion/rebusqueda.',
                source.tipoFuente,
                100,
                JSON.stringify({ curada: 100, seed: 100 }),
                'aprobado',
                'Coincidencia exacta en mapa base de fuentes oficiales.',
              ]
            );
          }
          await db.query(
            `UPDATE programa_benchmark
             SET url_programa=?,
                 observaciones='Fuente curricular curada registrada. Requiere validacion humana.'
             WHERE id_programa_benchmark=?`,
            [curatedSources[0].url, idProg]
          );

          const curatedUrls = curatedSources.map(source => source.url);
          const urlPlaceholders = curatedUrls.map(() => '?').join(',');
          await db.query(
            `UPDATE benchmark_source
             SET activo=0,
                 observaciones=CONCAT(COALESCE(observaciones, ''), '\nDesactivada por no pertenecer al mapa curado vigente de esta carrera/universidad.')
             WHERE id_programa_benchmark=?
               AND activo=1
               AND url NOT IN (${urlPlaceholders})`,
            [idProg, ...curatedUrls]
          );
        } else {
          const [rSource] = await db.query(
            `INSERT IGNORE INTO benchmark_source
             (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
             VALUES (?,?,?,?,?,?,?)`,
            [
              idProg,
              'pagina_programa',
              'Fuente exacta pendiente de curaduria',
              univ.web,
              'registrado',
              1,
              'URL institucional base. No equivale a fuente curricular exacta hasta registrar pagina de carrera, malla, perfil o plan de estudios.',
            ]
          );
          if (rSource.affectedRows) fuentesCreadas++;
        }
      }
    }

    res.json({
      ok: true,
      carrerasLeidas: carreras.length,
      carrerasMapeadas,
      universidadesCreadas,
      programasCreados,
      fuentesCreadas,
      mapeos,
    });
  } catch (e) { serverError(res, e, 'POST /benchmarking/seed-inicial'); }
});


router.post('/mercado-laboral/benchmarking/programas', adminOnly, async (req, res) => {
  try {
    const { id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, modalidad, duracion } = req.body;
    if (!id_universidad_benchmark || !nombre_programa?.trim()) {
      return res.status(400).json({ error: 'id_universidad_benchmark y nombre_programa son requeridos' });
    }
    const id = await benchmarkingRepository.createPrograma({
      id_universidad_benchmark, nombre_programa: nombre_programa.trim(), url_programa,
      carrera_equivalente_id, modalidad, duracion,
    });
    res.status(201).json({ id });
  } catch (e) { serverError(res, e, 'POST /benchmarking/programas'); }
});


router.delete('/mercado-laboral/benchmarking/programas/:id', adminOnly, async (req, res) => {
  try {
    const deleted = await benchmarkingRepository.deleteProgramaIfEmpty(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Programa no encontrado' });
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'DELETE /benchmarking/programas/:id'); }
});


router.get('/mercado-laboral/benchmarking/programas/:id', async (req, res) => {
  try {
    const result = await benchmarkingRepository.getPrograma(req.params.id);
    if (!result) return res.status(404).json({ error: 'Programa no encontrado' });
    res.json(result);
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas/:id'); }
});


router.get('/mercado-laboral/benchmarking/programas/:id/fuentes', async (req, res) => {
  try {
    const rows = await benchmarkingRepository.getFuentes(req.params.id);
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas/:id/fuentes'); }
});


router.post('/mercado-laboral/benchmarking/programas/:id/fuentes', adminOnly, async (req, res) => {
  try {
    const {
      tipo_fuente = 'pagina_programa',
      titulo,
      url,
      estado = 'registrado',
      es_fuente_principal = false,
      evidencia_resumen,
      observaciones,
    } = req.body;
    if (!titulo?.trim() || !url?.trim()) return res.status(400).json({ error: 'titulo y url son requeridos' });
    const result = await benchmarkingRepository.upsertBenchmarkSource({
      idProg: req.params.id, tipoFuente: tipo_fuente, titulo: titulo.trim(), url: url.trim(),
      estado, esFilasPrincipal: es_fuente_principal, evidenciaResumen: evidencia_resumen, observaciones,
    });
    res.status(201).json({ id: result.insertId || null, ok: true });
  } catch (e) { serverError(res, e, 'POST /benchmarking/programas/:id/fuentes'); }
});


router.put('/mercado-laboral/benchmarking/fuentes/:id', adminOnly, async (req, res) => {
  try {
    const allowed = ['tipo_fuente','titulo','url','estado','es_fuente_principal','fecha_captura','fecha_validacion','validado_por','extractor','extractor_version','evidencia_resumen','observaciones','activo'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key}=?`);
        params.push(key === 'es_fuente_principal' || key === 'activo' ? (req.body[key] ? 1 : 0) : req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await db.query(`UPDATE benchmark_source SET ${sets.join(', ')} WHERE id_benchmark_source=?`, params);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'PUT /benchmarking/fuentes/:id'); }
});


router.post('/mercado-laboral/benchmarking/scraping', adminOnly, async (req, res) => {
  try {
    const { ids, texto_manual, url_origen, id_programa } = req.body;

    if (texto_manual && id_programa) {
      const r = await cargarTextoManual(id_programa, texto_manual, url_origen);
      return res.json(r);
    }

    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'Envía "ids" (array de id_programa_benchmark) o "texto_manual" + "id_programa"' });
    }
    if (ids.length > 10) return res.status(400).json({ error: 'Máximo 10 programas por lote' });

    const results = await scraperBatch(ids);
    res.json({ results });
  } catch (e) { serverError(res, e, 'POST /benchmarking/scraping'); }
});


router.post('/mercado-laboral/benchmarking/descubrir-fuentes', adminOnly, async (req, res) => {
  try {
    const { id_programa, ids } = req.body;
    const targetIds = Array.isArray(ids) && ids.length ? ids : (id_programa ? [id_programa] : []);
    if (!targetIds.length) return res.status(400).json({ error: 'id_programa o ids es requerido' });
    if (targetIds.length > 10) return res.status(400).json({ error: 'Maximo 10 programas por busqueda' });

    const results = [];
    for (const id of targetIds) {
      const result = await discoverOfficialSources(id);
      results.push({ id, ...result });
    }
    res.json({ results });
  } catch (e) { serverError(res, e, 'POST /benchmarking/descubrir-fuentes'); }
});


router.get('/mercado-laboral/benchmarking/programas/:id/candidatos', async (req, res) => {
  try {
    const incluirHistorial = req.query.historial === '1';
    const rows = await benchmarkingRepository.getCandidatos(req.params.id, incluirHistorial);
    res.json(rows);
  } catch (e) { serverError(res, e, 'GET /benchmarking/programas/:id/candidatos'); }
});


router.post('/mercado-laboral/benchmarking/candidatos/:id/aprobar', adminOnly, async (req, res) => {
  try {
    const candidate = await benchmarkingRepository.getCandidatoWithPrograma(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidato no encontrado' });

    const usuario = req.user?.email || req.user?.nombre || 'admin';
    await benchmarkingRepository.demoteCandidatosAprobados(candidate.id_programa_benchmark, req.params.id);
    await benchmarkingRepository.approveCandidato(req.params.id, usuario);
    await benchmarkingRepository.upsertBenchmarkSource({
      idProg: candidate.id_programa_benchmark,
      tipoFuente: candidate.tipo_fuente_detectado || 'pagina_programa',
      titulo: candidate.titulo || `Fuente oficial sugerida para ${candidate.nombre_programa}`,
      url: candidate.url,
      estado: 'pendiente_validacion',
      esFilasPrincipal: true,
      evidenciaResumen: `Aprobada desde candidatos. Score ${candidate.score_total}.`,
      observaciones: candidate.motivo || null,
    });
    await benchmarkingRepository.demoteOtherBenchmarkSources(candidate.id_programa_benchmark, candidate.url);
    await benchmarkingRepository.updateProgramaAprobado(
      candidate.id_programa_benchmark, candidate.url, candidate.score_total
    );
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'POST /benchmarking/candidatos/:id/aprobar'); }
});


router.post('/mercado-laboral/benchmarking/candidatos/:id/descartar', adminOnly, async (req, res) => {
  try {
    const usuario = req.user?.email || req.user?.nombre || 'admin';
    await benchmarkingRepository.discardCandidato(req.params.id, req.body?.motivo || null, usuario);
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'POST /benchmarking/candidatos/:id/descartar'); }
});


router.put('/mercado-laboral/benchmarking/programas/:id/equivalencia', adminOnly, async (req, res) => {
  try {
    const { nombre_oficial_sugerido, aliases = [], nivel_equivalencia = 'cercana', observaciones } = req.body;
    await benchmarkingRepository.upsertEquivalencia(req.params.id, {
      nombre_oficial_sugerido, aliases, nivel_equivalencia, observaciones,
    });
    res.json({ ok: true });
  } catch (e) { serverError(res, e, 'PUT /benchmarking/programas/:id/equivalencia'); }
});


router.post('/mercado-laboral/benchmarking/normalizar-ia', adminOnly, async (req, res) => {
  try {
    const { id_programa } = req.body;
    if (!id_programa) return res.status(400).json({ error: 'id_programa es requerido' });
    const result = await normalizarPrograma(id_programa);
    res.json(result);
  } catch (e) { serverError(res, e, 'POST /benchmarking/normalizar-ia'); }
});


router.post('/mercado-laboral/benchmarking/programas/:id/match-ia', adminOnly, async (req, res) => {
  try {
    const result = await matchCursosInternacionales(req.params.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    // TEMP DEBUG: surface real error message in prod to diagnose match-ia 500s. Revert after diagnosis.
    console.error('[match-ia debug]', e?.message, e?.stack);
    res.status(500).json({ error: e?.message || 'Error interno del servidor.', debug: true });
  }
});


router.get('/mercado-laboral/benchmarking/comparar/:idCarrera', async (req, res) => {
  try {
    const { idCarrera } = req.params;
    const { competencias, cursos } = await benchmarkingRepository.getCompararData(idCarrera);
    res.json({ competencias, cursos });
  } catch (e) { serverError(res, e, 'GET /benchmarking/comparar/:idCarrera'); }
});


router.get('/mercado-laboral/benchmarking/comparar/:idCarrera/:tipoBenchmark', async (req, res) => {
  try {
    const { idCarrera, tipoBenchmark } = req.params;
    if (!TIPOS_BENCHMARK.includes(tipoBenchmark)) {
      return res.status(400).json({ error: 'tipoBenchmark inválido' });
    }
    const [{ competencias, programas }, carrera] = await Promise.all([
      benchmarkingRepository.getCompararByTipo(idCarrera, tipoBenchmark),
      benchmarkingRepository.getCarreraByIdCurricular(idCarrera),
    ]);
    const carreraNombre = carrera?.nombre_carrera || '';
    const curatedDirectCodes = tipoBenchmark === 'competencia_directa'
      ? getCuratedDirectUniversityCodesForCareer(carreraNombre)
      : [];
    const curatedInternationalCodes = tipoBenchmark === 'competencia_internacional'
      ? getCuratedInternationalUniversityCodesForCareer(carreraNombre)
      : [];
    const curatedCodes = curatedDirectCodes.length ? curatedDirectCodes : curatedInternationalCodes;
    const programasFiltrados = curatedCodes.length
      ? programas.filter(programa => curatedCodes.includes(getBenchmarkUniversityCode(programa.nombre_universidad)))
      : programas;
    const ids = programasFiltrados.map(p => p.id_programa_benchmark);
    const [fuentesArr, candidatosArr, cursosArr] = ids.length
      ? await Promise.all([
          benchmarkingRepository.getFuentesByProgramas(ids),
          benchmarkingRepository.getCandidatosByProgramas(ids),
          benchmarkingRepository.getCursosByProgramas(ids),
        ])
      : [[], [], []];

    const fuentesByPrograma = fuentesArr.reduce((map, fuente) => {
      const list = map.get(fuente.id_programa_benchmark) || [];
      list.push(fuente);
      map.set(fuente.id_programa_benchmark, list);
      return map;
    }, new Map());

    const candidatosByPrograma = candidatosArr.reduce((map, candidato) => {
      const list = map.get(candidato.id_programa_benchmark) || [];
      list.push(candidato);
      map.set(candidato.id_programa_benchmark, list);
      return map;
    }, new Map());

    const cursosByPrograma = cursosArr.reduce((map, curso) => {
      const list = map.get(curso.id_programa_benchmark) || [];
      const ciclo = curso.ciclo && String(curso.ciclo).trim() ? String(curso.ciclo).trim() : 'S/C';
      list.push({ ...curso, ciclo });
      map.set(curso.id_programa_benchmark, list);
      return map;
    }, new Map());

    const programasDepurados = programasFiltrados.map(programa => {
      const nombreCarreraParaFiltro = carreraNombre || getBenchmarkProgramBaseName(programa.nombre_programa);
      const sourceMatchesProgram = source =>
        sourceMatchesCareer(source, nombreCarreraParaFiltro)
        && sourceMatchesUniversity(source, programa.nombre_universidad);
      const curated = getCuratedSourcesByBenchmarkType(
        nombreCarreraParaFiltro,
        programa.nombre_universidad,
        tipoBenchmark
      )
        .map(source => ({
          titulo: source.titulo,
          url: source.url,
          tipo_fuente: source.tipoFuente,
          estado: 'pendiente_validacion',
        }))
        .filter(source => sourceMatchesUniversity(source, programa.nombre_universidad));
      const dbFuentes = (fuentesByPrograma.get(programa.id_programa_benchmark) || [])
        .filter(sourceMatchesProgram);
      const mergedSources = [...dbFuentes, ...curated].reduce((map, source) => {
        if (!source?.url) return map;
        const key = String(source.url).replace(/\/$/, '').toLowerCase();
        if (!map.has(key)) map.set(key, source);
        return map;
      }, new Map());
      const fuentes = [...mergedSources.values()];
      const candidatosUtiles = (candidatosByPrograma.get(programa.id_programa_benchmark) || [])
        .filter(sourceMatchesProgram);

      return {
        ...programa,
        url_programa: fuentes[0]?.url || null,
        total_fuentes: fuentes.length,
        fuentes_validadas: fuentes.filter(f => f.estado === 'validado').length,
        fuentes_pendientes: fuentes.filter(f => f.estado !== 'validado').length,
        total_candidatos: candidatosUtiles.length,
        cursos: cursosByPrograma.get(programa.id_programa_benchmark) || [],
      };
    });

    res.json({ programas: programasDepurados, competencias, tipo: tipoBenchmark });
  } catch (e) { serverError(res, e, 'GET /benchmarking/comparar/:idCarrera/:tipoBenchmark'); }
});

export default router;
