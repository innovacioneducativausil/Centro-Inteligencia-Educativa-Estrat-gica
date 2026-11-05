import dbCurricular from '../db_curricular.js';
import logger from '../logger.js';
import { iniciarJobLote, estadoJobLote } from './analisisImpactoJobs.js';

/**
 * Corridas programadas del mapa de estados (Vision 360).
 *
 * La cola vive en la tabla `corrida_programada` (no en memoria): Railway reinicia
 * el servidor en cada despliegue y una cola en memoria se perderia. Un planificador
 * revisa la tabla cada minuto y, cuando llega la hora, lanza el lote. Si el servidor
 * se reinicia a mitad de una corrida, esa corrida vuelve a 'pendiente' y se reanuda
 * saltando los cursos que ya tienen analisis (solo_pendientes), sin gastar tokens
 * dos veces. El proveedor de IA tiene tope diario: el motor espera solo cuando se
 * agota (ver llamarConEspera en analisisCurricularService.js).
 */
let schemaReady = null;
let corriendoAhora = false;
let planificadorActivo = false;

export function ensureCorridasSchema() {
  if (!schemaReady) {
    schemaReady = dbCurricular.query(`CREATE TABLE IF NOT EXISTS corrida_programada (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(30) NOT NULL DEFAULT 'mapa_lote',
      payload LONGTEXT NOT NULL,
      ejecutar_en DATETIME NOT NULL,
      estado ENUM('pendiente','corriendo','terminada','error','cancelada') NOT NULL DEFAULT 'pendiente',
      detalle LONGTEXT NULL,
      error TEXT NULL,
      creado_por VARCHAR(120) NULL,
      iniciada_en DATETIME NULL,
      terminada_en DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_cp_estado (estado, ejecutar_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

const toUtcSql = d => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const parseJson = v => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };

export async function programarCorrida({ items, ejecutarEn, evidenciaGeneral = false, soloPendientes = true, usuario = 'sistema' }) {
  await ensureCorridasSchema();
  const payload = { items, evidencia_general: !!evidenciaGeneral, solo_pendientes: !!soloPendientes };
  const [r] = await dbCurricular.query(
    'INSERT INTO corrida_programada (payload, ejecutar_en, creado_por) VALUES (?, ?, ?)',
    [JSON.stringify(payload), toUtcSql(ejecutarEn), String(usuario).slice(0, 120)]
  );
  return r.insertId;
}

export async function listarCorridas() {
  await ensureCorridasSchema();
  const [rows] = await dbCurricular.query(
    `SELECT id, tipo, payload, DATE_FORMAT(ejecutar_en, '%Y-%m-%dT%H:%i:%sZ') AS ejecutar_en_utc, estado, detalle, error, creado_por,
            DATE_FORMAT(iniciada_en, '%Y-%m-%dT%H:%i:%sZ') AS iniciada_en_utc,
            DATE_FORMAT(terminada_en, '%Y-%m-%dT%H:%i:%sZ') AS terminada_en_utc
     FROM corrida_programada ORDER BY id DESC LIMIT 30`
  );
  return rows.map(r => {
    const p = parseJson(r.payload) || {};
    return {
      id: r.id,
      estado: r.estado,
      ejecutar_en_utc: r.ejecutar_en_utc,
      iniciada_en_utc: r.iniciada_en_utc,
      terminada_en_utc: r.terminada_en_utc,
      creado_por: r.creado_por,
      carreras: (p.items || []).map(i => i.carrera || i.id_carrera),
      solo_pendientes: !!p.solo_pendientes,
      evidencia_general: !!p.evidencia_general,
      detalle: parseJson(r.detalle),
      error: r.error,
    };
  });
}

export async function cancelarCorrida(id) {
  await ensureCorridasSchema();
  const [r] = await dbCurricular.query("UPDATE corrida_programada SET estado='cancelada' WHERE id=? AND estado='pendiente'", [Number(id)]);
  return r.affectedRows > 0;
}

async function guardarDetalle(id, detalle) {
  await dbCurricular.query('UPDATE corrida_programada SET detalle=? WHERE id=?', [JSON.stringify(detalle), id]);
}

async function tick() {
  if (corriendoAhora) return;
  if (estadoJobLote().estado === 'corriendo') return;

  const [rows] = await dbCurricular.query(
    "SELECT id, payload FROM corrida_programada WHERE estado='pendiente' AND ejecutar_en <= UTC_TIMESTAMP() ORDER BY ejecutar_en, id LIMIT 1"
  );
  if (!rows.length) return;

  const { id } = rows[0];
  const payload = parseJson(rows[0].payload);
  if (!payload?.items?.length) {
    await dbCurricular.query("UPDATE corrida_programada SET estado='error', error='Corrida sin carreras', terminada_en=UTC_TIMESTAMP() WHERE id=?", [id]);
    return;
  }

  const [claim] = await dbCurricular.query(
    "UPDATE corrida_programada SET estado='corriendo', iniciada_en=UTC_TIMESTAMP(), error=NULL WHERE id=? AND estado='pendiente'", [id]
  );
  if (!claim.affectedRows) return;

  corriendoAhora = true;
  logger.info(`Corrida programada #${id} iniciada (${payload.items.length} carreras)`, { context: 'CORRIDAS_PROGRAMADAS' });

  const { iniciado } = iniciarJobLote(payload.items, 'programada', {
    evidenciaGeneral: !!payload.evidencia_general,
    soloPendientes: !!payload.solo_pendientes,
    onCarrera: detalle => guardarDetalle(id, detalle),
    onFin: async (resultado, fallo, detalle) => {
      corriendoAhora = false;
      await dbCurricular.query(
        'UPDATE corrida_programada SET estado=?, detalle=?, error=?, terminada_en=UTC_TIMESTAMP() WHERE id=?',
        [fallo ? 'error' : 'terminada', JSON.stringify(detalle || []), fallo ? String(fallo.message).slice(0, 500) : null, id]
      );
      logger.info(`Corrida programada #${id} ${fallo ? 'fallo' : 'terminada'}`, { context: 'CORRIDAS_PROGRAMADAS' });
    },
  });

  if (!iniciado) {
    corriendoAhora = false;
    await dbCurricular.query("UPDATE corrida_programada SET estado='pendiente' WHERE id=?", [id]);
  }
}

/** Corridas que quedaron 'corriendo' cuando el servidor se reinicio: se reanudan saltando lo ya analizado. */
async function recuperarInterrumpidas() {
  const [rows] = await dbCurricular.query("SELECT id, payload FROM corrida_programada WHERE estado='corriendo'");
  for (const r of rows) {
    const p = parseJson(r.payload) || {};
    p.solo_pendientes = true;
    await dbCurricular.query("UPDATE corrida_programada SET estado='pendiente', payload=? WHERE id=?", [JSON.stringify(p), r.id]);
    logger.info(`Corrida programada #${r.id} reanudada tras reinicio del servidor`, { context: 'CORRIDAS_PROGRAMADAS' });
  }
}

export async function iniciarPlanificador() {
  if (planificadorActivo) return;
  planificadorActivo = true;
  try {
    await ensureCorridasSchema();
    await recuperarInterrumpidas();
  } catch (err) {
    planificadorActivo = false;
    logger.error(`Planificador de corridas no pudo iniciar: ${err.message}`, { context: 'CORRIDAS_PROGRAMADAS' });
    return;
  }
  const revisar = () => tick().catch(err => logger.error(`Planificador: ${err.message}`, { context: 'CORRIDAS_PROGRAMADAS' }));
  setTimeout(revisar, 15000);
  setInterval(revisar, 60000);
  logger.info('Planificador de corridas programadas activo (revisa cada 60 s)', { context: 'CORRIDAS_PROGRAMADAS' });
}
