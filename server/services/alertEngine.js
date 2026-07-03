import db from '../db.js';
import { auditEvent } from './auditService.js';

//----------------TI-08 / TI-23 / TI-31----------------
// Motor de alertas por umbral: cada regla activa define una metrica, un
// operador y un valor umbral. evaluarReglas() calcula el valor actual de
// cada metrica y genera una alerta cuando se cruza el umbral, evitando
// duplicados si ya existe una alerta sin atender de la misma regla en las
// ultimas 6 horas.
export const METRICAS_DISPONIBLES = [
  { key: 'pct_riesgo_curricular', label: '% elementos curriculares en riesgo/critico' },
  { key: 'senales_nuevas_7d',     label: 'Señales publicadas en los ultimos 7 dias' },
  { key: 'tendencias_nuevas_7d',  label: 'Tendencias publicadas en los ultimos 7 dias' },
  { key: 'escenarios_nuevos_7d',  label: 'Escenarios publicados en los ultimos 7 dias' },
  { key: 'logins_fallidos_24h',   label: 'Inicios de sesion fallidos/bloqueados en 24h' },
];

async function medirMetrica(metrica) {
  switch (metrica) {
    case 'pct_riesgo_curricular': {
      const [[row]] = await db.query(`
        SELECT
          SUM(CASE WHEN ac.estado_alineacion IN ('critico','riesgo') THEN 1 ELSE 0 END) AS en_riesgo,
          COUNT(c.id_curso) AS total
        FROM curso c
        JOIN malla_version mv ON mv.id_malla = c.id_malla AND mv.es_vigente = 1
        LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
      `);
      const total = Number(row?.total) || 0;
      const enRiesgo = Number(row?.en_riesgo) || 0;
      return total ? Math.round((enRiesgo / total) * 100) : 0;
    }
    case 'senales_nuevas_7d': {
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS total FROM senal WHERE id_estado = 1 AND fecha_publicacion >= NOW() - INTERVAL 7 DAY`
      );
      return Number(row?.total) || 0;
    }
    case 'tendencias_nuevas_7d': {
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS total FROM tendencia WHERE id_estado = 1 AND fecha_publicacion >= NOW() - INTERVAL 7 DAY`
      );
      return Number(row?.total) || 0;
    }
    case 'escenarios_nuevos_7d': {
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS total FROM escenario WHERE id_estado = 1 AND fecha_publicacion >= NOW() - INTERVAL 7 DAY`
      );
      return Number(row?.total) || 0;
    }
    case 'logins_fallidos_24h': {
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS total FROM actividad_usuario
         WHERE evento IN ('login_fallido','login_bloqueado') AND fecha_hora >= NOW() - INTERVAL 24 HOUR`
      );
      return Number(row?.total) || 0;
    }
    default:
      return null;
  }
}

function cruzaUmbral(valor, operador, umbral) {
  switch (operador) {
    case '>=': return valor >= umbral;
    case '>':  return valor > umbral;
    case '<=': return valor <= umbral;
    case '<':  return valor < umbral;
    default:   return false;
  }
}

export async function evaluarReglas() {
  const [reglas] = await db.query('SELECT * FROM regla_alerta WHERE activa = 1');
  const generadas = [];

  for (const regla of reglas) {
    const valor = await medirMetrica(regla.metrica);
    if (valor === null) continue;
    const umbral = Number(regla.valor_umbral);
    if (!cruzaUmbral(valor, regla.operador, umbral)) continue;

    const [[reciente]] = await db.query(
      `SELECT id_alerta FROM alerta_generada
       WHERE id_regla = ? AND atendida = 0 AND fecha_generada >= NOW() - INTERVAL 6 HOUR
       LIMIT 1`,
      [regla.id_regla]
    );
    if (reciente) continue;

    const metricaLabel = METRICAS_DISPONIBLES.find(m => m.key === regla.metrica)?.label || regla.metrica;
    const mensaje = `${regla.nombre}: ${metricaLabel} = ${valor} (umbral ${regla.operador} ${umbral})`;

    const [result] = await db.query(
      `INSERT INTO alerta_generada (id_regla, metrica, valor_medido, valor_umbral, mensaje)
       VALUES (?, ?, ?, ?, ?)`,
      [regla.id_regla, regla.metrica, valor, umbral, mensaje]
    );

    await auditEvent(null, {
      evento: 'alerta_generada',
      accion: 'evaluar_regla_alerta',
      modulo: 'alertas',
      entidad: 'regla_alerta',
      entidadId: regla.id_regla,
      elementoTitulo: regla.nombre,
      detalle: mensaje,
      metadata: { metrica: regla.metrica, valor, umbral, operador: regla.operador },
    });

    generadas.push({ id: result.insertId, mensaje });
  }

  return generadas;
}
