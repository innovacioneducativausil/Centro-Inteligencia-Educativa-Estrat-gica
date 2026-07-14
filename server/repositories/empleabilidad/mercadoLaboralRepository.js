import db from '../../db_empl.js';

export async function getDatosEgresados(anio, facultad, carrera, programa, ciclo) {
  const [results] = await db.query('CALL empl_getDatosEgresados(?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null,
  ]);
  const resumenRow = results[0]?.[0] || {};
  return {
    resumen: {
      totalEncuestas:          Number(resumenRow.totalEncuestas)          || 0,
      egresadosTrabajando:     Number(resumenRow.egresadosTrabajando)     || 0,
      egresadosAfinidad:       Number(resumenRow.egresadosAfinidad)       || 0,
      egresadosEmprendedores:  Number(resumenRow.egresadosEmprendedores)  || 0,
      tasaEmpleabilidad:       Number(resumenRow.tasaEmpleabilidad)       || 0,
      tasaAfinidad:            Number(resumenRow.tasaAfinidad)            || 0,
    },
    topPuestos:  results[1],
    topRubros:   results[2],
    topAreas:    results[3],
    rangos:      results[4],
    niveles:     results[5],
  };
}

export async function loadInforme(idInforme) {
  const [results] = await db.query('CALL empl_loadInforme(?)', [idInforme]);
  const puestos       = results[0];
  const cats          = results[1];
  const habilidades   = results[2];
  const herramientas  = results[3];
  const tendencias    = results[4];
  const recomendaciones = results[5];

  const habilidadesByCat = new Map(cats.map(cat => [cat.id_categoria, { categoria: cat.categoria, origenDatos: cat.origenDatos, habilidades: [] }]));
  for (const item of habilidades) {
    habilidadesByCat.get(item.id_categoria)?.habilidades.push(item.habilidad);
  }

  return {
    puestos,
    habilidades: Array.from(habilidadesByCat.values()),
    herramientas,
    tendencias,
    recomendacionesEstudiante:   recomendaciones.filter(x => x.tipo === 'estudiante_egresado').map(x => x.texto),
    recomendacionesCurriculares: recomendaciones.filter(x => x.tipo === 'diseno_curricular').map(x => x.texto),
  };
}

export async function getFiltros() {
  const [results] = await db.query('CALL empl_getFiltrosMercado()');
  return results[0];
}

export async function getMetodologia() {
  const [results] = await db.query('CALL empl_getMetodologia()');
  return results[0];
}

export async function getInforme(facultad, carrera) {
  const [results] = await db.query('CALL empl_getInforme(?, ?)', [
    facultad || null, carrera || null,
  ]);
  return results[0]?.[0] || null;
}

export async function listInformesAdmin() {
  const [results] = await db.query('CALL empl_listInformesAdmin()');
  return results[0];
}

export async function createInformeAdmin({ nombreFacultad, nombreCarrera, periodo, tituloHeader, descripcion }) {
  const [results] = await db.query('CALL empl_createInformeAdmin(?, ?, ?, ?, ?)', [
    nombreFacultad, nombreCarrera, periodo, tituloHeader || null, descripcion || null,
  ]);
  return results[0][0].id_informe;
}

export async function updateInformeAdmin(id, { nombreFacultad, nombreCarrera, periodo, tituloHeader, descripcion }) {
  await db.query('CALL empl_updateInformeAdmin(?, ?, ?, ?, ?, ?)', [
    id, nombreFacultad, nombreCarrera, periodo, tituloHeader || null, descripcion || null,
  ]);
}

export async function setInformeEstado(id, activo) {
  await db.query('CALL empl_setInformeEstado(?, ?)', [id, activo]);
}

export async function getInformeById(id) {
  const [results] = await db.query('CALL empl_getInformeById(?)', [id]);
  return results[0]?.[0] || null;
}

export async function listMetodologiaAdmin() {
  const [results] = await db.query('CALL empl_listMetodologiaAdmin()');
  return results[0];
}

export async function upsertMetodologia({ orden, titulo, descripcion }) {
  await db.query('CALL empl_upsertMetodologia(?, ?, ?)', [Number(orden), titulo, descripcion || null]);
}

export async function updateMetodologia(id, { titulo, descripcion }) {
  await db.query('CALL empl_updateMetodologia(?, ?, ?)', [id, titulo, descripcion || null]);
}

export async function getMetodologiaById(id) {
  const [results] = await db.query('CALL empl_getMetodologiaById(?)', [id]);
  return results[0]?.[0] || null;
}
