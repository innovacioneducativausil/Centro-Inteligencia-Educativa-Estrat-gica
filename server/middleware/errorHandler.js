


import { auditEvent } from '../services/auditService.js';
import logger from '../logger.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

export function serverError(res, err, context = '') {
  logger.error(err?.message || 'Error interno del servidor.', {
    context: context || undefined,
    stack: err?.stack,
  });
  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}

//----------------TI-35 / TI-45----------------
export function globalErrorHandler(err, req, res, _next) {
  logger.error(err?.message || 'Error no controlado.', {
    context: 'UNHANDLED ERROR',
    stack: err?.stack,
    metodo: req?.method,
    ruta: req?.originalUrl,
  });

  auditEvent(req, {
    evento: 'error_servidor',
    accion: 'error_no_controlado',
    modulo: req?.path?.split('/')[2] || 'api',
    detalle: `${req?.method || 'UNKNOWN'} ${req?.originalUrl || '/'} — ${err?.message || 'Error desconocido'}`,
    metadata: {
      stack: IS_DEV ? err?.stack : undefined,
      statusCode: 500,
      metodo: req?.method,
      ruta: req?.originalUrl,
    },
  }).catch(() => {});

  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}
