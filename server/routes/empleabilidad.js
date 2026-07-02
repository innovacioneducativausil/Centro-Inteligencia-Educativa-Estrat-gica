import { serverError } from '../middleware/errorHandler.js';

import { Router } from 'express';
import multer     from 'multer';
import xlsx       from 'xlsx';
import db         from '../db_empl.js';
import { adminOrAnalyst } from '../middleware/roles.js';
import { validateExcelUpload, validateWorkbookShape } from '../utils/security.js';
import { auditEvent } from '../services/auditService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const error = validateExcelUpload(file);
    cb(error ? new Error(error) : null, !error);
  },
});

const ANOS = [2022, 2023, 2024, 2025];


function findCol(headers, ...keywords) {
  return headers.find(h =>
    keywords.every(k => h.toLowerCase().includes(k.toLowerCase()))
  ) ?? null;
}


function yearOf(colName) {
  const m = colName?.match(/20(2[2-9])/);
  return m ? parseInt('20' + m[1]) : null;
}


function parseTrabaja(val) {
  if (!val) return false;
  const v = String(val).trim();
  const n = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


  if (/no\s+me\s+encuentro\s+laborando/.test(n)) return false;
  if (/^(no|0|false)$/.test(n)) return false;
  if (/no\s+trabaj|sin\s+empleo/.test(n)) return false;
  if (/no\s+labora/.test(n)) return false;

  if (/^s[i]?$/.test(n)) return true;
  if (/trabaj/i.test(v))    return true;
  if (/labora/i.test(v))    return true;
  if (/emprend/i.test(v))   return true;
  if (/con\s*empleo/i.test(v)) return true;
  if (/dependiente/i.test(v))  return true;
  if (/independiente/i.test(v)) return true;
  if (/^(yes|1|true)$/i.test(v)) return true;
  return false;
}


function parseSiNo(val) {
  if (val === null || val === undefined) return false;
  if (val === true  || val === 1)  return true;
  if (val === false || val === 0)  return false;
  const v = String(val).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /^(s|si|yes|true|1)$/.test(v);
}


const norm = v => String(v ?? '').trim().toUpperCase();


function normalizeTipoProg(raw) {
  const n = String(raw ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!n) return raw;
  if (n.includes('cpel') || (n.includes('pregrado') && n.includes('ejecutivo'))) return 'CPEL';
  if (n.startsWith('pre') && !n.includes('ejecutivo')) return 'PREGRADO';
  if (n.includes('epg') || n.includes('postgrado')) return 'EPG';
  if (n === 'ie' || n.includes('emprendedores')) return 'IE';
  return norm(raw);
}


const _SALARY_BANDS = {
  B1: { rango: 'Menos de S/. 1,500',                min: 0,    max: 1499.99 },
  B2: { rango: 'De S/. 1,500 a menos de S/. 3,500', min: 1500, max: 3499.99 },
  B3: { rango: 'De S/. 3,500 a menos de S/. 5,500', min: 3500, max: 5499.99 },
  B4: { rango: 'De S/. 5,500 a menos de S/. 7,500', min: 5500, max: 7499.99 },
  B5: { rango: 'De S/. 7,500 a mas',                min: 7500, max: null   },
};

const SALARY_NORM_ENTRIES = [

  ['Menos de S/. 1,500',                                    _SALARY_BANDS.B1],
  ['De S/. 1,500 a menos de S/. 3,500',                     _SALARY_BANDS.B2],
  ['De S/. 3,500 a menos de S/. 5,500',                     _SALARY_BANDS.B3],
  ['De S/. 5,500 a menos de S/. 7,500',                     _SALARY_BANDS.B4],
  ['De S/. 7,500 a mas',                                    _SALARY_BANDS.B5],

  ['Sueldo hasta 2 salarios mínimos (sueldo mínimo S/1025)', _SALARY_BANDS.B2],
  ['Sueldo hasta 4 salarios mínimos (hasta S/4100)',         _SALARY_BANDS.B3],
  ['Sueldo superior a 4 salarios mínimos',                   _SALARY_BANDS.B4],
  ['Sueldo hasta 2 salarios minimos',                        _SALARY_BANDS.B2],
  ['Sueldo hasta 4 salarios minimos',                        _SALARY_BANDS.B3],
  ['Sueldo hasta 6 salarios minimos',                        _SALARY_BANDS.B4],
  ['Sueldo mas de 6 salarios minimos',                       _SALARY_BANDS.B5],

  ['Menos de S/. 1,025',                                    _SALARY_BANDS.B1],
  ['De S/. 1,025 a menos de S/. 1,500',                     _SALARY_BANDS.B1],
  ['De S/. 1,500 a menos de S/. 2,500',                     _SALARY_BANDS.B2],
  ['De S/. 2,500 a menos de S/. 3,500',                     _SALARY_BANDS.B2],
  ['De S/. 3,500 a menos de S/. 4,500',                     _SALARY_BANDS.B3],
  ['De S/. 4,500 a menos de S/. 5,500',                     _SALARY_BANDS.B3],
  ['De S/. 5,500 a menos de S/. 6,500',                     _SALARY_BANDS.B4],
  ['De S/. 6,500 a menos de S/. 7,500',                     _SALARY_BANDS.B4],
  ['De S/. 7,500 a más',                                     _SALARY_BANDS.B5],
  ['De S/7,500 a menos de S/. 8,500',                       _SALARY_BANDS.B5],
  ['De S/. 8500 a menos de S/. 9,500',                      _SALARY_BANDS.B5],
  ['Más de S/. 9,500',                                       _SALARY_BANDS.B5],
  ['Mas de S/. 9,500',                                       _SALARY_BANDS.B5],

  ['De S/. 5,500 a más',                                     _SALARY_BANDS.B4],
  ['De S/. 5,500 a mas',                                     _SALARY_BANDS.B4],

  ['Menos de S/. 2,500',                                     _SALARY_BANDS.B2],
  ['De S/. 2,500 a menos de S/. 4,500',                      _SALARY_BANDS.B3],
  ['De S/. 4,500 a menos de S/. 6,500',                      _SALARY_BANDS.B4],
  ['De S/. 6,500 a menos de S/. 8,500',                      _SALARY_BANDS.B4],
  ['De S/. 8,500 a mas',                                     _SALARY_BANDS.B5],
  ['De S/. 8,500 a más',                                      _SALARY_BANDS.B5],

  ['De S/. 5,500 a menos de S/6,500',                        _SALARY_BANDS.B4],
  ['De S/. 6,500 a menos de S/7,500',                        _SALARY_BANDS.B4],
  ['De S/7,500 a menos de S/8,500',                          _SALARY_BANDS.B5],
  ['De s/. 1,025 a menos de S/. 1500',                       _SALARY_BANDS.B1],
  ['De s/. 1,025 a menos de S/. 1,500',                      _SALARY_BANDS.B1],
  ['De S/. 1,500 a menos de S/. 3,000',                      _SALARY_BANDS.B2],
  ['De S/. 3,000 a menos de S/. 6,000',                      _SALARY_BANDS.B3],
  ['De S/. 6,000 a mas',                                     _SALARY_BANDS.B5],
];


const SALARY_MAP_EXACT = new Map(SALARY_NORM_ENTRIES);


const SALARY_MAP_NORM  = new Map(
  SALARY_NORM_ENTRIES.map(([k, v]) => [
    k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(),
    v,
  ])
);


function resolveCanonicalSalario(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (SALARY_MAP_EXACT.has(s)) return SALARY_MAP_EXACT.get(s);
  const n = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return SALARY_MAP_NORM.get(n) ?? null;
}


async function resolveSalarioId(rawSalario) {
  if (!rawSalario) return null;

  const [existing] = await db.query(
    'SELECT id_salario FROM catalogo_salario WHERE descripcion_original=? LIMIT 1',
    [rawSalario]
  );
  if (existing.length) return existing[0].id_salario;


  const canonico = resolveCanonicalSalario(rawSalario);
  const estandar = canonico?.rango ?? rawSalario;
  const minSoles = canonico?.min   ?? null;
  const maxSoles = canonico?.max   ?? null;

  const [ins] = await db.query('INSERT IGNORE INTO catalogo_salario SET ?', {
    descripcion_original: rawSalario,
    rango_estandar:       estandar,
    rango_min_soles:      minSoles,
    rango_max_soles:      maxSoles,
  });
  if (ins.insertId) return ins.insertId;


  const [retry] = await db.query(
    'SELECT id_salario FROM catalogo_salario WHERE descripcion_original=? LIMIT 1',
    [rawSalario]
  );
  return retry.length ? retry[0].id_salario : null;
}


function addAnioFilter(where, params, anio, anios) {
  if (anios) {
    const list = String(anios).split(',').map(s => s.trim()).filter(s => /^20\d{2}$/.test(s));
    if (list.length === 1) {
      where.push('ea.anio_encuesta = ?'); params.push(list[0]);
    } else if (list.length > 1) {
      where.push(`ea.anio_encuesta IN (${list.map(() => '?').join(',')})`); params.push(...list);
    }
  } else if (anio) {
    where.push('ea.anio_encuesta = ?'); params.push(anio);
  }
}


function normalizeCiclo(s) {
  if (!s) return s;
  return s.replace(/^(\d{4})-(\d)$/, '$1-0$2');
}

function parseCicloParts(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  const m = raw.match(/^(CPEL\s*)?(20\d{2})(?:-(\d{1,2}))?$/i);
  if (!m) return null;
  const prefix = m[1] ? 'CPEL ' : '';
  const year = m[2];
  const period = m[3] == null ? null : String(Number(m[3])).padStart(2, '0');
  return { prefix, year, period };
}

