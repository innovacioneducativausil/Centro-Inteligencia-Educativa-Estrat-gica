import { analizarImpacto } from './motorImpactoCurricularService.js';
import { analizarMapaCurricular } from './analisisCurricularService.js';
import logger from '../logger.js';

/**
 * Corridas de los motores curriculares en segundo plano.
 *
 * Una corrida completa recorre todos los cursos de la malla con una pausa entre
 * llamadas al LLM y tarda varios minutos: como UNA peticion HTTP se cortaba
 * (proxy de Vercel, timeouts) y el usuario veia "Failed to fetch" aunque el
 * servidor siguiera trabajando. Aqui la corrida se lanza y la peticion responde
 * al instante; la pantalla consulta el avance con estadoJob*().
 *
 * Hay tres tipos de trabajo: motor de impacto (Plan de accion), mapa de estados
 * de Vision 360 y un lote que corre el mapa de varias carreras una tras otra.
 *
 * El registro vive en memoria: si el servidor se reinicia a mitad de corrida el
 * job se pierde (estado 'sin_corrida') y hay que relanzar.
 */
const jobs = new Map();
const keyOf = (idCarrera, idMalla) => `${Number(idCarrera)}:${Number(idMalla)}`;

function snapshot(job) {
  const p = job.progreso;
  return {
    estado: job.estado,
    inicio: job.inicio,
    fin: job.fin,
    usuario: job.usuario,
    progreso: {
      total: p.total ?? 0,
      procesados: p.procesados ?? 0,
      actual: p.actual ?? null,
      resumen: p.resumen ? { ...p.resumen } : null,
      sub: p.sub ? { total: p.sub.total ?? 0, procesados: p.sub.procesados ?? 0, actual: p.sub.actual ?? null } : null,
    },
    resultado: job.resultado,
    error: job.error,
  };
}

function iniciarGenerico(clave, usuario, ejecutar) {
  const actual = jobs.get(clave);
  if (actual?.estado === 'corriendo') return { iniciado: false, job: snapshot(actual) };

  const job = {
    estado: 'corriendo',
    inicio: new Date().toISOString(),
    fin: null,
    usuario,
    progreso: { total: 0, procesados: 0, actual: null, resumen: null, sub: null },
    resultado: null,
    error: null,
  };
  jobs.set(clave, job);

  ejecutar(job.progreso)
    .then(result => {
      job.fin = new Date().toISOString();
      if (result.ok) { job.estado = 'terminado'; job.resultado = result; }
      else { job.estado = 'error'; job.error = result.error; }
    })
    .catch(err => {
      job.fin = new Date().toISOString();
      job.estado = 'error';
      job.error = err.message;
      logger.error(`Corrida curricular fallo (${clave}): ${err.message}`, { context: 'JOBS_CURRICULARES' });
    });

  return { iniciado: true, job: snapshot(job) };
}

function estadoGenerico(clave) {
  const job = jobs.get(clave);
  return job ? snapshot(job) : { estado: 'sin_corrida' };
}

// ---- Motor de impacto (Plan de accion) ----
export const iniciarJob = (idCarrera, idMalla, pesos, usuario) =>
  iniciarGenerico(`impacto:${keyOf(idCarrera, idMalla)}`, usuario,
    p => analizarImpacto(Number(idCarrera), Number(idMalla), pesos ?? {}, usuario, p));
export const estadoJob = (idCarrera, idMalla) => estadoGenerico(`impacto:${keyOf(idCarrera, idMalla)}`);

// ---- Mapa de estados de Vision 360 (una carrera) ----
export const iniciarJobMapa = (idCarrera, idMalla, usuario, opciones = {}) =>
  iniciarGenerico(`mapa:${keyOf(idCarrera, idMalla)}`, usuario,
    p => analizarMapaCurricular(Number(idCarrera), Number(idMalla), p, { evidenciaGeneral: !!opciones.evidenciaGeneral }));
export const estadoJobMapa = (idCarrera, idMalla) => estadoGenerico(`mapa:${keyOf(idCarrera, idMalla)}`);

// ---- Lote: el mapa de varias carreras, una tras otra ----
async function ejecutarLote(items, progress, opciones = {}) {
  const detalle = [];
  progress.total = items.length;
  progress.procesados = 0;
  progress.resumen = { carreras: detalle };
  let resultado = null;
  let fallo = null;

  try {
    for (const [i, it] of items.entries()) {
      progress.procesados = i;
      progress.actual = it.carrera || `carrera ${it.id_carrera}`;
      progress.sub = {};
      try {
        const r = await analizarMapaCurricular(Number(it.id_carrera), Number(it.id_malla), progress.sub, {
          evidenciaGeneral: !!(it.evidencia_general ?? opciones.evidenciaGeneral),
          soloPendientes: !!(it.solo_pendientes ?? opciones.soloPendientes),
          analizadosDesde: (it.desde ?? opciones.analizadosDesde) ? new Date(it.desde ?? opciones.analizadosDesde) : null,
        });
        detalle.push(r.ok
          ? { carrera: progress.actual, ok: true, total: r.total, analizados: r.analizados, omitidos: r.omitidos, errores: r.errores, ya_analizados: r.ya_analizados || 0, con_evidencia_general: r.con_evidencia_general || 0 }
          : { carrera: progress.actual, ok: false, error: r.error });
      } catch (err) {
        detalle.push({ carrera: progress.actual, ok: false, error: err.message });
        logger.error(`Lote de mapa: fallo ${progress.actual}: ${err.message}`, { context: 'JOBS_CURRICULARES' });
      }
      await opciones.onCarrera?.(detalle).catch?.(() => {});
    }

    progress.procesados = items.length;
    progress.actual = null;
    progress.sub = null;
    resultado = { ok: true, carreras: detalle.length, detalle };
    return resultado;
  } catch (err) {
    fallo = err;
    throw err;
  } finally {
    try { await opciones.onFin?.(resultado, fallo, detalle); } catch { /* el aviso final no debe romper la corrida */ }
  }
}

export const iniciarJobLote = (items, usuario, opciones = {}) => iniciarGenerico('lote-mapa', usuario, p => ejecutarLote(items, p, opciones));
export const estadoJobLote = () => estadoGenerico('lote-mapa');
