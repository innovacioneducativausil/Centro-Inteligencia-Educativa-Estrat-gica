import { curricularPrisma, radarPrisma } from '../prismaClient.js';
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
  if (Array.isArray(raw)) return raw.filter(Boolean)[0] || null;
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try { return JSON.parse(raw).filter(Boolean)[0] || null; } catch { return null; }
  }
  return raw;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function hoursAgo(hours) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
}

// Devuelve { valor, elementos } donde elementos son los items concretos que
// componen la medicion (para enlazar desde la alerta a su origen).
async function medirMetrica(metrica) {
  switch (metrica) {
    case 'pct_riesgo_curricular': {
      const rows = await curricularPrisma.curso.findMany({
        where: { malla_version: { es_vigente: true } },
        select: {
          nombre_curso: true,
          analisis_curso: {
            orderBy: { analizado_en: 'desc' },
            take: 1,
            select: { estado_alineacion: true },
          },
        },
      });
      const total = rows.length;
      const enRiesgo = rows
        .map(r => ({ nombre_curso: r.nombre_curso, estado_alineacion: r.analisis_curso[0]?.estado_alineacion || null }))
        .filter(r => ['critico', 'riesgo'].includes(r.estado_alineacion));
      const valor = total ? Math.round((enRiesgo.length / total) * 100) : 0;
      const elementos = enRiesgo.slice(0, MAX_ELEMENTOS).map(r => ({
        titulo: r.nombre_curso,
        detalle: r.estado_alineacion,
      }));
      return { valor, elementos };
    }
    case 'senales_nuevas_7d': {
      const rows = await radarPrisma.senal.findMany({
        where: { id_estado: 1, fecha_publicacion: { gte: daysAgo(7) } },
        orderBy: { fecha_publicacion: 'desc' },
        select: { titulo_senal: true, url_fuente: true },
      });
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({ titulo: r.titulo_senal, url: primeraUrl(r.url_fuente) })),
      };
    }
    case 'tendencias_nuevas_7d': {
      const rows = await radarPrisma.tendencia.findMany({
        where: { id_estado: 1, fecha_publicacion: { gte: daysAgo(7) } },
        orderBy: { fecha_publicacion: 'desc' },
        select: { titulo_tendencia: true, url_fuente: true },
      });
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({ titulo: r.titulo_tendencia, url: primeraUrl(r.url_fuente) })),
      };
    }
    case 'escenarios_nuevos_7d': {
      const rows = await radarPrisma.escenario.findMany({
        where: { id_estado: 1, fecha_publicacion: { gte: daysAgo(7) } },
        orderBy: { fecha_publicacion: 'desc' },
        select: { titulo_escenario: true, url_fuente: true },
      });
      return {
        valor: rows.length,
        elementos: rows.slice(0, MAX_ELEMENTOS).map(r => ({ titulo: r.titulo_escenario, url: primeraUrl(r.url_fuente) })),
      };
    }
    case 'logins_fallidos_24h': {
      const rows = await radarPrisma.actividad_usuario.findMany({
        where: {
          evento: { in: ['login_fallido', 'login_bloqueado'] },
          fecha_hora: { gte: hoursAgo(24) },
        },
        orderBy: { fecha_hora: 'desc' },
        select: { correo: true, evento: true, fecha_hora: true },
      });
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
  const reglas = await radarPrisma.regla_alerta.findMany({ where: { activa: true } });
  const generadas = [];
  const metricasMedidas = new Set();

  for (const regla of reglas) {
    const medicion = await medirMetrica(regla.metrica);
    if (medicion === null) continue;
    const { valor, elementos } = medicion;

    if (!metricasMedidas.has(regla.metrica)) {
      metricasMedidas.add(regla.metrica);
      await radarPrisma.alerta_metrica_historial.create({
        data: { metrica: regla.metrica, valor },
      });
    }

    const umbral = Number(regla.valor_umbral);
    if (!cruzaUmbral(valor, regla.operador, umbral)) continue;

    const reciente = await radarPrisma.alerta_generada.findFirst({
      where: {
        id_regla: regla.id_regla,
        atendida: false,
        fecha_generada: { gte: hoursAgo(6) },
      },
      select: { id_alerta: true },
    });
    if (reciente) continue;

    const metricaLabel = METRICAS_DISPONIBLES.find(m => m.key === regla.metrica)?.label || regla.metrica;
    const mensaje = `${regla.nombre}: ${metricaLabel} = ${valor} (umbral ${regla.operador} ${umbral})`;

    const alerta = await radarPrisma.alerta_generada.create({
      data: {
        id_regla: regla.id_regla,
        metrica: regla.metrica,
        valor_medido: valor,
        valor_umbral: umbral,
        mensaje,
        elementos_afectados: elementos.length ? elementos : null,
      },
      select: { id_alerta: true },
    });

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

    generadas.push({ id: Number(alerta.id_alerta), mensaje });
  }

  return generadas;
}

//----------------TI-08 / TI-23 / TI-31----------------
export async function obtenerHistorialMetrica(metrica, dias) {
  const rows = await radarPrisma.alerta_metrica_historial.findMany({
    where: {
      metrica,
      fecha_medicion: { gte: daysAgo(Number(dias) || 30) },
    },
    orderBy: { fecha_medicion: 'asc' },
    select: { valor: true, fecha_medicion: true },
  });
  return rows.map(r => ({ valor: Number(r.valor), fecha: r.fecha_medicion }));
}
