// server/middleware/errorHandler.js
// Manejo centralizado de errores — nunca expone detalles internos en producción

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Llama desde cualquier catch: serverError(res, err, '[contexto]')
 * En desarrollo muestra el mensaje real; en producción siempre es genérico.
 */
export function serverError(res, err, context = '') {
  console.error(`[ERROR${context ? ' ' + context : ''}]`, err);
  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}

/**
 * Middleware de Express para errores no capturados (usar al final de server.js).
 * Activa si alguna ruta llama next(err).
 */
export function globalErrorHandler(err, _req, res, _next) {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}