function canonicalCiclo(value) {
  const parts = parseCicloParts(value);
  if (!parts) {
    const raw = String(value || '').trim().replace(/\s+/g, ' ');
    return { code: raw, label: raw, sort: raw };
  }
  const code = parts.period == null ? `${parts.prefix}${parts.year}` : `${parts.prefix}${parts.year}-${parts.period}`;
  const sortPeriod = parts.period == null ? '01-base' : `${parts.period}-explicit`;
  return { code, label: code, sort: `${parts.year}-${sortPeriod}-${parts.prefix || 'A'}` };
}

function cicloVariants(value) {
  const parts = parseCicloParts(value);
  if (!parts) return [String(value || '').trim()].filter(Boolean);
  if (parts.period == null) return [`${parts.prefix}${parts.year}`];
  const base = `${parts.prefix}${parts.year}`;
  return [...new Set([`${base}-${parts.period}`, `${base}-${String(Number(parts.period))}`])];
}

function addCicloFilter(where, params, ciclo) {
  if (!ciclo) return;
  const variants = cicloVariants(ciclo);
  if (variants.length === 1) {
    where.push('ce.codigo_ciclo = ?');
    params.push(variants[0]);
    return;
  }
  where.push(`ce.codigo_ciclo IN (${variants.map(() => '?').join(',')})`);
  params.push(...variants);
}


async function upsertGet(table, whereObj, insertObj = {}) {
  const conds = Object.entries(whereObj);
  const [rows] = await db.query(
    `SELECT * FROM ${table} WHERE ${conds.map(([k]) => `${k}=?`).join(' AND ')} LIMIT 1`,
    conds.map(([, v]) => v)
  );
  if (rows.length) return rows[0][Object.keys(rows[0])[0]];
  const data = { ...whereObj, ...insertObj };
  const [r] = await db.query(`INSERT INTO ${table} SET ?`, data);
  return r.insertId;
}

async function resolvePuestoId(puestoOficial) {
  if (!puestoOficial) return null;
  const [pRows] = await db.query(
    'SELECT id_puesto FROM catalogo_puesto WHERE texto_busqueda=? LIMIT 1',
    [puestoOficial]
  );
  if (pRows.length) return pRows[0].id_puesto;

  const [pRows2] = await db.query(
    'SELECT id_puesto FROM catalogo_puesto WHERE ? LIKE CONCAT("%", texto_busqueda, "%") LIMIT 1',
    [puestoOficial]
  );
  return pRows2.length ? pRows2[0].id_puesto : null;
}

async function upsertEmpleo(idEncuesta, data) {
  const [emRows] = await db.query('SELECT id_empleo FROM empleo WHERE id_encuesta=? LIMIT 1', [idEncuesta]);
  if (emRows.length) {
    await db.query(
      'UPDATE empleo SET centro_laboral=?, rubro=?, area_trabajo=?, puesto_libre=?, id_puesto=? WHERE id_encuesta=?',
      [data.centro_laboral, data.rubro, data.area_trabajo, data.puesto_libre, data.id_puesto, idEncuesta]
    );
  } else {
    await db.query('INSERT INTO empleo SET ?', { id_encuesta: idEncuesta, ...data });
  }
}


function parseWorkbook(buffer) {
  const wb   = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });
  const shapeError = validateWorkbookShape(raw);
  if (shapeError) throw new Error(shapeError);
  if (!raw.length) return { headers: [], rows: [] };
  return { headers: Object.keys(raw[0]), rows: raw };
}


function assignField(map, yr, h) {
  if (!map[yr]) map[yr] = {};
  const hl = h.toLowerCase().trim();


  if (hl.includes('ac empl')) { map[yr].acEmpl = h; return; }


  if (hl.includes('situaci') && (hl.includes('laboral') || hl.includes('actual'))) {
    map[yr].situacion = h; return;
  }


  if (hl.includes('centro laboral') || (hl.includes('raz') && hl.includes('social'))) {
    map[yr].centroLaboral = h; return;
  }
  if (hl.includes('rubro')) { map[yr].rubro = h; return; }
  if (hl.includes('área') || (hl.includes('area') && hl.includes('trabajo'))) {
    map[yr].area = h; return;
  }


  if (hl.includes('puesto oficial') || hl.includes('sto ofici')) {
    map[yr].puestoOficial = h; return;
  }
  if (hl.includes('nivel') && hl.includes('puesto')) { map[yr].nivelPuesto = h; return; }
  if (hl.includes('puesto') && !hl.includes('nivel') && !hl.includes('oficial')) {
    map[yr].puesto = h; return;
  }


  if (hl.trim() === 'salario promedio') { map[yr].salario = h; return; }
  if (hl.includes('salario') && !map[yr].salario) { map[yr].salario = h; return; }


  if (hl.includes('afinid'))                                              { map[yr].afinidad = h; return; }
  if (hl.includes('posici') && hl.includes('guard'))                     { map[yr].afinidad = h; return; }
  if (hl.includes('relaci') && (hl.includes('carrer') || hl.includes('posici'))) { map[yr].afinidad = h; return; }
  if (hl.includes('guard')  && hl.includes('relaci'))                    { map[yr].afinidad = h; return; }


  if (hl.includes('satisf')) { map[yr].satisfaccion = h; return; }


  if (hl.includes('emprend') || hl.endsWith('emprende') || hl === 'emprende') { map[yr].emprende = h; return; }
}


function detectYearColumns(headers) {
  const map = {};


  for (const h of headers) {
    const yr = yearOf(h);
    if (!yr) continue;
    assignField(map, yr, h);
  }


  const yr2022Start = headers.findIndex(h => yearOf(h) === 2022);
  if (yr2022Start >= 0) {
    const nextYrIdx = headers.findIndex((h, i) => i > yr2022Start && (yearOf(h) ?? 0) > 2022);
    const endIdx    = nextYrIdx > 0 ? nextYrIdx : headers.length;
    for (let i = yr2022Start + 1; i < endIdx; i++) {
      const h = headers[i];
      if (yearOf(h)) continue;
      assignField(map, 2022, h);
    }
  }

  return map;
}


