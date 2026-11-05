import { analizarImpacto } from './motorImpactoCurricularService.js';
import logger from '../logger.js';

/**
 * Corridas del motor de impacto curricular en segundo plano.
 *
 * Una corrida completa recorre todos los cursos de la malla con una pausa entre
 * llamadas al LLM y tarda varios minutos: como UNA peticion HTTP se cortaba
 * (proxy de Vercel, timeouts) y el usuario veia "Failed to fetch" aunque el
 * servidor siguiera trabajando. Aqui la corrida se lanza y la peticion responde
 * al instante; la pantalla consulta el avance con estadoJob().
 *
 * El registro vive en memoria: si el servidor se reinicia a mitad de corrida el
 * job se pierde (estado 'sin_corrida') y hay que relanzar.
 */
const jobs = new Map();
const keyOf = (idCarrera, idMalla) => `${Number(idCarrera)}:${Number(idMalla)}`;

function snapshot(job) {
  return {
    estado: job.estado,
    inicio: job.inicio,
    fin: job.fin,
    usuario: job.usuario,
    progreso: {
      total: job.progreso.total ?? 0,
      procesados: job.progreso.procesados ?? 0,
      actual: job.progreso.actual ?? null,
      resumen: job.progreso.resumen ? { ...job.progreso.resumen } : null,
    },
    resultado: job.resultado,
    error: job.error,
  };
}

export function iniciarJob(idCarrera, idMalla, pesos, usuario) {
  const key = keyOf(idCarrera, idMalla);
  const actual = jobs.get(key);
  if (actual?.estado === 'corriendo') return { iniciado: false, job: snapshot(actual) };

  const job = {
    estado: 'corriendo',
    inicio: new Date().toISOString(),
    fin: null,
    usuario,
    progreso: { total: 0, procesados: 0, actual: null, resumen: null },
    resultado: null,
    error: null,
  };
  jobs.set(key, job);

  analizarImpacto(Number(idCarrera), Number(idMalla), pesos ?? {}, usuario, job.progreso)
    .then(result => {
      job.fin = new Date().toISOString();
      if (result.ok) { job.estado = 'terminado'; job.resultado = result; }
      else { job.estado = 'error'; job.error = result.error; }
    })
    .catch(err => {
      job.fin = new Date().toISOString();
      job.estado = 'error';
      job.error = err.message;
      logger.error(`Corrida de impacto curricular fallo (${key}): ${err.message}`, { context: 'IMPACTO_CURRICULAR' });
    });

  return { iniciado: true, job: snapshot(job) };
}

export function estadoJob(idCarrera, idMalla) {
  const job = jobs.get(keyOf(idCarrera, idMalla));
  return job ? snapshot(job) : { estado: 'sin_corrida' };
}
