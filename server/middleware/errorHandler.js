


import { auditEvent } from '../services/auditService.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

export function serverError(res, err, context = '') {
  console.error(`[ERROR${context ? ' ' + context : ''}]`, err);
  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}

//----------------TI-35 / TI-45----------------
export function globalErrorHandler(err, req, res, _next) {
  console.error('[UNHANDLED ERROR]', err);

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