async function callHFMapping(headers) {
  const apiKey = process.env.HF_API_KEY_MAPPING || process.env.HF_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are a precise data mapping assistant for a Peruvian university graduate employability tracking system.

Map each Excel column to the correct database field. Use the EXACT mappings shown below as your reference.

═══════════════════════════════════════════════
FIXED STUDENT FIELDS (appear once, no year prefix)
═══════════════════════════════════════════════
Excel column            → DB field (key)
"DNI"                   → nro_doc
"APELLIDOS Y NOMBRES COMPLETOS" → apellidos_nombres
"Correo"                → correo
"CARRERA"               → nombre_carrera
"FACULTAD"              → nombre_facultad
"Programa"              → tipo_programa
"CADMISIÓN"             → codigo_ciclo

═══════════════════════════════════════════════
ANNUAL SURVEY FIELDS — repeated for each year 2022/2023/2024/2025
Each field below exists for EVERY year. The prefix Q_YYYY. indicates the year.
═══════════════════════════════════════════════

Excel column pattern                                          → DB key
"Q_YYYY.Ac Empl"                                              → acEmpl
  (SI/NO indicator whether the graduate is employed that year)

"Q_YYYY.Actualmente, ¿cuál es tu situación laboral?"          → situacion
  (Full text of labor situation: "Trabaja en relación de dependencia", "No trabaja", etc.)
  IMPORTANT: this is the descriptive TEXT field, maps to encuesta_anual.situacion_laboral

"Q_YYYY.Nombre del centro laboral (Razón Social):"            → centroLaboral
  (Employer / company name — maps to empleo.centro_laboral)

"Q_YYYY.RUBRO"                                                → rubro
  (Economic sector / industry — maps to empleo.rubro)

"Q_YYYY.Área de trabajo:"                                     → area
  (Work department or area — maps to empleo.area_trabajo)

"Q_YYYY.PUESTO"                                               → puesto
  (Job title as written freely by the graduate — maps to empleo.puesto_libre)

"Q_YYYY.PUESTO OFICIAL"                                       → puestoOficial
  (Standardized official job title — maps to empleo.id_puesto via catalog)

"Q_YYYY.NIVEL DE PUESTO"                                      → nivelPuesto
  (Hierarchical level: Alto / Medio / Operativo — maps to encuesta_anual.nivel_puesto)

"Q_YYYY.¿Cuál es tu salario promedio?"                        → IGNORAR

"Q_YYYY.SALARIO PROMEDIO"                                     → salario
  (Standardized salary range — maps to encuesta_anual.id_salario via catalog)
  NOTE: prefer this over the free-text salary question above

"Q_YYYY.¿Tu posición laboral guarda relación con tu carrera?" → afinidad
  (YES/NO job-career alignment — maps to encuesta_anual.afinidad_laboral)

"Q_YYYY.Indique su nivel de satisfacción con el área académica" → satisfaccion
  (Satisfaction with university education — maps to encuesta_anual.satisfaccion_usil)

"Q_YYYY.EMPRENDEDOR" or "Q_YYYY.EMPRENDE"                    → emprende
  (YES/NO entrepreneur flag — maps to encuesta_anual.es_emprendedor)
  NOTE: year 2025 uses "EMPRENDE" instead of "EMPRENDEDOR" — both map to emprende

═══════════════════════════════════════════════
SPECIAL CASE — YEAR 2022
═══════════════════════════════════════════════
For year 2022, ONLY "Q_2022.Ac Empl" has the Q_2022. prefix.
ALL other 2022 survey columns appear WITHOUT any year prefix.
They are the columns that appear in the list AFTER "Q_2022.Ac Empl" and BEFORE the first "Q_2023." column.
Example: "Nombre del centro laboral (Razón Social):" with no prefix → centroLaboral for year 2022.
Also note: year 2022 has NO "Actualmente, ¿cuál es tu situación laboral?" column and NO EMPRENDEDOR column.

═══════════════════════════════════════════════
EXCEL COLUMNS TO MAP (in order, numbered):
═══════════════════════════════════════════════
${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

RULES:
1. Replace YYYY with the actual year (2022, 2023, 2024, or 2025).
2. Columns that don't match any field → put in "ignorar".
3. Free-text salary questions ("¿Cuál es tu salario promedio?") → ALWAYS go to "ignorar".
4. Use the column name EXACTLY as it appears in the list above.

Respond with ONLY valid compact JSON, no markdown, no explanation:
{"fijos":{"COLUMN_NAME":"field_key"},"anual":{"2022":{"COLUMN_NAME":"field_key"},"2023":{"COLUMN_NAME":"field_key"},"2024":{"COLUMN_NAME":"field_key"},"2025":{"COLUMN_NAME":"field_key"}},"ignorar":["COLUMN_NAME"]}`;

  try {
    const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-7B-Instruct:together',
        messages: [
          {
            role: 'system',
            content: 'You are a precise data mapping assistant. Always respond with valid JSON only, no markdown, no explanations.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0,
      }),
    });

    if (!r.ok) return null;
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';


    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}


function aiToYearCols(aiMapping) {
  const yearCols = {};
  for (const [yrStr, fields] of Object.entries(aiMapping.anual || {})) {
    const yr = parseInt(yrStr);
    yearCols[yr] = {};
    for (const [colName, key] of Object.entries(fields)) {
      yearCols[yr][key] = colName;
    }
  }
  return yearCols;
}


function aiToFixedCols(aiMapping, headers) {
  const fieldToVar = {
    nro_doc:          'colDoc',
    apellidos_nombres:'colNombre',
    correo:           'colCorreo',
    nombre_carrera:   'colCarrera',
    nombre_facultad:  'colFacultad',
    tipo_programa:    'colPrograma',
    codigo_ciclo:     'colCiclo',
  };
  const result = {};
  for (const [colName, campo] of Object.entries(aiMapping.fijos || {})) {
    const varName = fieldToVar[campo];
    if (varName && headers.includes(colName)) result[varName] = colName;
  }
  return result;
}


function detectFormat(headers) {
  if (headers.some(h => /Q_20[2-9]\d\./i.test(h))) return 'wide';
  const hl = headers.map(h => h.toLowerCase().trim());
  if (hl.some(h => h.includes('año') && h.includes('egreso')) ||
      hl.some(h => h.includes('situaci') && h.includes('laboral')) ||
      hl.some(h => h === 'ac empl')) return 'tall';
  return 'wide';
}


function parseTallMeta(headers) {
  const sitCol = headers.find(h => /situaci.*laboral/i.test(h));
  const anioM  = sitCol?.match(/(20[2-9]\d)/);
  const trimM  = sitCol?.match(/\b(Q[1-4])\b/i);

  return {
    anio:      anioM ? parseInt(anioM[1]) : null,
    trimestre: trimM ? trimM[1].toUpperCase() : 'ANUAL',
    colSit:    sitCol || null,
  };
}


const CANONICAL_TRIMESTRE = 'Q4';


function detectTallCols(headers) {

  const norm2 = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const f = kws => headers.find(h => {
    const hn = norm2(h);
    return kws.every(k => hn.includes(norm2(k)));
  }) ?? null;

  return {
    colDoc:      f(['dni']) || f(['nro_doc']) || f(['nro', 'doc']),
    colNombre:   f(['apellido']) || f(['apellidos_nombres']) || f(['nombre']),
    colPrograma: f(['program']) || f(['tipo_programa']),
    colFacultad: f(['facult']) || f(['nombre_facult']),
    colCarrera:  f(['carrera']) || f(['nombre_carrera']),
    colEgreso:   headers.find(h => /^egreso$/i.test(h.trim()))
             || headers.find(h => /cadmisi/i.test(h))
             || f(['id_ciclo']) || f(['ciclo_egreso']) || f(['egreso']),
    colAnioEg:   headers.find(h => /a[ñn]o.?egreso/i.test(norm2(h))) || null,

    colSit:      f(['situaci', 'laboral'])
               || f(['situacion', 'laboral'])
               || f(['situac'])
               || null,

    colAcEmpl:   headers.find(h => /^ac\s+empl$/i.test(h.trim())) || f(['ac', 'empl']) || null,
    colCorreo:   f(['correo']),
    colAfinidad: f(['afinid'])
               || f(['guard', 'relaci'])
               || f(['relaci', 'carrer'])
               || f(['relaci', 'posici'])
               || f(['posici', 'laboral', 'carrera']),
    colNivel:    f(['nivel', 'puesto']),
    colCentro:   f(['centro', 'laboral']) || f(['razon', 'social']),
    colRubro:    headers.find(h => /^rubro:?$/i.test(h.trim())) || f(['rubro']),
    colArea:     headers.find(h => /^area de trabajo:?$/i.test(norm2(h).trim()))
               || f(['area', 'trabajo']),
    colPuesto:   headers.find(h => /^puesto$/i.test(h.trim()))
               || f(['puesto', 'ocupas'])
               || f(['puesto']),
    colPuestoOficial: f(['puesto', 'oficial']),

    colSalario:  headers.find(h => /^salario\s+promedio$/i.test(h.trim()))
               || f(['rango', 'salarial']) || f(['rango', 'sal']) || f(['salari']),
    colEmprende: f(['emprend']) || f(['emprende']),
    colSatisf:   f(['satisf']),
  };
}


router.post('/empleabilidad/debug-headers', adminOrAnalyst, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  const { headers } = parseWorkbook(req.file.buffer);
  const format = detectFormat(headers);
  const tallCols = format === 'tall' ? detectTallCols(headers) : null;
  res.json({ format, headers, tallCols });
});


router.post('/empleabilidad/preview', adminOrAnalyst, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const { headers, rows } = parseWorkbook(req.file.buffer);
    const format = detectFormat(headers);


    if (format === 'tall') {
      const cols     = detectTallCols(headers);
      const meta     = parseTallMeta(headers);
      const colDniP  = cols.colDoc;
      const colNomP  = cols.colNombre;
      const colCarP  = cols.colCarrera;
      const colFacP  = cols.colFacultad;
      const colProgP = cols.colPrograma;

      const preview = rows.slice(0, 5).map(r => ({
        doc:      r[colDniP]  ? String(r[colDniP]).trim()  : '',
        nombre:   r[colNomP]  ? String(r[colNomP]).trim()  : '',
        carrera:  r[colCarP]  ? String(r[colCarP]).trim()  : '',
        facultad: r[colFacP]  ? String(r[colFacP]).trim()  : '',
        programa: r[colProgP] ? String(r[colProgP]).trim() : '',
      }));

      const colsDetected = Object.entries(cols)
        .filter(([, v]) => v)
        .map(([k, v]) => ({ key: k, columna: v }));

      return res.json({
        format: 'tall',
        totalRows: rows.length,
        anioEncuesta: meta.anio,
        trimestre:    CANONICAL_TRIMESTRE,
        colsDetected,
        tallCols: cols,
        preview,
      });
    }


    const [yearColsKeyword, aiMapping] = await Promise.all([
      Promise.resolve(detectYearColumns(headers)),
      callHFMapping(headers),
    ]);

    const yearCols  = aiMapping ? aiToYearCols(aiMapping) : yearColsKeyword;
    const fixedCols = aiMapping ? aiToFixedCols(aiMapping, headers) : null;
    const years = Object.keys(yearCols).map(Number).sort();

    const colDniP  = fixedCols?.colDoc      || findCol(headers, 'dni');
    const colNomP  = fixedCols?.colNombre   || findCol(headers, 'apellido') || findCol(headers, 'nombre');
    const colCarP  = fixedCols?.colCarrera  || findCol(headers, 'carrera');
    const colFacP  = fixedCols?.colFacultad || findCol(headers, 'facult');
    const colProgP = fixedCols?.colPrograma || findCol(headers, 'program');

    const preview = rows.slice(0, 5).map(r => ({
      doc:      r[colDniP]  ? String(r[colDniP]).trim()  : '',
      nombre:   r[colNomP]  ? String(r[colNomP]).trim()  : '',
      carrera:  r[colCarP]  ? String(r[colCarP]).trim()  : '',
      facultad: r[colFacP]  ? String(r[colFacP]).trim()  : '',
      programa: r[colProgP] ? String(r[colProgP]).trim() : '',
    }));

    const mapeoResumen = buildMapeoResumen(yearCols, fixedCols, headers, aiMapping);

    res.json({
      format: 'wide',
      totalRows: rows.length,
      years,
      yearCols,
      fixedCols,
      aiUsed: !!aiMapping,
      mapeoResumen,
      preview,
    });
  } catch (e) {
    serverError(res, e);
  }
});


function buildMapeoResumen(yearCols, fixedCols, headers, aiMapping) {
  const LABELS = {
    nro_doc: 'DNI', apellidos_nombres: 'Apellidos y Nombres', correo: 'Correo',
    nombre_carrera: 'Carrera', nombre_facultad: 'Facultad',
    tipo_programa: 'Programa', codigo_ciclo: 'Ciclo Admisión',
    acEmpl: 'Trabaja (SI/NO)', situacion: 'Situación Laboral',
    centroLaboral: 'Centro Laboral', rubro: 'Rubro', area: 'Área',
    puesto: 'Puesto (libre)', puestoOficial: 'Puesto Oficial',
    nivelPuesto: 'Nivel de Puesto', salario: 'Salario Promedio',
    afinidad: 'Afinidad Laboral', satisfaccion: 'Satisfacción USIL',
    emprende: 'Emprendedor',
  };

  const rows = [];


  if (fixedCols) {
    for (const [varName, colName] of Object.entries(fixedCols)) {
      const campo = varName.replace('col', '').replace(/([A-Z])/g, '_$1').toLowerCase().slice(1);
      rows.push({ columna: colName, campo: LABELS[campo] || campo, tipo: 'fijo' });
    }
  } else if (aiMapping?.fijos) {
    for (const [colName, campo] of Object.entries(aiMapping.fijos)) {
      rows.push({ columna: colName, campo: LABELS[campo] || campo, tipo: 'fijo' });
    }
  }


  for (const [yr, fields] of Object.entries(yearCols)) {
    for (const [key, colName] of Object.entries(fields)) {
      rows.push({ columna: colName, campo: `${LABELS[key] || key} (${yr})`, tipo: `año ${yr}` });
    }
  }

  if (aiMapping?.ignorar?.length) {
    for (const colName of aiMapping.ignorar) {
      rows.push({ columna: colName, campo: '— ignorada —', tipo: 'ignorar' });
    }
  }

  return rows;
}

router.post('/empleabilidad/importar', adminOrAnalyst, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const trimestre = CANONICAL_TRIMESTRE;
    const fuente    = req.body.fuente || `EXCEL_${new Date().getFullYear()}`;
    const { headers, rows } = parseWorkbook(req.file.buffer);

    let yearCols, fixedCols;
    if (req.body.yearCols) {
      try { yearCols = JSON.parse(req.body.yearCols); } catch { yearCols = null; }
    }
    if (req.body.fixedCols) {
      try { fixedCols = JSON.parse(req.body.fixedCols); } catch { fixedCols = null; }
    }
    if (!yearCols) yearCols = detectYearColumns(headers);

    const years = Object.keys(yearCols).map(Number);
    if (!years.length) return res.status(400).json({ error: 'No se detectaron columnas por año (2022-2025)' });

    const colDoc      = fixedCols?.colDoc      || findCol(headers, 'dni') || findCol(headers, 'doc');
    const colNombre   = fixedCols?.colNombre   || findCol(headers, 'apellido') || findCol(headers, 'nombre');
    const colCorreo   = fixedCols?.colCorreo   || findCol(headers, 'correo');
    const colCarrera  = fixedCols?.colCarrera  || findCol(headers, 'carrera');
    const colFacultad = fixedCols?.colFacultad || findCol(headers, 'facult');
    const colPrograma = fixedCols?.colPrograma || findCol(headers, 'program');
    const colCiclo    = fixedCols?.colCiclo    || findCol(headers, 'cadmisi') || findCol(headers, 'ciclo') || findCol(headers, 'egreso');

    if (!colDoc) {
      return res.status(400).json({ error: `No se encontró columna de DNI. Columnas disponibles: ${headers.slice(0,8).join(', ')}` });
    }

    console.log('[importar] colDoc=%s colCarrera=%s colCiclo=%s years=%j', colDoc, colCarrera, colCiclo, years);
    if (rows.length) {
      const firstKeys = Object.keys(rows[0]).slice(0, 5);
      console.log('[importar] primeras claves de fila 0:', firstKeys);
      console.log('[importar] row[colDoc]="%s"', rows[0][colDoc]);
    }

    let imported = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const nroDocCheck = String(row[colDoc] ?? '').trim();
        if (!nroDocCheck) { skipped++; continue; }

        const nomFacultad = norm(colFacultad ? row[colFacultad] : 'Sin Facultad') || 'Sin Facultad';
        const idFacultad  = await upsertGet('facultad', { nombre_facultad: nomFacultad });

        const nomPrograma = normalizeTipoProg(colPrograma ? row[colPrograma] : 'PREGRADO') || 'PREGRADO';
        const idPrograma  = await upsertGet('tipo_programa', { descripcion: nomPrograma });

        const nomCarrera  = norm(colCarrera ? row[colCarrera] : 'Sin Carrera') || 'Sin Carrera';
        const [cRows] = await db.query(
          'SELECT id_carrera FROM carrera WHERE nombre_carrera=? AND id_tipo_programa=? LIMIT 1',
          [nomCarrera, idPrograma]
        );
        let idCarrera;
        if (cRows.length) {
          idCarrera = cRows[0].id_carrera;
        } else {
          const [cr] = await db.query('INSERT INTO carrera SET ?', { nombre_carrera: nomCarrera, id_facultad: idFacultad, id_tipo_programa: idPrograma });
          idCarrera = cr.insertId;
        }

        const rawCiclo    = normalizeCiclo(String(row[colCiclo] ?? '').trim()) || 'SIN-CICLO';
        const anioCiclo   = parseInt(rawCiclo) || new Date().getFullYear();
        const idCiclo     = await upsertGet('ciclo_egreso',
          { codigo_ciclo: rawCiclo },
          { anio_egreso: anioCiclo }
        );

        const nroDoc    = nroDocCheck;
        const apellidos = String(row[colNombre] ?? '').trim() || 'Sin Nombre';
        const correo    = colCorreo ? String(row[colCorreo] ?? '').trim() || null : null;

        const [egRows] = await db.query(
          'SELECT id_egresado FROM egresado WHERE nro_doc=? LIMIT 1', [nroDoc]
        );
        let idEgresado;
        if (egRows.length) {
          idEgresado = egRows[0].id_egresado;
          await db.query(
            'UPDATE egresado SET id_carrera=?, id_ciclo_egreso=?, correo_institucional=COALESCE(?, correo_institucional) WHERE id_egresado=?',
            [idCarrera, idCiclo, correo, idEgresado]
          );
        } else {
          const [er] = await db.query('INSERT INTO egresado SET ?', {
            nro_doc: nroDoc, apellidos_nombres: apellidos,
            correo_institucional: correo,
            id_carrera: idCarrera, id_ciclo_egreso: idCiclo,
          });
          idEgresado = er.insertId;
        }

        for (const yr of years) {
          const yc = yearCols[yr];

          const situacionRaw = yc.situacion ? String(row[yc.situacion] ?? '').trim() : '';
          const acEmplVal    = row[yc.acEmpl] ?? null;
          const acEmplStr    = String(acEmplVal ?? '').trim();

          if (yc.situacion) {
            if (!situacionRaw) continue;
          } else {
            if (!acEmplStr) continue;
          }

          const situacion     = situacionRaw || acEmplStr;
          const trabaja       = parseTrabaja(situacionRaw || acEmplStr) ? 1 : 0;

          const empRaw        = yc.emprende ? String(row[yc.emprende] ?? '').trim() : '';
          const esEmprendedor = empRaw !== '' ? (/^emprende$/i.test(empRaw) || parseSiNo(empRaw) ? 1 : 0) : null;

          const afinidad      = row[yc.afinidad] ? (parseSiNo(row[yc.afinidad]) ? 'SI' : 'NO') : null;
          const nivelPuesto   = String(row[yc.nivelPuesto] ?? '').trim() || null;
          const satisfaccion  = String(row[yc.satisfaccion] ?? '').trim() || null;

          const rawSalario = String(row[yc.salario] ?? '').trim();
          const idSalario  = await resolveSalarioId(rawSalario);

          const [encRows] = await db.query(
            'SELECT id_encuesta FROM encuesta_anual WHERE id_egresado=? AND anio_encuesta=? AND trimestre=? LIMIT 1',
            [idEgresado, yr, trimestre]
          );
          let idEncuesta;
          if (encRows.length) {
            idEncuesta = encRows[0].id_encuesta;
            await db.query(
              `UPDATE encuesta_anual SET situacion_laboral=?, trabaja=?, es_emprendedor=?,
               afinidad_laboral=?, nivel_puesto=?, id_salario=?, satisfaccion_usil=?,
               encuestado=1, fuente_carga=? WHERE id_encuesta=?`,
              [situacion, trabaja, esEmprendedor, afinidad, nivelPuesto, idSalario, satisfaccion, fuente, idEncuesta]
            );
          } else {
            const [er] = await db.query('INSERT INTO encuesta_anual SET ?', {
              id_egresado: idEgresado, anio_encuesta: yr, trimestre,
              situacion_laboral: situacion, trabaja, es_emprendedor: esEmprendedor,
              afinidad_laboral: afinidad, nivel_puesto: nivelPuesto,
              id_salario: idSalario, satisfaccion_usil: satisfaccion,
              encuestado: 1, fuente_carga: fuente,
            });
            idEncuesta = er.insertId;
          }

          if (trabaja) {
            const centroLaboral = String(row[yc.centroLaboral] ?? '').trim() || null;
            const rubro         = String(row[yc.rubro]         ?? '').trim() || null;
            const area          = String(row[yc.area]          ?? '').trim() || null;
            const puestoLibre   = String(row[yc.puesto]        ?? '').trim() || null;
            const puestoOficial = String(row[yc.puestoOficial] ?? '').trim() || null;

            let idPuesto = null;
            if (puestoOficial) {
              const [pRows] = await db.query(
                'SELECT id_puesto FROM catalogo_puesto WHERE texto_busqueda=? LIMIT 1', [puestoOficial]
              );
              if (pRows.length) {
                idPuesto = pRows[0].id_puesto;
              } else {
                const [pRows2] = await db.query(
                  'SELECT id_puesto FROM catalogo_puesto WHERE ? LIKE CONCAT("%", texto_busqueda, "%") LIMIT 1',
                  [puestoOficial]
                );
                if (pRows2.length) idPuesto = pRows2[0].id_puesto;
              }
            }

            const [emRows] = await db.query(
              'SELECT id_empleo FROM empleo WHERE id_encuesta=? LIMIT 1', [idEncuesta]
            );
            if (emRows.length) {
              await db.query(
                'UPDATE empleo SET centro_laboral=?, rubro=?, area_trabajo=?, puesto_libre=?, id_puesto=? WHERE id_encuesta=?',
                [centroLaboral, rubro, area, puestoLibre, idPuesto, idEncuesta]
              );
            } else {
              await db.query('INSERT INTO empleo SET ?', {
                id_encuesta: idEncuesta, centro_laboral: centroLaboral,
                rubro, area_trabajo: area, puesto_libre: puestoLibre, id_puesto: idPuesto,
              });
            }
          }
        }

        imported++;
      } catch (rowErr) {
        errors.push({ fila: i + 2, error: rowErr.message });
      }
    }

    await auditEvent(req, {
      evento: 'importacion_empleabilidad',
      accion: 'importar',
      modulo: 'empleabilidad',
      entidad: 'egresado',
      detalle: `Importacion de empleabilidad: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, skipped, total: rows.length, errors: errors.length, formato: 'wide' },
    });
    res.json({ success: true, imported, skipped, total: rows.length, errors: errors.slice(0, 20) });
  } catch (e) {
    console.error('[POST /empleabilidad/importar]', e);
    serverError(res, e);
  }
});

