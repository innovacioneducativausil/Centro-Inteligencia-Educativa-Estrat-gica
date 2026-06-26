


import { readFileSync } from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import db from './db_empl.js';

const EXCELS = [
  { file: 'C:\\Users\\ANGIE\\Downloads\\2022 (1).xlsx', anio: 2022 },
  { file: 'C:\\Users\\ANGIE\\Downloads\\2023.xlsx',      anio: 2023 },
  { file: 'C:\\Users\\ANGIE\\Downloads\\2024 (1).xlsx', anio: 2024 },
  { file: 'C:\\Users\\ANGIE\\Downloads\\2025.xlsx',      anio: 2025 },
];


function parseTrabaja(val) {
  if (!val) return false;
  const v = String(val).trim();
  const n = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/no\s+me\s+encuentro\s+laborando/.test(n)) return false;
  if (/^(no|0|false)$/.test(n)) return false;
  if (/no\s+trabaj|sin\s+empleo/.test(n)) return false;
  if (/^s[i]?$/.test(n)) return true;
  if (/trabaj/i.test(v))    return true;
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
  const v = String(val).trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /^(s|si|yes|true|1)$/.test(v);
}

const normStr = v => String(v ?? '').trim().toUpperCase();

function normalizeCiclo(s) {
  if (!s) return s;
  return s.replace(/^(\d{4})-(\d)$/, '$1-0$2');
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


const B = {
  B1: { rango: 'Menos de S/. 1,500',                min: 0,    max: 1499.99 },
  B2: { rango: 'De S/. 1,500 a menos de S/. 3,500', min: 1500, max: 3499.99 },
  B3: { rango: 'De S/. 3,500 a menos de S/. 5,500', min: 3500, max: 5499.99 },
  B4: { rango: 'De S/. 5,500 a menos de S/. 7,500', min: 5500, max: 7499.99 },
  B5: { rango: 'De S/. 7,500 a mas',                min: 7500, max: null   },
};
const ENTRIES = [
  ['Menos de S/. 1,500', B.B1], ['De S/. 1,500 a menos de S/. 3,500', B.B2],
  ['De S/. 3,500 a menos de S/. 5,500', B.B3], ['De S/. 5,500 a menos de S/. 7,500', B.B4],
  ['De S/. 7,500 a mas', B.B5],
  ['Sueldo hasta 2 salarios mínimos (sueldo mínimo S/1025)', B.B2],
  ['Sueldo hasta 4 salarios mínimos (hasta S/4100)', B.B3],
  ['Sueldo superior a 4 salarios mínimos', B.B4],
  ['Sueldo hasta 2 salarios minimos', B.B2], ['Sueldo hasta 4 salarios minimos', B.B3],
  ['Sueldo hasta 6 salarios minimos', B.B4], ['Sueldo mas de 6 salarios minimos', B.B5],
  ['Menos de S/. 1,025', B.B1], ['De S/. 1,025 a menos de S/. 1,500', B.B1],
  ['De S/. 1,500 a menos de S/. 2,500', B.B2], ['De S/. 2,500 a menos de S/. 3,500', B.B2],
  ['De S/. 3,500 a menos de S/. 4,500', B.B3], ['De S/. 4,500 a menos de S/. 5,500', B.B3],
  ['De S/. 5,500 a menos de S/. 6,500', B.B4], ['De S/. 6,500 a menos de S/. 7,500', B.B4],
  ['De S/. 7,500 a más', B.B5], ['De S/7,500 a menos de S/. 8,500', B.B5],
  ['De S/. 8500 a menos de S/. 9,500', B.B5], ['Más de S/. 9,500', B.B5], ['Mas de S/. 9,500', B.B5],
  ['De S/. 5,500 a más', B.B4], ['De S/. 5,500 a mas', B.B4],
  ['Menos de S/. 2,500', B.B2], ['De S/. 2,500 a menos de S/. 4,500', B.B3],
  ['De S/. 4,500 a menos de S/. 6,500', B.B4], ['De S/. 6,500 a menos de S/. 8,500', B.B4],
  ['De S/. 8,500 a mas', B.B5], ['De S/. 8,500 a más', B.B5],
  ['De S/. 5,500 a menos de S/6,500', B.B4], ['De S/. 6,500 a menos de S/7,500', B.B4],
  ['De S/7,500 a menos de S/8,500', B.B5], ['De s/. 1,025 a menos de S/. 1500', B.B1],
  ['De s/. 1,025 a menos de S/. 1,500', B.B1], ['De S/. 1,500 a menos de S/. 3,000', B.B2],
  ['De S/. 3,000 a menos de S/. 6,000', B.B3], ['De S/. 6,000 a mas', B.B5],
];
const SAL_EXACT = new Map(ENTRIES);
const SAL_NORM  = new Map(ENTRIES.map(([k,v]) => [
  k.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim(), v
]));

function resolveCanonicalSalario(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (SAL_EXACT.has(s)) return SAL_EXACT.get(s);
  const n = s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ');
  return SAL_NORM.get(n) ?? null;
}

async function resolveSalarioId(rawSalario) {
  if (!rawSalario) return null;
  const [ex] = await db.query('SELECT id_salario FROM catalogo_salario WHERE descripcion_original=? LIMIT 1', [rawSalario]);
  if (ex.length) return ex[0].id_salario;
  const c = resolveCanonicalSalario(rawSalario);
  const [ins] = await db.query('INSERT IGNORE INTO catalogo_salario SET ?', {
    descripcion_original: rawSalario,
    rango_estandar:       c?.rango ?? rawSalario,
    rango_min_soles:      c?.min   ?? null,
    rango_max_soles:      c?.max   ?? null,
  });
  if (ins.insertId) return ins.insertId;
  const [retry] = await db.query('SELECT id_salario FROM catalogo_salario WHERE descripcion_original=? LIMIT 1', [rawSalario]);
  return retry.length ? retry[0].id_salario : null;
}


function detectTallCols(headers) {
  const norm2 = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const f = kws => headers.find(h => {
    const hn = norm2(h);
    return kws.every(k => hn.includes(norm2(k)));
  }) ?? null;
  return {
    colDoc:      f(['dni']) || f(['nro_doc']) || f(['nro','doc']),
    colNombre:   f(['apellido']) || f(['nombre']),
    colPrograma: f(['program']),
    colFacultad: f(['facult']),
    colCarrera:  f(['carrera']),
    colEgreso:   headers.find(h => /^egreso$/i.test(h.trim())) || headers.find(h => /cadmisi/i.test(h)) || f(['ciclo_egreso']) || f(['egreso']),
    colSit:      f(['situaci','laboral']) || f(['situacion','laboral']) || null,
    colAcEmpl:   headers.find(h => /^ac\s+empl$/i.test(h.trim())) || f(['ac','empl']) || null,
    colCorreo:   f(['correo']),
    colAfinidad: f(['afinid']) || f(['guard','relaci']) || f(['relaci','carrer']),
    colNivel:    f(['nivel','puesto']),
    colSalario:  headers.find(h => /^salario\s+promedio$/i.test(h.trim())) || f(['rango','salarial']) || f(['salari']),
    colEmprende: f(['emprend']) || f(['emprende']),
    colSatisf:   f(['satisf']),
  };
}


async function importExcel({ file, anio }) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Importando: ${file}  (año ${anio})`);
  const buffer = readFileSync(file);
  const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });
  if (!rows.length) { console.log('  Sin filas — skip'); return; }

  const headers = Object.keys(rows[0]);
  const cols    = detectTallCols(headers);
  const trimestre = 'ANUAL';
  const fuente    = `EXCEL_TALL_${anio}`;

  console.log(`  Filas: ${rows.length}`);
  console.log(`  Cols detectadas: doc=${cols.colDoc} | sit=${cols.colSit} | acEmpl=${cols.colAcEmpl} | sal=${cols.colSalario} | emprende=${cols.colEmprende}`);

  let imported = 0, skipped = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nroDoc = String(row[cols.colDoc] ?? '').trim();
      if (!nroDoc) { skipped++; continue; }

      const nomFac  = String(row[cols.colFacultad] ?? '').trim();
      const nomProg = normStr(row[cols.colPrograma] ?? '');
      const nomCar  = normStr(row[cols.colCarrera]  ?? '');
      const apellidos = String(row[cols.colNombre] ?? '').trim() || 'Sin Nombre';
      const correo    = cols.colCorreo ? String(row[cols.colCorreo] ?? '').trim() || null : null;

      const [egRows] = await db.query('SELECT id_egresado, id_carrera, id_ciclo_egreso FROM egresado WHERE nro_doc=? LIMIT 1', [nroDoc]);
      let idEgresado, idCarrera, idCiclo;

      if (egRows.length) {
        idEgresado = egRows[0].id_egresado;
        idCarrera  = egRows[0].id_carrera;
        idCiclo    = egRows[0].id_ciclo_egreso;
        if (nomCar) {
          const idFac  = nomFac  ? await upsertGet('facultad',     { nombre_facultad: nomFac  }) : null;
          const idProg = nomProg ? await upsertGet('tipo_programa', { descripcion: nomProg     }) : null;
          if (idFac && idProg) {
            idCarrera = await upsertGet('carrera', { nombre_carrera: nomCar, id_tipo_programa: idProg }, { id_facultad: idFac });
          }
          const rawCicloStr2 = normalizeCiclo(String(row[cols.colEgreso] ?? '').trim()) || null;
          if (rawCicloStr2) {
            const rawAnioEg2 = parseInt(rawCicloStr2) || new Date().getFullYear();
            idCiclo = await upsertGet('ciclo_egreso', { codigo_ciclo: rawCicloStr2 }, { anio_egreso: rawAnioEg2 });
          }
        }
        const updFields = ['apellidos_nombres=?'];
        const updParams = [apellidos];
        if (idCarrera) { updFields.push('id_carrera=?');         updParams.push(idCarrera); }
        if (idCiclo)   { updFields.push('id_ciclo_egreso=?');     updParams.push(idCiclo); }
        if (correo)    { updFields.push('correo_institucional=?'); updParams.push(correo); }
        updParams.push(idEgresado);
        await db.query(`UPDATE egresado SET ${updFields.join(',')} WHERE id_egresado=?`, updParams);
      } else {
        const nomCarEf = nomCar || 'OTRO';
        const idFac    = nomFac  ? await upsertGet('facultad',     { nombre_facultad: nomFac  }) : null;
        const idProg   = nomProg ? await upsertGet('tipo_programa', { descripcion: nomProg     }) : null;
        idCarrera = await upsertGet('carrera',
          { nombre_carrera: nomCarEf, ...(idProg ? { id_tipo_programa: idProg } : {}) },
          { id_facultad: idFac || null, ...(idProg ? {} : { id_tipo_programa: null }) }
        );
        const rawCicloStr = normalizeCiclo(String(row[cols.colEgreso] ?? '').trim()) || 'SIN-CICLO';
        const rawAnioEg   = parseInt(rawCicloStr) || new Date().getFullYear();
        idCiclo = await upsertGet('ciclo_egreso', { codigo_ciclo: rawCicloStr }, { anio_egreso: rawAnioEg });
        const ins = { nro_doc: nroDoc, apellidos_nombres: apellidos, id_carrera: idCarrera, id_ciclo_egreso: idCiclo };
        if (correo) ins.correo_institucional = correo;
        const [er] = await db.query('INSERT INTO egresado SET ?', ins);
        idEgresado = er.insertId;
      }

      if (!idEgresado) { skipped++; continue; }

      const sitVal      = cols.colSit     ? String(row[cols.colSit]    ?? '').trim() : '';
      const acEmplVal   = cols.colAcEmpl  ? String(row[cols.colAcEmpl] ?? '').trim() : '';
      const afinVal     = String(row[cols.colAfinidad] ?? '').trim();
      const nivelVal    = String(row[cols.colNivel]    ?? '').trim() || null;
      const salarioVal  = String(row[cols.colSalario]  ?? '').trim();
      const emprendeVal = String(row[cols.colEmprende] ?? '').trim();
      const satisfVal   = String(row[cols.colSatisf]   ?? '').trim() || null;

      const gatillo = sitVal || acEmplVal;
      const hayDatos = gatillo || afinVal || nivelVal || salarioVal || satisfVal || emprendeVal;
      if (!hayDatos) { skipped++; continue; }

      const trabaja       = gatillo ? (parseTrabaja(gatillo) ? 1 : 0) : null;
      const esEmprendedor = emprendeVal !== '' ? (/^emprende$/i.test(emprendeVal) || parseSiNo(emprendeVal) ? 1 : 0) : null;
      const afinidad      = afinVal ? (parseSiNo(afinVal) ? 'SI' : 'NO') : null;
      const situacion     = sitVal || (acEmplVal ? (parseSiNo(acEmplVal) ? 'Trabaja' : 'No trabaja') : null);
      const idSalario     = await resolveSalarioId(salarioVal);

      const [encRows] = await db.query(
        'SELECT id_encuesta FROM encuesta_anual WHERE id_egresado=? AND anio_encuesta=? AND trimestre=? LIMIT 1',
        [idEgresado, anio, trimestre]
      );
      if (encRows.length) {
        await db.query(
          `UPDATE encuesta_anual SET situacion_laboral=?, trabaja=?, es_emprendedor=?,
           afinidad_laboral=?, nivel_puesto=?, id_salario=?, satisfaccion_usil=?,
           encuestado=1, fuente_carga=? WHERE id_encuesta=?`,
          [situacion, trabaja, esEmprendedor, afinidad, nivelVal, idSalario, satisfVal, fuente, encRows[0].id_encuesta]
        );
      } else {
        await db.query('INSERT INTO encuesta_anual SET ?', {
          id_egresado: idEgresado, anio_encuesta: anio, trimestre,
          situacion_laboral: situacion, trabaja, es_emprendedor: esEmprendedor,
          afinidad_laboral: afinidad, nivel_puesto: nivelVal,
          id_salario: idSalario, satisfaccion_usil: satisfVal,
          encuestado: 1, fuente_carga: fuente,
        });
      }
      imported++;
    } catch(e) {
      errors++;
      if (errors <= 5) console.error(`  ERROR fila ${i+2}:`, e.message);
    }
  }

  console.log(`  ✅ Importados: ${imported}  |  Skipped: ${skipped}  |  Errores: ${errors}`);
}


(async () => {
  try {
    for (const excel of EXCELS) {
      await importExcel(excel);
    }

    const [enc]  = await db.query('SELECT COUNT(*) as n FROM encuesta_anual');
    const [egr]  = await db.query('SELECT COUNT(*) as n FROM egresado');
    const [csal] = await db.query('SELECT COUNT(*) as n FROM catalogo_salario WHERE rango_min_soles IS NULL AND rango_estandar = descripcion_original');
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total encuesta_anual: ${enc[0].n}`);
    console.log(`Total egresados:      ${egr[0].n}`);
    console.log(`Rangos sin clasificar: ${csal[0].n}`);
    if (csal[0].n > 0) {
      const [unclass] = await db.query('SELECT descripcion_original, COUNT(ea.id_encuesta) as registros FROM catalogo_salario cs LEFT JOIN encuesta_anual ea ON ea.id_salario = cs.id_salario WHERE cs.rango_min_soles IS NULL AND cs.rango_estandar = cs.descripcion_original GROUP BY cs.id_salario ORDER BY registros DESC LIMIT 10');
      console.log('Sin clasificar:', unclass);
    }
  } catch(e) {
    console.error('Error fatal:', e);
  }
  process.exit(0);
})();
