import db from '../../db.js';

export async function getSatisfaccion(anio, facultad, carrera, programa, ciclo) {
  const [results] = await db.query('CALL empl_getSatisfaccion(?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null,
  ]);
  return results[0];
}

export async function getNivelPuesto(anio, facultad, carrera, programa, ciclo) {
  const [results] = await db.query('CALL empl_getNivelPuesto(?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null,
  ]);
  return results[0];
}

export async function getFiltros(anio, facultad, carrera, programa, ciclo) {
  const [results] = await db.query('CALL empl_getFiltrosEgresados(?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null,
  ]);
  return {
    años:      results[0],
    facultades: results[1],
    carreras:  results[2],
    programas: results[3],
    ciclos:    results[4],
  };
}

export async function countEgresados(anio, facultad, carrera, programa, ciclo, q) {
  const [results] = await db.query('CALL empl_countEgresados(?, ?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null, q || null,
  ]);
  return Number(results[0][0].total);
}

export async function listEgresados(anio, facultad, carrera, programa, ciclo, q, limit, offset) {
  const [results] = await db.query('CALL empl_listEgresados(?, ?, ?, ?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null,
    q || null, limit, offset,
  ]);
  return results[0];
}

export async function getStatsTab(anio, facultad, carrera, programa, ciclo, tipo) {
  const [results] = await db.query('CALL empl_getStatsTab(?, ?, ?, ?, ?, ?)', [
    anio || null, facultad || null, carrera || null, programa || null, ciclo || null, tipo || null,
  ]);
  return results.slice(0, 9).map(rs => rs || []);
}

export async function getInformes(anio, unidad, facultad) {
  const [results] = await db.query('CALL empl_getInformes(?, ?, ?)', [
    anio || null, unidad || null, facultad || null,
  ]);
  return { rows: results[0], años: results[1], unidades: results[2], facultades: results[3] };
}

export async function createInforme({ nombre, anio, unidad, facultad, urlDescarga, tipo }) {
  const [results] = await db.query('CALL empl_createInforme(?, ?, ?, ?, ?, ?)', [
    nombre, Number(anio), unidad, facultad || null, urlDescarga || null, tipo,
  ]);
  return results[0][0].id;
}

export async function updateInforme(id, { nombre, anio, unidad, facultad, urlDescarga, tipo }) {
  await db.query('CALL empl_updateInforme(?, ?, ?, ?, ?, ?, ?)', [
    id, nombre, Number(anio), unidad, facultad || null, urlDescarga || null, tipo,
  ]);
}

export async function setInformeEstado(id, activo) {
  await db.query('CALL empl_setInformeEmplEstado(?, ?)', [id, activo]);
}

export async function getInformeById(id) {
  const [results] = await db.query('CALL empl_getInformeEmplById(?)', [id]);
  return results[0]?.[0] || null;
}

export async function listInformesAdmin() {
  const [results] = await db.query('CALL empl_listInformesEmplAdmin()');
  return results[0];
}
