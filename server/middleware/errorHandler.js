


const IS_DEV = process.env.NODE_ENV !== 'production';


export function serverError(res, err, context = '') {
  console.error(`[ERROR${context ? ' ' + context : ''}]`, err);
  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}


export function globalErrorHandler(err, _req, res, _next) {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    error: IS_DEV ? err.message : 'Error interno del servidor.',
  });
}
