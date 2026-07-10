import db from '../db.js';
import logger from '../logger.js';

//----------------TI-44 / TI-59----------------
export function getClientIp(req) {
  return (req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '')
    .split(',')[0]
    .trim() || null;
}

//----------------TI-44 / TI-59 / TI-35----------------
// Punto unico de escritura del log de operacion (centralizado en una sola
// tabla, actividad_usuario); ver actividadMaintenance.js para la retencion.
export async function auditEvent(req, {
  evento,
  modulo = null,
  accion = null,
  entidad = null,
  entidadId = null,
  elementoTipo = null,
  elementoTitulo = null,
  detalle = null,
  metadata = null,
  idUsuario = null,
  correo = null,
  rol = null,
} = {}) {
  if (!evento) return;
  if (req) req.auditLogged = true;
  const user = req?.user || {};
  const ip = getClientIp(req);
  const userAgent = req?.headers?.['user-agent'] || null;

  try {
    await db.query(
      `INSERT INTO actividad_usuario
         (id_usuario, correo, rol, evento, accion, modulo, entidad, entidad_id,
          elemento_uuid, elemento_tipo, elemento_titulo, detalle, ip, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idUsuario || user.id || null,
        correo || user.correo || null,
        rol || user.rol || null,
        String(evento).slice(0, 100),
        accion ? String(accion).slice(0, 100) : null,
        modulo ? String(modulo).slice(0, 100) : null,
        entidad ? String(entidad).slice(0, 100) : null,
        entidadId ? String(entidadId).slice(0, 100) : null,
        entidadId ? String(entidadId).slice(0, 36) : null,
        elementoTipo ? String(elementoTipo).slice(0, 50) : entidad,
        elementoTitulo ? String(elementoTitulo).slice(0, 500) : null,
        detalle ? String(detalle).slice(0, 1000) : null,
        ip ? ip.slice(0, 45) : null,
        userAgent ? userAgent.slice(0, 512) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    logger.warn(err?.message || 'No se pudo registrar evento de auditoria.', {
      context: 'AUDIT',
      stack: err?.stack,
      evento,
    });
  }
}
