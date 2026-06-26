import xlsx from 'xlsx';
import db from './db_empl.js';

const BASE = 'C:/Users/ANGIE/Downloads';
const TRIMESTRE = 'Q4';

const FILES = [
  {
    file: `${BASE}/Pregrado - CPEL 2022.xlsx`,
    anio: 2022,
    fuente: 'IMPORT_Q4_PREGRADO_CPEL_2022',
    map: {
      doc: 'DNI',
      nombre: 'APELLIDOS Y NOMBRES COMPLETOS',
      programa: 'Programa',
      facultad: 'FACULTAD',
      carrera: 'CARRERA',
      ciclo: 'CADMISIÓN',
      actual: 'Actualmente ¿Cuál es tu condición laboral?',
      trabaja: 'Ac Empl',
      centro: 'Nombre del centro laboral (Razón Social):',
      rubro: 'RUBRO',
      area: 'Área de trabajo:',
      puesto: 'Puesto que ocupas. Ejemplo: Asistente de Recursos Humanos_1',
      salario: '¿Cuál es tu salario promedio?',
      afinidad: '¿Tu posición laboral guarda relación con tu carrera?',
      satisfaccion: 'Indique su nivel de satisfacción con el área académica',
    },
  },
  {
    file: `${BASE}/Pregrado - Cpel 2023.xlsx`,
    anio: 2023,
    fuente: 'IMPORT_Q4_PREGRADO_CPEL_2023',
    defaults: { carrera: 'NO INFORMADA' },
    map: {
      doc: 'DNI o Carnet de Extranjería',
      nombre: 'Apellidos y nombres completos',
      programa: 'Programa que has estudiado',
      facultad: 'Indica a qué Facultad perteneces.',
      actual: 'Actualmente, ¿cuál es tu situación laboral?',
      centro: 'Con el fin de reforzar la relación con tu empleador e invitarlo a eventos corporativos y ferias laborales, te agradeceríamos completar la siguiente información.\n \n Nombre del centro laboral (Razón social):',
      rubro: 'Rubro',
      area: 'Área de trabajo. Ejemplo: Recursos Humanos',
      puesto: 'Puesto que ocupas. Ejemplo: Asistente de Recursos Humanos',
      salario: 'Actualmente, ¿cuál es tu salario promedio?',
      afinidad: '¿Tu trabajo actual tiene relación con tu carrera?',
      satisfaccion: 'Selecciona tu nivel de satisfacción con respecto a la formación académica recibida en la USIL, para desarrollarte con éxito e insertarte en el mercado laboral.',
    },
  },
  {
    file: `${BASE}/IE 2023.xlsx`,
    anio: 2023,
    fuente: 'IMPORT_Q4_IE_2023',
    defaults: { programa: 'IE', facultad: 'IE', carrera: 'IE' },
    map: {
      doc: 'DNI o Carnet de Extranjería',
      nombre: 'Nombre',
      ciclo: 'AÑO DE EGRESO',
      actual: 'Actualmente, ¿cuál es tu situación laboral?',
      centro: 'Con el fin de reforzar la relación con tu empleador e invitarlo a eventos corporativos y ferias laborales, te agradeceríamos completar la siguiente información\n \n Nombre del centro laboral (Razón Social):',
      rubro: 'Rubro',
      area: 'Área de trabajo. Ejemplo: Recursos Humanos',
      puesto: 'Puesto que ocupas. Ejemplo: Asistente de Recursos Humanos',
      salario: 'Actualmente, ¿cuál es tu salario promedio?',
      afinidad: '¿Tu trabajo laboral actual tiene relación con tu carrera?',
      emprende: 'EMPRENDE',
      satisfaccion: 'Selecciona tu nivel de satisfacción con respecto a la formación académica recibida en el Instituto de Emprendedores USIL, para desarrollarte con éxito e insertarte en el mercado laboral.',
    },
  },
  {
    file: `${BASE}/Pregrado ejecutivo - 2023.xlsx`,
    anio: 2023,
    fuente: 'IMPORT_Q4_EPG_2023',
    defaults: { programa: 'EPG', facultad: 'EPG', ciclo: 'SIN-CICLO', carrera: 'NO INFORMADA' },
    map: {
      doc: 'DNI o Carnet de Extranjería',
      nombre: 'Nombre',
      carrera: 'Indica qué programa has estudiado en la Escuela de Postgrado USIL.',
      actual: 'Actualmente, ¿cuál es tu situación laboral?',
      centro: 'Con el fin de reforzar la relación con tu empleador e invitarlo a eventos corporativos y ferias laborales, te agradeceríamos completar la siguiente información\n \n Nombre del centro laboral (Razón Social):',
      rubro: 'Rubro',
      area: 'Área de trabajo. Ejemplo: Recursos Humanos',
      puesto: 'Puesto que ocupas. Ejemplo: Coordinador de Recursos Humanos',
      salario: 'Actualmente, ¿cuál es tu salario promedio?',
      afinidad: '¿Tu trabajo laboral actual tiene relación con la maestría/ doctorado que estudiaste?',
      emprende: 'EMPRENDE',
      satisfaccion: 'Selecciona tu nivel de satisfacción con respecto a la formación académica recibida en la Escuela de Postgrado USIL, para desarrollarte con éxito e insertarte en el mercado laboral.',
    },
  },
  {
    file: `${BASE}/Pregrado - CPEL 2024 Q4.xlsx`,
    anio: 2024,
    fuente: 'IMPORT_Q4_PREGRADO_CPEL_2024',
    map: {
      doc: 'DNI o Carnet de Extranjería',
      nombre: 'Nombre',
      programa: 'PROGRAMA',
      facultad: 'FACULTAD',
      carrera: 'CARRERA',
      ciclo: 'EGRESO',
      actual: 'Actualmente, ¿cuál es tu situación laboral?',
      trabaja: 'TRABAJA',
      centro: '¿Cómo se llama la empresa donde trabajas?',
      nivel: 'TIPO DE PUESTO',
      salario: 'Actualmente, ¿cuál es tu salario promedio?',
      afinidad: '¿Tu trabajo actual tiene relación con tu carrera?',
      emprende: 'EMPRENDE',
      satisfaccion: 'Selecciona tu nivel de satisfacción con respecto a la formación académica recibida en la USIL, para desarrollarte con éxito e insertarte en el mercado laboral',
    },
  },
  {
    file: `${BASE}/IE 2024.xlsx`,
    anio: 2024,
    fuente: 'IMPORT_Q4_IE_2024',
    defaults: { programa: 'IE', facultad: 'IE' },
    map: {
      doc: 'DNI o Carnet de Extranjería',
      nombre: 'Nombre',
      carrera: 'Carrera',
      ciclo: 'Egreso',
      actual: 'Actualmente, ¿Cuál es tu situación laboral?',
      trabaja: 'TRABAJA 2',
      centro: 'Nombre del centro laboral (Razón social):En caso no tengas un empleador fijo, escribe “No aplica”',
      rubro: 'Rubro:',
      puesto: 'Puesto que ocupas. Ejemplo: Asistente de Recursos Humanos',
      salario: 'Actualmente, ¿Cuál es tu salario promedio?',
      afinidad: 'Afinidad Puesto',
      emprende: 'EMPRENDE',
      satisfaccion: 'Selecciona tu nivel de satisfacción con respecto a la formación académica recibida en el Instituto de Emprendedores USIL, para desarrollarte con éxito e insertarte en el mercado laboral.',
    },
  },
  {
    file: `${BASE}/EPG 2024.xlsx`,
    anio: 2024,
    fuente: 'IMPORT_Q4_EPG_2024',
    defaults: { programa: 'EPG', facultad: 'EPG' },
    map: {
      doc: 'DNI o Carnet de Extranjería',
      nombre: 'NOMBRE',
      carrera: 'CARRERA',
      ciclo: 'PERIODO',
      actual: 'Situación laboral',
      trabaja: 'TRABAJA',
      centro: 'Nombre del centro laboral (Razón social):En caso no tengas un empleador fijo, escribe “No aplica”',
      rubro: 'Rubro:',
      area: 'Área de trabajo. Ejemplo: Recursos Humanos:',
      puesto: 'Puesto que ocupas. Ejemplo: Asistente de Recursos Humanos',
      salario: 'Actualmente, ¿Cuál es tu salario promedio?',
      afinidad: '¿Tu trabajo actual tiene relación con la maestría/ doctorado que estudiaste?',
      emprende: 'Emprende',
      satisfaccion: 'Selecciona tu nivel de satisfacción con respecto a la formación académica recibida en la Escuela de Postgrado USIL, para desarrollarte con éxito e insertarte en el mercado laboral',
    },
  },
];

