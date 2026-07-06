import db from '../db.js';
import dbCurricular from '../db_curricular.js';
import { auditEvent } from './auditService.js';

//----------------TI-08 / TI-23 / TI-31----------------
// Motor de alertas por umbral: cada regla activa define una metrica, un
// operador y un valor umbral. evaluarReglas() calcula el valor actual de
// cada metrica y genera una alerta cuando se cruza el umbral, evitando
// duplicados si ya existe una alerta sin atender de la misma regla en las
// ultimas 6 horas. Cada medicion (dispare o no una alerta) queda registrada
// en alerta_metrica_historial para poder graficar la tendencia de la metrica.
export const METRICAS_DISPONIBLES = [
  { key: 'pct_riesgo_curricular', label: '% elementos curriculares en riesgo/critico' },
  { key: 'senales_nuevas_7d',     label: 'Señales publicadas en los ultimos 7 dias' },
  { key: 'tendencias_nuevas_7d',  label: 'Tendencias publicadas en los ultimos 7 dias' },
  { key: 'escenarios_nuevos_7d',  label: 'Escenarios publicados en los ultimos 7 dias' },
  { key: 'logins_fallidos_24h',   label: 'Inicios de sesion fallidos/bloqueados en 24h' },
];

const MAX_ELEMENTOS = 8;

function primeraUrl(raw) {
  if (!raw) return null;
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try { return JSON.parse(raw).filter(Boolean)[0] || null; } catch { return null; }
  }
  return raw;
}

// Devuelve { valor, elementos } donde elementos son los items concretos que
// componen la medicion (para enlazar desde la alerta a su origen).
async function medirMetrica(metrica) {
  switch (metrica) {
    case 'pct_riesgo_curricular': {
      const [rows] = await dbCurricular.query(`
        SELECT c.nombre_curso, ac.estado_alineacion
        FROM curso c
        JOIN malla_version mv ON mv.id_malla = c.id_malla AND mv.es_vigente = 1
        LEFT JOIN analisis_curso ac ON ac.id_curso = c.id_curso
      `);
      const total = rows.length;
      const enRiesgo = rows.filter(r => ['critico', 'riesgo'].includes(r.estado_alineacion));
      const valor = total ? Math.round((enRiesgo.length / total) * 100) : 0;
      const elementos = enRiesgo.slice(0, MAX_ELEMENTOS).map(r => ({
        titulo: r.nombre_curso,
        detalle: r.estado_alineacion,
      }));
      return { valor, elementos };
    }
    case 'senales_nuevas_7d': {
      const [rows] = await db.query(
        `SELECT titulo_senal AS titulo, url_fuente FROM senal
         WHERE id_estado = 1 AND fecha_publicacion >= NOW() - INTERVAL 7 DAY
         ORDER BY fecha_publicacion DESC`
      );
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({ titulo: r.titulo, url: primeraUrl(r.url_fuente) })),
      };
    }
    case 'tendencias_nuevas_7d': {
      const [rows] = await db.query(
        `SELECT titulo_tendencia AS titulo, url_fuente FROM tendencia
         WHERE id_estado = 1 AND fecha_publicacion >= NOW() - INTERVAL 7 DAY
         ORDER BY fecha_publicacion DESC`
      );
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({ titulo: r.titulo, url: primeraUrl(r.url_fuente) })),
      };
    }
    case 'escenarios_nuevos_7d': {
      const [rows] = await db.query(
        `SELECT titulo_escenario AS titulo, url_fuente FROM escenario
         WHERE id_estado = 1 AND fecha_publicacion >= NOW() - INTERVAL 7 DAY
         ORDER BY fecha_publicacion DESC`
      );
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({ titulo: r.titulo, url: primeraUrl(r.url_fuente) })),
      };
    }
    case 'logins_fallidos_24h': {
      const [rows] = await db.query(
        `SELECT correo, evento, fecha_hora FROM actividad_usuario
         WHERE evento IN ('login_fallido','login_bloqueado') AND fecha_hora >= NOW() - INTERVAL 24 HOUR
         ORDER BY fecha_hora DESC`
      );
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({
          titulo: r.correo || 'Desconocido',
          detalle: `${r.evento} · ${new Date(r.fecha_hora).toLocaleString('es-PE')}`,
        })),
      };
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
  const metricasMedidas = new Set();

  for (const regla of reglas) {
    const medicion = await medirMetrica(regla.metrica);
    if (medicion === null) continue;
    const { valor, elementos } = medicion;

    if (!metricasMedidas.has(regla.metrica)) {
      metricasMedidas.add(regla.metrica);
      await db.query(
        `INSERT INTO alerta_metrica_historial (metrica, valor) VALUES (?, ?)`,
        [regla.metrica, valor]
      );
    }

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
      `INSERT INTO alerta_generada (id_regla, metrica, valor_medido, valor_umbral, mensaje, elementos_afectados)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [regla.id_regla, regla.metrica, valor, umbral, mensaje, elementos.length ? JSON.stringify(elementos) : null]
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

//----------------TI-08 / TI-23 / TI-31----------------
export async function obtenerHistorialMetrica(metrica, dias) {
  const [rows] = await db.query(
    `SELECT valor, fecha_medicion FROM alerta_metrica_historial
     WHERE metrica = ? AND fecha_medicion >= NOW() - INTERVAL ? DAY
     ORDER BY fecha_medicion ASC`,
    [metrica, dias]
  );
  return rows.map(r => ({ valor: Number(r.valor), fecha: r.fecha_medicion }));
}