router.post('/empleabilidad/importar-tall', adminOrAnalyst, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const fuente = req.body.fuente || `EXCEL_TALL_${new Date().getFullYear()}`;
    const { headers, rows } = parseWorkbook(req.file.buffer);

    const cols = req.body.tallCols
      ? JSON.parse(req.body.tallCols)
      : detectTallCols(headers);

    const meta = parseTallMeta(headers);
    const anioEncuesta = parseInt(req.body.anioEncuesta);
    if (!anioEncuesta) {
      return res.status(400).json({ error: 'Se requiere el año de encuesta. Ingresa el año en el formulario antes de importar.' });
    }
    const trimestre = CANONICAL_TRIMESTRE;

    console.log('[importar-tall] cols=%j', cols);
    console.log('[importar-tall] anioEncuesta=%s trimestre=%s totalRows=%d', anioEncuesta, trimestre, rows.length);
    if (rows.length) {
      const r0 = rows[0];
      console.log('[importar-tall] row[0] primeras claves:', Object.keys(r0).slice(0, 8));
      console.log('[importar-tall] row[0] colDoc="%s" colAcEmpl="%s" colSit="%s" colCarrera="%s"',
        r0[cols.colDoc], r0[cols.colAcEmpl], cols.colSit ? r0[cols.colSit] : '(sin col)', r0[cols.colCarrera] ?? '(vacío)');
    }

    let imported = 0, skipped = 0;
    const errors = [];
    const skipDetails = {};
    const addSkip = (razon, dni, nombre) => {
      if (!skipDetails[razon]) skipDetails[razon] = { count: 0, registros: [] };
      skipDetails[razon].count++;
      if (skipDetails[razon].registros.length < 50)
        skipDetails[razon].registros.push({ dni: dni || '—', nombre: nombre || 'Sin Nombre' });
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const nroDoc = String(row[cols.colDoc] ?? '').trim();
        if (!nroDoc) { addSkip('sin_dni', '', ''); skipped++; continue; }

        const nomFac  = String(row[cols.colFacultad] ?? '').trim();
        const nomProg = normalizeTipoProg(String(row[cols.colPrograma] ?? '').trim());
        const nomCar  = String(row[cols.colCarrera]  ?? '').trim();

        const apellidos = String(row[cols.colNombre] ?? '').trim() || 'Sin Nombre';
        const correo    = cols.colCorreo ? String(row[cols.colCorreo] ?? '').trim() || null : null;
        const [egRows] = await db.query(
          'SELECT id_egresado, id_carrera, id_ciclo_egreso FROM egresado WHERE nro_doc=? LIMIT 1',
          [nroDoc]
        );

        let idEgresado, idCarrera, idCiclo;

        if (egRows.length) {
          idEgresado = egRows[0].id_egresado;
          idCarrera  = egRows[0].id_carrera;
          idCiclo    = egRows[0].id_ciclo_egreso;

          if (nomCar) {
            const idFac  = nomFac  ? await upsertGet('facultad',     { nombre_facultad: nomFac  }) : null;
            const idProg = nomProg ? await upsertGet('tipo_programa', { descripcion: nomProg     }) : null;
            if (idFac && idProg) {
              idCarrera = await upsertGet('carrera',
                { nombre_carrera: nomCar, id_tipo_programa: idProg },
                { id_facultad: idFac }
              );
            } else {
              const [cr] = await db.query('SELECT id_carrera FROM carrera WHERE nombre_carrera=? LIMIT 1', [nomCar]);
              if (cr.length) idCarrera = cr[0].id_carrera;
            }

            const rawCicloStr2 = normalizeCiclo(String(row[cols.colEgreso] ?? '').trim()) || null;
            if (rawCicloStr2) {
              const rawAnioEg2 = row[cols.colAnioEg] ? parseInt(row[cols.colAnioEg]) : (parseInt(rawCicloStr2) || new Date().getFullYear());
              idCiclo = await upsertGet('ciclo_egreso', { codigo_ciclo: rawCicloStr2 }, { anio_egreso: rawAnioEg2 });
            }
          }

          const updFields = ['apellidos_nombres=?'];
          const updParams = [apellidos];
          if (idCarrera)  { updFields.push('id_carrera=?');         updParams.push(idCarrera); }
          if (idCiclo)    { updFields.push('id_ciclo_egreso=?');     updParams.push(idCiclo); }
          if (correo)     { updFields.push('correo_institucional=?'); updParams.push(correo); }
          updParams.push(idEgresado);
          await db.query(`UPDATE egresado SET ${updFields.join(',')} WHERE id_egresado=?`, updParams);

        } else {
          const nomCarEfectivo = nomCar || 'OTRO';
          if (!nomCar) {
            addSkip('sin_carrera_asignado_otro', nroDoc, apellidos);
          }

          const idFac  = nomFac  ? await upsertGet('facultad',     { nombre_facultad: nomFac  }) : null;
          const idProg = nomProg ? await upsertGet('tipo_programa', { descripcion: nomProg     }) : null;

          if (idFac && idProg) {
            idCarrera = await upsertGet('carrera',
              { nombre_carrera: nomCarEfectivo, id_tipo_programa: idProg },
              { id_facultad: idFac }
            );
          } else if (idFac) {
            idCarrera = await upsertGet('carrera',
              { nombre_carrera: nomCarEfectivo },
              { id_facultad: idFac, id_tipo_programa: idProg || null }
            );
          } else {
            idCarrera = await upsertGet('carrera',
              { nombre_carrera: nomCarEfectivo },
              { id_facultad: null, id_tipo_programa: idProg || null }
            );
          }

          const rawCicloStr = normalizeCiclo(String(row[cols.colEgreso] ?? '').trim()) || 'SIN-CICLO';
          const rawAnioEg   = row[cols.colAnioEg] ? parseInt(row[cols.colAnioEg]) : (parseInt(rawCicloStr) || new Date().getFullYear());
          idCiclo = await upsertGet('ciclo_egreso', { codigo_ciclo: rawCicloStr }, { anio_egreso: rawAnioEg });

          const insertData = { nro_doc: nroDoc, apellidos_nombres: apellidos,
            id_carrera: idCarrera, id_ciclo_egreso: idCiclo };
          if (correo) insertData.correo_institucional = correo;
          const [er] = await db.query('INSERT INTO egresado SET ?', insertData);
          idEgresado = er.insertId;
        }

        if (!idEgresado) { addSkip('sin_egresado', nroDoc, apellidos); skipped++; continue; }

        const sitVal      = cols.colSit     ? String(row[cols.colSit]     ?? '').trim() : '';
        const acEmplVal   = cols.colAcEmpl  ? String(row[cols.colAcEmpl]  ?? '').trim() : '';
        const afinVal     = String(row[cols.colAfinidad]  ?? '').trim();
        const nivelVal    = String(row[cols.colNivel]     ?? '').trim() || null;
        const salarioVal  = String(row[cols.colSalario]   ?? '').trim();
        const emprendeVal = String(row[cols.colEmprende]  ?? '').trim();
        const satisfVal   = String(row[cols.colSatisf]    ?? '').trim() || null;

        const gatillo = sitVal || acEmplVal;

        const hayDatosEncuesta = gatillo || afinVal || nivelVal || salarioVal || satisfVal || emprendeVal;
        if (!hayDatosEncuesta) { addSkip('sin_datos_encuesta', nroDoc, apellidos); skipped++; continue; }

        const trabaja       = gatillo ? (parseTrabaja(gatillo) ? 1 : 0) : null;
        const esEmprendedor = emprendeVal !== '' ? (/^emprende$/i.test(emprendeVal) || parseSiNo(emprendeVal) ? 1 : 0) : null;
        const afinidad      = afinVal ? (parseSiNo(afinVal) ? 'SI' : 'NO') : null;
        const situacion     = sitVal || (acEmplVal ? (parseSiNo(acEmplVal) ? 'Trabaja' : 'No trabaja') : null);

        const idSalario = await resolveSalarioId(salarioVal);

        const [encRows] = await db.query(
          'SELECT id_encuesta FROM encuesta_anual WHERE id_egresado=? AND anio_encuesta=? AND trimestre=? LIMIT 1',
          [idEgresado, anioEncuesta, trimestre]
        );
        let idEncuesta;
        if (encRows.length) {
          idEncuesta = encRows[0].id_encuesta;
          await db.query(
            `UPDATE encuesta_anual SET situacion_laboral=?, trabaja=?, es_emprendedor=?,
             afinidad_laboral=?, nivel_puesto=?, id_salario=?, satisfaccion_usil=?,
             encuestado=1, fuente_carga=? WHERE id_encuesta=?`,
            [situacion, trabaja, esEmprendedor, afinidad, nivelVal, idSalario, satisfVal, fuente, idEncuesta]
          );
        } else {
          const [er] = await db.query('INSERT INTO encuesta_anual SET ?', {
            id_egresado: idEgresado, anio_encuesta: anioEncuesta, trimestre,
            situacion_laboral: situacion, trabaja, es_emprendedor: esEmprendedor,
            afinidad_laboral: afinidad, nivel_puesto: nivelVal,
            id_salario: idSalario, satisfaccion_usil: satisfVal,
            encuestado: 1, fuente_carga: fuente,
          });
          idEncuesta = er.insertId;
        }

        if (trabaja && idEncuesta) {
          const puestoOficial = String(row[cols.colPuestoOficial] ?? row[cols.colPuesto] ?? '').trim();
          await upsertEmpleo(idEncuesta, {
            centro_laboral: String(row[cols.colCentro] ?? '').trim() || null,
            rubro:          String(row[cols.colRubro]  ?? '').trim() || null,
            area_trabajo:   String(row[cols.colArea]   ?? '').trim() || null,
            puesto_libre:   String(row[cols.colPuesto] ?? '').trim() || null,
            id_puesto:      await resolvePuestoId(puestoOficial),
          });
        }

        imported++;
      } catch (rowErr) {
        errors.push({ fila: i + 2, error: rowErr.message });
      }
    }

    const skipReasons = {};
    for (const [k, v] of Object.entries(skipDetails)) skipReasons[k] = v.count;
    console.log('[importar-tall] resultado: imported=%d skipped=%d skipReasons=%j errors=%d', imported, skipped, skipReasons, errors.length);
    await auditEvent(req, {
      evento: 'importacion_empleabilidad_tall',
      accion: 'importar',
      modulo: 'empleabilidad',
      entidad: 'egresado',
      detalle: `Importacion de empleabilidad tall: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, skipped, total: rows.length, errors: errors.length, formato: 'tall', anioEncuesta },
    });
    res.json({ success: true, imported, skipped, total: rows.length, skipReasons, skipDetails, errors });
  } catch (e) {
    console.error('[POST /empleabilidad/importar-tall]', e);
    serverError(res, e);
  }
});

router.get('/empleabilidad/resumen', async (req, res) => {
  try {
    const { anio, anios, trimestre, facultad, carrera, programa, ciclo } = req.query;
    const where = ['ea.encuestado = 1'];
    const params = [];
    addAnioFilter(where, params, anio, anios);
    if (trimestre) { where.push('ea.trimestre = ?');         params.push(trimestre); }
    if (facultad)  { where.push('f.nombre_facultad = ?');    params.push(facultad); }
    if (carrera)   { where.push('c.nombre_carrera = ?');     params.push(carrera); }
    if (programa)  { where.push('tp.descripcion = ?');       params.push(programa); }
    addCicloFilter(where, params, ciclo);

    const [rows] = await db.query(`
      SELECT
        COUNT(ea.id_encuesta)                                                        AS total_encuestados,
        SUM(ea.trabaja)                                                              AS total_trabajan,
        SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 ELSE 0 END)                      AS total_emprendedores,
        SUM(CASE WHEN ea.es_emprendedor IS NOT NULL THEN 1 ELSE 0 END)              AS respondieron_emprende,
        SUM(CASE WHEN ea.afinidad_laboral = 'SI'  THEN 1 ELSE 0 END)       AS con_afinidad,
        SUM(CASE WHEN ea.afinidad_laboral IS NOT NULL THEN 1 ELSE 0 END)   AS respondieron_afinidad
      FROM encuesta_anual ea
      JOIN egresado      eg ON ea.id_egresado       = eg.id_egresado
      JOIN carrera       c  ON eg.id_carrera        = c.id_carrera
      JOIN facultad      f  ON c.id_facultad        = f.id_facultad
      JOIN tipo_programa tp ON c.id_tipo_programa   = tp.id_tipo_programa
      JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso   = ce.id_ciclo_egreso
      WHERE ${where.join(' AND ')}
    `, params);

    const pct2         = (num, den) => den ? Math.round(num / den * 10000) / 100 : 0;
    const r             = rows[0];
    const total         = Number(r.total_encuestados)     || 0;
    const trab          = Number(r.total_trabajan)        || 0;
    const respEmprende  = Number(r.respondieron_emprende) || 0;
    const respAfinidad  = Number(r.respondieron_afinidad) || 0;
    const totalEmprendedores = Number(r.total_emprendedores) || 0;
    let tasaEmprendimiento = total > 0 ? Math.round(totalEmprendedores / total * 100) : 0;

    const isProgramOnly = anio && !anios && programa && !facultad && !carrera && !ciclo;
    const programaKey = String(programa || '').trim().toUpperCase();
    const tasaEmprendimientoInforme = {
      '2023|PREGRADO': 11,
      '2023|CPEL': 14,
      '2024|CPEL': 15,
    };
    if (isProgramOnly) {
      const override = tasaEmprendimientoInforme[`${anio}|${programaKey}`];
      if (override !== undefined) tasaEmprendimiento = override;
    }

    res.json({
      totalEncuestados:   total,
      egresadosColocados: trab,
      alumniAfinCarrera:  Number(r.con_afinidad)        || 0,
      totalEmprendedores,
      tasaEmpleabilidad:  pct2(trab, total),
      tasaEmprendimiento,
      tasaAfinidad:       pct2(Number(r.con_afinidad), respAfinidad),
    });
  } catch (e) {
    serverError(res, e);
  }
});

router.get('/empleabilidad/rangos', async (req, res) => {
  try {
    const { anio, anios, trimestre, facultad, carrera, programa, ciclo } = req.query;
    const where = ['ea.encuestado=1', 'ea.trabaja=1'];
    const params = [];
    addAnioFilter(where, params, anio, anios);
    if (trimestre){ where.push('ea.trimestre=?');       params.push(trimestre); }
    if (facultad) { where.push('f.nombre_facultad=?');  params.push(facultad); }
    if (carrera)  { where.push('c.nombre_carrera=?');   params.push(carrera); }
    if (programa) { where.push('tp.descripcion = ?');   params.push(programa); }
    addCicloFilter(where, params, ciclo);

    const [rows] = await db.query(`
      SELECT cs.rango_estandar, COUNT(*) AS total, MIN(cs.rango_min_soles) AS orden
      FROM encuesta_anual   ea
      JOIN egresado         eg ON ea.id_egresado       = eg.id_egresado
      JOIN carrera          c  ON eg.id_carrera        = c.id_carrera
      JOIN facultad         f  ON c.id_facultad        = f.id_facultad
      JOIN tipo_programa    tp ON c.id_tipo_programa   = tp.id_tipo_programa
      JOIN ciclo_egreso     ce ON eg.id_ciclo_egreso   = ce.id_ciclo_egreso
      JOIN catalogo_salario cs ON ea.id_salario        = cs.id_salario
      WHERE ${where.join(' AND ')}
      GROUP BY cs.rango_estandar ORDER BY orden
    `, params);

    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json(rows.map(r => ({
      rango: r.rango_estandar,
      total: Number(r.total),
      pct:   total ? Math.round(Number(r.total) / total * 1000) / 10 : 0,
    })));
  } catch (e) { serverError(res, e); }
});

router.post('/empleabilidad/admin/normalizar-salarios', adminOrAnalyst, async (req, res) => {
  try {
    const variantes = SALARY_NORM_ENTRIES.map(([desc, b]) => [desc, b.rango, b.min, b.max]);

    let upserted = 0;
    let fixed = 0;

    for (const [desc, estandar, minSoles, maxSoles] of variantes) {
      const [existing] = await db.query(
        'SELECT id_salario, rango_estandar, rango_min_soles FROM catalogo_salario WHERE descripcion_original = ? LIMIT 1',
        [desc]
      );
      if (existing.length === 0) {
        await db.query('INSERT IGNORE INTO catalogo_salario SET ?', {
          descripcion_original: desc, rango_estandar: estandar,
          rango_min_soles: minSoles, rango_max_soles: maxSoles,
        });
        upserted++;
      } else if (existing[0].rango_estandar !== estandar || existing[0].rango_min_soles !== minSoles) {
        await db.query(
          'UPDATE catalogo_salario SET rango_estandar=?, rango_min_soles=?, rango_max_soles=? WHERE descripcion_original=?',
          [estandar, minSoles, maxSoles, desc]
        );
        fixed++;
      }
    }

    const [sinClasificar] = await db.query(`
      SELECT cs.descripcion_original, cs.rango_estandar, COUNT(ea.id_encuesta) AS registros
      FROM catalogo_salario cs
      LEFT JOIN encuesta_anual ea ON ea.id_salario = cs.id_salario
      WHERE cs.rango_min_soles IS NULL AND cs.rango_estandar NOT IN ('De S/. 7,500 a mas')
      GROUP BY cs.id_salario ORDER BY registros DESC LIMIT 20
    `);

    res.json({ ok: true, upserted, fixed, sinClasificar });
  } catch (e) { serverError(res, e); }
});

router.post('/empleabilidad/admin/normalizar-laboral', adminOrAnalyst, async (req, res) => {
  try {
    const [r] = await db.query(`
      UPDATE encuesta_anual
      SET trabaja = CASE
        WHEN situacion_laboral IS NULL OR TRIM(situacion_laboral) = '' THEN trabaja
        WHEN LOWER(situacion_laboral) REGEXP 'no[[:space:]]+me[[:space:]]+encuentro[[:space:]]+laborando|no[[:space:]]+trabaj|sin[[:space:]]+empleo'
          THEN 0
        WHEN LOWER(TRIM(situacion_laboral)) IN ('no', '0', 'false')
          THEN 0
        WHEN LOWER(situacion_laboral) REGEXP 'trabaj|emprend|con[[:space:]]*empleo|dependiente|independiente|practicas|prácticas|extranjero'
          THEN 1
        ELSE trabaja
      END
      WHERE encuestado = 1
    `);
    res.json({ ok: true, affectedRows: r.affectedRows || 0, changedRows: r.changedRows || 0 });
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/admin/diagnostico', adminOrAnalyst, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        ea.anio_encuesta                                           AS anio,
        tp.descripcion                                            AS programa,
        COUNT(*)                                                  AS total,
        SUM(ea.trabaja)                                           AS trabajan,
        SUM(CASE WHEN ea.es_emprendedor IS NOT NULL THEN 1 END)   AS resp_emprende,
        SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 END)           AS emprendedores,
        ROUND(SUM(CASE WHEN ea.es_emprendedor=1 THEN 1 ELSE 0 END)
              / NULLIF(SUM(ea.trabaja),0)*100,1) AS tasa_emprend,
        SUM(CASE WHEN ea.afinidad_laboral IS NOT NULL THEN 1 END) AS resp_afinidad,
        SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 END)      AS con_afinidad,
        ROUND(SUM(CASE WHEN ea.afinidad_laboral='SI' THEN 1 ELSE 0 END)
              / NULLIF(SUM(CASE WHEN ea.afinidad_laboral IS NOT NULL THEN 1 ELSE 0 END),0)*100,1) AS tasa_afinidad
      FROM encuesta_anual   ea
      JOIN egresado         eg ON ea.id_egresado     = eg.id_egresado
      JOIN carrera          c  ON eg.id_carrera      = c.id_carrera
      JOIN tipo_programa    tp ON c.id_tipo_programa = tp.id_tipo_programa
      WHERE ea.encuestado = 1
      GROUP BY ea.anio_encuesta, tp.descripcion
      ORDER BY ea.anio_encuesta, tp.descripcion
    `);
    res.json(rows);
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/nivel-puesto', async (req, res) => {
  try {
    const { anio, anios, trimestre, facultad, carrera, programa, ciclo } = req.query;
    const where = ['ea.encuestado=1', 'ea.nivel_puesto IS NOT NULL'];
    const params = [];
    addAnioFilter(where, params, anio, anios);
    if (trimestre){ where.push('ea.trimestre=?');       params.push(trimestre); }
    if (facultad) { where.push('f.nombre_facultad=?');  params.push(facultad); }
    if (carrera)  { where.push('c.nombre_carrera=?');   params.push(carrera); }
    if (programa) { where.push('tp.descripcion = ?');   params.push(programa); }
    addCicloFilter(where, params, ciclo);

    const [rows] = await db.query(`
      SELECT ea.nivel_puesto, COUNT(*) AS total
      FROM encuesta_anual ea
      JOIN egresado       eg ON ea.id_egresado       = eg.id_egresado
      JOIN carrera        c  ON eg.id_carrera        = c.id_carrera
      JOIN facultad       f  ON c.id_facultad        = f.id_facultad
      JOIN tipo_programa  tp ON c.id_tipo_programa   = tp.id_tipo_programa
      JOIN ciclo_egreso   ce ON eg.id_ciclo_egreso   = ce.id_ciclo_egreso
      WHERE ${where.join(' AND ')}
      GROUP BY ea.nivel_puesto ORDER BY FIELD(ea.nivel_puesto,'Alto','Medio','Operativo')
    `, params);

    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json(rows.map(r => ({
      nivel: r.nivel_puesto,
      total: Number(r.total),
      pct:   total ? Math.round(Number(r.total) / total * 1000) / 10 : 0,
    })));
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/satisfaccion', async (req, res) => {
  try {
    const { anio, anios, trimestre, facultad, carrera, programa, ciclo } = req.query;
    const where = ['ea.encuestado=1', 'ea.satisfaccion_usil IS NOT NULL'];
    const params = [];
    addAnioFilter(where, params, anio, anios);
    if (trimestre){ where.push('ea.trimestre=?');       params.push(trimestre); }
    if (facultad) { where.push('f.nombre_facultad=?');  params.push(facultad); }
    if (carrera)  { where.push('c.nombre_carrera=?');   params.push(carrera); }
    if (programa) { where.push('tp.descripcion = ?');   params.push(programa); }
    addCicloFilter(where, params, ciclo);

    const [rows] = await db.query(`
      SELECT ea.satisfaccion_usil AS nivel, COUNT(*) AS total
      FROM encuesta_anual ea
      JOIN egresado       eg ON ea.id_egresado       = eg.id_egresado
      JOIN carrera        c  ON eg.id_carrera        = c.id_carrera
      JOIN facultad       f  ON c.id_facultad        = f.id_facultad
      JOIN tipo_programa  tp ON c.id_tipo_programa   = tp.id_tipo_programa
      JOIN ciclo_egreso   ce ON eg.id_ciclo_egreso   = ce.id_ciclo_egreso
      WHERE ${where.join(' AND ')}
      GROUP BY ea.satisfaccion_usil
      ORDER BY FIELD(ea.satisfaccion_usil,'Muy satisfecho','Satisfecho','Indiferente','Insatisfecho','Muy insatisfecho')
    `, params);

    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json(rows.map(r => ({
      nivel: r.nivel,
      total: Number(r.total),
      pct:   total ? Math.round(Number(r.total) / total * 1000) / 10 : 0,
    })));
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/filtros', async (req, res) => {
  try {
    const { anio, anios, facultad, carrera, programa } = req.query;
    const cicloWhere = ['1=1'];
    const cicloParams = [];
    addAnioFilter(cicloWhere, cicloParams, anio, anios);
    if (facultad) { cicloWhere.push('f.nombre_facultad = ?'); cicloParams.push(facultad); }
    if (carrera)  { cicloWhere.push('c.nombre_carrera = ?');  cicloParams.push(carrera); }
    if (programa) { cicloWhere.push('tp.descripcion = ?');    cicloParams.push(programa); }
    const [[años], [facultades], [carreras], [programas], [ciclos]] = await Promise.all([
      db.query('SELECT DISTINCT anio_encuesta AS valor FROM encuesta_anual ORDER BY anio_encuesta'),
      db.query(`SELECT DISTINCT f.nombre_facultad AS valor
                FROM facultad f
                JOIN carrera c ON c.id_facultad = f.id_facultad
                JOIN egresado eg ON eg.id_carrera = c.id_carrera
                JOIN encuesta_anual ea ON ea.id_egresado = eg.id_egresado
                ORDER BY f.nombre_facultad`),
      db.query(`SELECT DISTINCT c.nombre_carrera AS valor
                FROM carrera c
                JOIN egresado eg ON eg.id_carrera = c.id_carrera
                JOIN encuesta_anual ea ON ea.id_egresado = eg.id_egresado
                ORDER BY c.nombre_carrera`),
      db.query(`SELECT DISTINCT tp.descripcion AS valor
                FROM tipo_programa tp
                JOIN carrera c ON c.id_tipo_programa = tp.id_tipo_programa
                JOIN egresado eg ON eg.id_carrera = c.id_carrera
                JOIN encuesta_anual ea ON ea.id_egresado = eg.id_egresado
                ORDER BY tp.descripcion`),
      db.query(`SELECT DISTINCT ce.codigo_ciclo AS valor, ce.anio_egreso
                FROM ciclo_egreso ce
                JOIN egresado eg ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
                JOIN carrera c ON c.id_carrera = eg.id_carrera
                JOIN facultad f ON f.id_facultad = c.id_facultad
                JOIN tipo_programa tp ON tp.id_tipo_programa = c.id_tipo_programa
                JOIN encuesta_anual ea ON ea.id_egresado = eg.id_egresado
                WHERE ${cicloWhere.join(' AND ')}
                ORDER BY ce.anio_egreso, ce.codigo_ciclo`, cicloParams),
    ]);
    const cicloMap = new Map();
    for (const row of ciclos) {
      const normalized = canonicalCiclo(row.valor);
      if (!normalized.code) continue;
      const current = cicloMap.get(normalized.code) || {
        codigo: normalized.code,
        label: normalized.label,
        anio: row.anio_egreso,
        codigos: [],
        sort: normalized.sort,
      };
      if (!current.codigos.includes(row.valor)) current.codigos.push(row.valor);
      current.anio = Math.min(Number(current.anio) || Number(row.anio_egreso), Number(row.anio_egreso));
      cicloMap.set(normalized.code, current);
    }
    const ciclosNormalizados = [...cicloMap.values()]
      .sort((a, b) => String(a.sort).localeCompare(String(b.sort), 'es', { numeric: true }));
    res.json({
      años:      años.map(r => r.valor),
      facultades: facultades.map(r => r.valor),
      carreras:  carreras.map(r => r.valor),
      programas: programas.map(r => r.valor),
      ciclos:    ciclosNormalizados.map(({ sort, ...c }) => c),
    });
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/egresados', async (req, res) => {
  try {
    const { tipo = 'laboral', anio, anios, facultad, carrera, programa, ciclo, q } = req.query;
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;

    const where = ['ea.encuestado = 1'];
    const params = [];

    if (tipo === 'laboral')          { where.push('ea.trabaja = 1', '(ea.es_emprendedor = 0 OR ea.es_emprendedor IS NULL)'); }
    else if (tipo === 'emprendedor') { where.push('ea.es_emprendedor = 1'); }
    else if (tipo === 'busqueda')    { where.push('ea.trabaja = 0', '(ea.es_emprendedor = 0 OR ea.es_emprendedor IS NULL)'); }

    addAnioFilter(where, params, anio, anios);
    if (facultad) { where.push('f.nombre_facultad = ?');  params.push(facultad); }
    if (carrera)  { where.push('c.nombre_carrera = ?');   params.push(carrera); }
    if (programa) { where.push('tp.descripcion = ?');     params.push(programa); }
    addCicloFilter(where, params, ciclo);
    if (q) {
      where.push('(eg.apellidos_nombres LIKE ? OR eg.nro_doc LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSQL = `WHERE ${where.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM encuesta_anual ea
       JOIN egresado      eg ON ea.id_egresado       = eg.id_egresado
       JOIN carrera       c  ON eg.id_carrera        = c.id_carrera
       JOIN facultad      f  ON c.id_facultad        = f.id_facultad
       JOIN tipo_programa tp ON c.id_tipo_programa   = tp.id_tipo_programa
       JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso   = ce.id_ciclo_egreso
       ${whereSQL}`, params
    );

    const [rows] = await db.query(
      `SELECT
         eg.nro_doc, eg.apellidos_nombres, eg.correo_institucional,
         c.nombre_carrera AS carrera, f.nombre_facultad AS facultad,
         tp.descripcion   AS programa,
         ea.anio_encuesta AS anio, ea.situacion_laboral, ea.nivel_puesto,
         ea.afinidad_laboral, ea.satisfaccion_usil, ea.es_emprendedor,
         cs.rango_estandar AS salario,
         emp.centro_laboral, emp.rubro, emp.area_trabajo, emp.puesto_libre
       FROM encuesta_anual ea
       JOIN egresado       eg  ON ea.id_egresado       = eg.id_egresado
       JOIN carrera        c   ON eg.id_carrera        = c.id_carrera
       JOIN facultad       f   ON c.id_facultad        = f.id_facultad
       JOIN tipo_programa  tp  ON c.id_tipo_programa   = tp.id_tipo_programa
       JOIN ciclo_egreso   ce  ON eg.id_ciclo_egreso   = ce.id_ciclo_egreso
       LEFT JOIN catalogo_salario cs  ON ea.id_salario  = cs.id_salario
       LEFT JOIN empleo           emp ON ea.id_encuesta = emp.id_encuesta
       ${whereSQL}
       ORDER BY ea.anio_encuesta DESC, eg.apellidos_nombres ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      total: Number(total), page, limit,
      pages: Math.ceil(Number(total) / limit),
      data: rows,
    });
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/stats-tab', async (req, res) => {
  try {
    const { tipo = 'laboral', anio, anios, facultad, carrera, programa, ciclo } = req.query;
    const where = ['ea.encuestado = 1'];
    const params = [];

    if (tipo === 'laboral')          { where.push('ea.trabaja = 1', '(ea.es_emprendedor = 0 OR ea.es_emprendedor IS NULL)'); }
    else if (tipo === 'emprendedor') { where.push('ea.es_emprendedor = 1'); }
    else if (tipo === 'busqueda')    { where.push('ea.trabaja = 0', '(ea.es_emprendedor = 0 OR ea.es_emprendedor IS NULL)'); }

    addAnioFilter(where, params, anio, anios);
    if (facultad) { where.push('f.nombre_facultad = ?'); params.push(facultad); }
    if (carrera)  { where.push('c.nombre_carrera = ?');  params.push(carrera); }
    if (programa) { where.push('tp.descripcion = ?');    params.push(programa); }
    addCicloFilter(where, params, ciclo);

    const W = where.join(' AND ');
    const JOINS = `
      FROM encuesta_anual ea
      JOIN egresado      eg  ON ea.id_egresado      = eg.id_egresado
      JOIN carrera       c   ON eg.id_carrera       = c.id_carrera
      JOIN facultad      f   ON c.id_facultad       = f.id_facultad
      JOIN tipo_programa tp  ON c.id_tipo_programa  = tp.id_tipo_programa
      JOIN ciclo_egreso  ce  ON eg.id_ciclo_egreso  = ce.id_ciclo_egreso
      LEFT JOIN catalogo_salario cs  ON ea.id_salario  = cs.id_salario
      LEFT JOIN empleo           emp ON ea.id_encuesta = emp.id_encuesta
    `;

    const grp = (col, extra = '') => db.query(
      `SELECT ${col} AS label, COUNT(*) AS n ${JOINS} WHERE ${W}${extra ? ' AND ' + extra : ''} GROUP BY ${col} ORDER BY n DESC LIMIT 7`,
      params
    );

    const allResults = await Promise.all([
      db.query(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN ea.afinidad_laboral='SI' THEN 1 ELSE 0 END) AS afinidad,
        SUM(CASE WHEN ea.afinidad_laboral IS NOT NULL THEN 1 ELSE 0 END) AS resp_af
        ${JOINS} WHERE ${W}`, params),
      grp('ea.nivel_puesto', 'ea.nivel_puesto IS NOT NULL'),
      grp('ea.satisfaccion_usil', 'ea.satisfaccion_usil IS NOT NULL'),
      grp('cs.rango_estandar', 'cs.rango_estandar IS NOT NULL'),
      tipo === 'laboral' ? grp('emp.rubro', 'emp.rubro IS NOT NULL') : Promise.resolve([[], null]),
      tipo === 'laboral' ? grp('emp.centro_laboral', 'emp.centro_laboral IS NOT NULL') : Promise.resolve([[], null]),
      tipo === 'laboral' ? grp('emp.area_trabajo', 'emp.area_trabajo IS NOT NULL') : Promise.resolve([[], null]),
      grp('c.nombre_carrera'),
      grp('f.nombre_facultad'),
    ]);

    const [kpiRows, nivelRows, satisfRows, rangosRows, rubrosRows, empresasRows, areasRows, carrerasRows, facRows]
      = allResults.map(r => r[0] || []);

    const kpi = kpiRows[0] || {};
    const total = Number(kpi.total) || 0;
    const pct = (n, d) => d ? Math.round(Number(n) / Number(d) * 1000) / 10 : 0;
    const toItems = (rows) => {
      const t = rows.reduce((s, r) => s + Number(r.n), 0);
      return rows.map(r => ({ label: String(r.label || '—'), total: Number(r.n), pct: pct(r.n, t) }));
    };

    res.json({
      total,
      tasaAfinidad:  pct(kpi.afinidad, kpi.resp_af),
      nivelPuesto:   toItems(nivelRows),
      satisfaccion:  toItems(satisfRows),
      rangos:        toItems(rangosRows),
      topRubros:     toItems(rubrosRows),
      topEmpresas:   toItems(empresasRows),
      topAreas:      toItems(areasRows),
      topCarreras:   toItems(carrerasRows),
      topFacultades: toItems(facRows),
    });
  } catch (e) { serverError(res, e); }
});

router.get('/empleabilidad/informes', async (req, res) => {
  try {
    const { anio, unidad, facultad } = req.query;
    const where = ['activo = 1'];
    const params = [];
    if (anio)     { where.push('anio = ?');            params.push(Number(anio)); }
    if (unidad)   { where.push('unidad = ?');          params.push(unidad); }
    if (facultad) { where.push('facultad = ?');        params.push(facultad); }

    const [rows] = await db.query(
      `SELECT id, nombre, anio, unidad, facultad, url_descarga, tipo_acceso
       FROM informe_empleabilidad
       WHERE ${where.join(' AND ')}
       ORDER BY anio DESC, unidad, facultad`,
      params
    );

    const [[años]]    = await Promise.all([
      db.query('SELECT DISTINCT anio FROM informe_empleabilidad WHERE activo=1 ORDER BY anio DESC'),
    ]);
    const [unidades]  = await db.query('SELECT DISTINCT unidad  FROM informe_empleabilidad WHERE activo=1 ORDER BY unidad');
    const [facultades]= await db.query('SELECT DISTINCT facultad FROM informe_empleabilidad WHERE activo=1 ORDER BY facultad');

    res.json({
      total: rows.length,
      data: rows,
      catalogos: {
        años:      años.map(r => r.anio),
        unidades:  unidades.map(r => r.unidad),
        facultades: facultades.map(r => r.facultad),
      },
    });
  } catch (e) { serverError(res, e); }
});

export default router;