function clean(s) {
  return String(s ?? '').trim();
}

function key(s) {
  return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function normalizePrograma(v) {
  const n = key(v);
  if (!n) return '';

  if (n.includes('cpel') || (n.includes('pregrado') && n.includes('ejecutivo'))) return 'CPEL';
  if (n.includes('pre')) return 'PREGRADO';
  if (n.includes('epg') || n.includes('postgrado')) return 'EPG';
  if (n === 'ie' || n.includes('emprendedores')) return 'IE';
  return clean(v).toUpperCase();
}

function parseTrabaja(v) {
  const n = key(v);
  if (!n) return false;
  if (/no\s+me\s+encuentro\s+laborando|no\s+trabaj|sin\s+empleo|no\s+labora/.test(n)) return false;
  if (/^(no|0|false)$/.test(n)) return false;
  return /^(si|s|yes|true|1)$/.test(n)
    || /trabaj|labora|emprend|con\s*empleo|dependiente|independiente/.test(n);
}

function parseSiNo(v) {
  const n = key(v);
  return /^(si|s|yes|true|1|emprende)$/.test(n);
}

function normalizeCiclo(v, anio) {
  const raw = clean(v);
  if (!raw) return 'SIN-CICLO';
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return dmy[3];
  return raw.replace(/^(\d{4})-(\d)$/, '$1-0$2') || String(anio);
}

function anioFromCiclo(ciclo, fallback) {
  const m = clean(ciclo).match(/20\d{2}/);
  return m ? Number(m[0]) : fallback;
}

function value(row, map, name, defaults = {}) {
  const col = map[name];
  if (col) return clean(readCell(row, col));
  return defaults[name] ?? '';
}

function readCell(row, col) {
  if (!col) return '';
  if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
  const target = key(col);
  const match = Object.keys(row).find(h => {
    const hk = key(h);
    return hk === target || hk.startsWith(target.slice(0, 70)) || target.startsWith(hk.slice(0, 70));
  });
  return match ? row[match] : '';
}

async function upsertGet(table, whereObj, insertObj = {}) {
  const conds = Object.entries(whereObj);
  const [rows] = await db.query(
    `SELECT * FROM ${table} WHERE ${conds.map(([k]) => `${k}=?`).join(' AND ')} LIMIT 1`,
    conds.map(([, v]) => v)
  );
  if (rows.length) return rows[0][Object.keys(rows[0])[0]];
  const [r] = await db.query(`INSERT INTO ${table} SET ?`, { ...whereObj, ...insertObj });
  return r.insertId;
}

async function getCarreraId(nombreCarrera, nombreFacultad, programa) {
  const idFac = await upsertGet('facultad', { nombre_facultad: nombreFacultad || 'SIN FACULTAD' });
  const idProg = await upsertGet('tipo_programa', { descripcion: programa || 'SIN PROGRAMA' });
  const [rows] = await db.query(
    'SELECT id_carrera FROM carrera WHERE nombre_carrera=? AND id_tipo_programa=? LIMIT 1',
    [nombreCarrera, idProg]
  );
  if (rows.length) return rows[0].id_carrera;
  const [r] = await db.query('INSERT INTO carrera SET ?', {
    nombre_carrera: nombreCarrera,
    id_facultad: idFac,
    id_tipo_programa: idProg,
  });
  return r.insertId;
}

const SALARY_BANDS = {
  B1: { rango: 'Menos de S/. 1,500', min: 0, max: 1499.99 },
  B2: { rango: 'De S/. 1,500 a menos de S/. 3,500', min: 1500, max: 3499.99 },
  B3: { rango: 'De S/. 3,500 a menos de S/. 5,500', min: 3500, max: 5499.99 },
  B4: { rango: 'De S/. 5,500 a menos de S/. 7,500', min: 5500, max: 7499.99 },
  B5: { rango: 'De S/. 7,500 a mas', min: 7500, max: null },
};

const SALARY_MAP = new Map([
  ['menos de s/. 1,025', SALARY_BANDS.B1],
  ['de s/. 1,025 a menos de s/. 1,500', SALARY_BANDS.B1],
  ['de s/. 1,025 a menos de s/. 1500', SALARY_BANDS.B1],
  ['menos de s/. 1,500', SALARY_BANDS.B1],
  ['de s/. 1,500 a menos de s/. 2,500', SALARY_BANDS.B2],
  ['de s/. 2,500 a menos de s/. 3,500', SALARY_BANDS.B2],
  ['de s/. 1,500 a menos de s/. 3,500', SALARY_BANDS.B2],
  ['de s/. 3,500 a menos de s/. 4,500', SALARY_BANDS.B3],
  ['de s/. 4,500 a menos de s/. 5,500', SALARY_BANDS.B3],
  ['de s/. 3,500 a menos de s/. 5,500', SALARY_BANDS.B3],
  ['de s/. 5,500 a menos de s/6,500', SALARY_BANDS.B4],
  ['de s/. 5,500 a menos de s/. 6,500', SALARY_BANDS.B4],
  ['de s/. 6,500 a menos de s/7,500', SALARY_BANDS.B4],
  ['de s/. 6,500 a menos de s/. 7,500', SALARY_BANDS.B4],
  ['de s/. 5,500 a menos de s/. 7,500', SALARY_BANDS.B4],
  ['de s/. 5,500 a mas', SALARY_BANDS.B4],
  ['de s/. 5,500 a mas', SALARY_BANDS.B4],
  ['de s/7,500 a menos de s/. 8,500', SALARY_BANDS.B5],
  ['de s/7,500 a menos de s/8,500', SALARY_BANDS.B5],
  ['de s/. 8500 a menos de s/. 9,500', SALARY_BANDS.B5],
  ['de s/. 7,500 a mas', SALARY_BANDS.B5],
  ['mas de s/. 9,500', SALARY_BANDS.B5],
]);

async function salarioId(raw) {
  const s = clean(raw);
  if (!s || key(s) === 'response') return null;
  const band = SALARY_MAP.get(key(s));
  const data = band ?? { rango: s, min: null, max: null };
  const [existing] = await db.query('SELECT id_salario FROM catalogo_salario WHERE descripcion_original=? LIMIT 1', [s]);
  if (existing.length) return existing[0].id_salario;
  const [r] = await db.query('INSERT IGNORE INTO catalogo_salario SET ?', {
    descripcion_original: s,
    rango_estandar: data.rango,
    rango_min_soles: data.min,
    rango_max_soles: data.max,
  });
  if (r.insertId) return r.insertId;
  const [retry] = await db.query('SELECT id_salario FROM catalogo_salario WHERE descripcion_original=? LIMIT 1', [s]);
  return retry[0]?.id_salario ?? null;
}

async function puestoId(raw) {
  const p = clean(raw);
  if (!p) return null;
  const [rows] = await db.query(
    'SELECT id_puesto FROM catalogo_puesto WHERE ? LIKE CONCAT("%", texto_busqueda, "%") LIMIT 1',
    [p]
  );
  return rows[0]?.id_puesto ?? null;
}

async function upsertEmpleo(idEncuesta, row, map) {
  const centro = clean(readCell(row, map.centro));
  const rubro = clean(readCell(row, map.rubro));
  const area = clean(readCell(row, map.area));
  const puesto = clean(readCell(row, map.puesto));
  if (![centro, rubro, area, puesto].some(Boolean)) return;
  const data = {
    centro_laboral: centro || null,
    rubro: rubro || null,
    area_trabajo: area || null,
    puesto_libre: puesto || null,
    id_puesto: await puestoId(readCell(row, map.puestoOficial) || puesto),
  };
  const [existing] = await db.query('SELECT id_empleo FROM empleo WHERE id_encuesta=? LIMIT 1', [idEncuesta]);
  if (existing.length) {
    await db.query(
      'UPDATE empleo SET centro_laboral=?, rubro=?, area_trabajo=?, puesto_libre=?, id_puesto=? WHERE id_encuesta=?',
      [data.centro_laboral, data.rubro, data.area_trabajo, data.puesto_libre, data.id_puesto, idEncuesta]
    );
  } else {
    await db.query('INSERT INTO empleo SET ?', { id_encuesta: idEncuesta, ...data });
  }
}

async function importFile(cfg) {
  const wb = xlsx.readFile(cfg.file, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });
  let imported = 0, skipped = 0, duplicateSource = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const doc = value(row, cfg.map, 'doc');
      if (!doc || key(doc) === 'open-ended response' || key(doc) === 'response') {
        skipped++;
        continue;
      }

      const programa = normalizePrograma(value(row, cfg.map, 'programa', cfg.defaults));
      const facultad = clean(value(row, cfg.map, 'facultad', cfg.defaults)).toUpperCase() || programa || 'SIN FACULTAD';
      const carrera = clean(value(row, cfg.map, 'carrera', cfg.defaults)).toUpperCase() || 'NO INFORMADA';
      const ciclo = normalizeCiclo(value(row, cfg.map, 'ciclo', cfg.defaults), cfg.anio);
      const idCarrera = await getCarreraId(carrera, facultad, programa || 'SIN PROGRAMA');
      const idCiclo = await upsertGet('ciclo_egreso', { codigo_ciclo: ciclo }, { anio_egreso: anioFromCiclo(ciclo, cfg.anio) });

      const nombre = value(row, cfg.map, 'nombre') || 'Sin Nombre';
      const [existingEgr] = await db.query('SELECT id_egresado FROM egresado WHERE nro_doc=? LIMIT 1', [doc]);
      let idEgresado = existingEgr[0]?.id_egresado;
      if (!idEgresado) {
        const [r] = await db.query('INSERT INTO egresado SET ?', {
          nro_doc: doc,
          apellidos_nombres: nombre,
          id_carrera: idCarrera,
          id_ciclo_egreso: idCiclo,
        });
        idEgresado = r.insertId;
      }

      const actual = value(row, cfg.map, 'actual');
      const trabajaRaw = value(row, cfg.map, 'trabaja') || actual;
      const gatillo = trabajaRaw || actual;
      const salarioRaw = value(row, cfg.map, 'salario');
      const afinidadRaw = value(row, cfg.map, 'afinidad');
      const emprendeRaw = value(row, cfg.map, 'emprende');
      const satisfaccionRaw = value(row, cfg.map, 'satisfaccion');
      if (![gatillo, salarioRaw, afinidadRaw, emprendeRaw, satisfaccionRaw].some(Boolean)) {
        skipped++;
        continue;
      }

      const trabaja = parseTrabaja(gatillo) ? 1 : 0;
      const [encRows] = await db.query(
        'SELECT id_encuesta, fuente_carga FROM encuesta_anual WHERE id_egresado=? AND anio_encuesta=? AND trimestre=? LIMIT 1',
        [idEgresado, cfg.anio, TRIMESTRE]
      );

      if (encRows.length && encRows[0].fuente_carga && encRows[0].fuente_carga !== cfg.fuente) {
        duplicateSource++;
        continue;
      }

      const encuesta = {
        id_egresado: idEgresado,
        anio_encuesta: cfg.anio,
        trimestre: TRIMESTRE,
        situacion_laboral: actual || (trabaja ? 'Trabaja' : 'No trabaja'),
        trabaja,
        es_emprendedor: emprendeRaw ? (parseSiNo(emprendeRaw) ? 1 : 0) : null,
        afinidad_laboral: afinidadRaw ? (parseSiNo(afinidadRaw) ? 'SI' : 'NO') : null,
        nivel_puesto: value(row, cfg.map, 'nivel') || null,
        id_salario: await salarioId(salarioRaw),
        satisfaccion_usil: satisfaccionRaw ? satisfaccionRaw.replace(/[🙂🙁]/g, '').trim() : null,
        encuestado: 1,
        fuente_carga: cfg.fuente,
      };

      let idEncuesta = encRows[0]?.id_encuesta;
      if (idEncuesta) {
        await db.query(
          `UPDATE encuesta_anual SET situacion_laboral=?, trabaja=?, es_emprendedor=?,
           afinidad_laboral=?, nivel_puesto=?, id_salario=?, satisfaccion_usil=?,
           encuestado=1, fuente_carga=? WHERE id_encuesta=?`,
          [
            encuesta.situacion_laboral,
            encuesta.trabaja,
            encuesta.es_emprendedor,
            encuesta.afinidad_laboral,
            encuesta.nivel_puesto,
            encuesta.id_salario,
            encuesta.satisfaccion_usil,
            encuesta.fuente_carga,
            idEncuesta,
          ]
        );
      } else {
        const [r] = await db.query('INSERT INTO encuesta_anual SET ?', encuesta);
        idEncuesta = r.insertId;
      }

      if (trabaja) await upsertEmpleo(idEncuesta, row, cfg.map);
      imported++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`${cfg.fuente} fila ${i + 2}: ${e.message}`);
    }
  }

  console.log(`${cfg.fuente}: imported=${imported} skipped=${skipped} duplicateSource=${duplicateSource} errors=${errors}`);
}

try {
  for (const cfg of FILES) await importFile(cfg);
  const [summary] = await db.query(`
    SELECT ea.anio_encuesta AS anio, ea.trimestre, tp.descripcion AS programa,
           COUNT(*) total, SUM(ea.trabaja=1) trabajan, SUM(emp.id_empleo IS NOT NULL) empleos
    FROM encuesta_anual ea
    JOIN egresado eg ON eg.id_egresado=ea.id_egresado
    JOIN carrera c ON c.id_carrera=eg.id_carrera
    JOIN tipo_programa tp ON tp.id_tipo_programa=c.id_tipo_programa
    LEFT JOIN empleo emp ON emp.id_encuesta=ea.id_encuesta
    GROUP BY ea.anio_encuesta, ea.trimestre, tp.descripcion
    ORDER BY ea.anio_encuesta, ea.trimestre, tp.descripcion
  `);
  console.table(summary);
} finally {
  await db.end();
}
