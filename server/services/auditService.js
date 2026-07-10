import logger from '../logger.js';
import { radarPrisma } from '../prismaClient.js';

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
    await radarPrisma.actividad_usuario.create({
      data: {
        id_usuario: idUsuario || user.id || null,
        correo: correo || user.correo || null,
        rol: rol || user.rol || null,
        evento: String(evento).slice(0, 100),
        accion: accion ? String(accion).slice(0, 100) : null,
        modulo: modulo ? String(modulo).slice(0, 100) : null,
        entidad: entidad ? String(entidad).slice(0, 100) : null,
        entidad_id: entidadId ? String(entidadId).slice(0, 100) : null,
        elemento_uuid: entidadId ? String(entidadId).slice(0, 36) : null,
        elemento_tipo: elementoTipo ? String(elementoTipo).slice(0, 50) : entidad,
        elemento_titulo: elementoTitulo ? String(elementoTitulo).slice(0, 500) : null,
        detalle: detalle ? String(detalle).slice(0, 1000) : null,
        ip: ip ? ip.slice(0, 45) : null,
        user_agent: userAgent ? userAgent.slice(0, 512) : null,
        metadata: metadata || undefined,
      },
    });
  } catch (err) {
    logger.warn(err?.message || 'No se pudo registrar evento de auditoria.', {
      context: 'AUDIT',
      stack: err?.stack,
      evento,
    });
  }
}
