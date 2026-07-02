import { auditEvent } from '../services/auditService.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /(password|pass|token|secret|otp|key|hash|jwt|cookie|authorization)/i;

function maskSensitive(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(maskSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).slice(0, 60).map(([key, val]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTADO]' : maskSensitive(val),
    ])
  );
}

function moduleFromPath(path = '') {
  const clean = path.replace(/^\/api\/?/, '').replace(/^\/+/, '');
  const first = clean.split('/')[0] || 'api';
  if (clean.startsWith('admin/usuarios')) return 'gestion_usuarios';
  if (first === 'admin') return 'gestion';
  if (first === 'auth') return 'auth';
  if (first === 'mercado-laboral') return 'mercadoLaboral';
  if (first === 'cadena-causal') return 'radar';
  if (first === 'importar' || first === 'import') return 'gestion';
  return first;
}

function entityFromPath(path = '') {
  const segments = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (!segments.length) return 'api';
  if (segments[0] === 'admin') return segments[1] || 'admin';
  if (segments[0] === 'mercado-laboral') return segments[1] || 'mercado-laboral';
  return segments[0];
}

function entityIdFromPath(path = '') {
  const segments = path.split('/').filter(Boolean);
  return [...segments].reverse().find(part => /^[a-z0-9-]{6,}$/i.test(part) || /^\d+$/.test(part)) || null;
}

function actionFromMethod(method) {
  return {
    POST: 'crear_ejecutar',
    PUT: 'actualizar',
    PATCH: 'modificar_estado',
    DELETE: 'eliminar_desactivar',
  }[method] || method.toLowerCase();
}

export function auditMutatingRequests(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (req.path.startsWith('/actividad')) return next();

  const startedAt = Date.now();
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    setImmediate(() => {
      if (req.auditLogged) return;
      const modulo = moduleFromPath(req.originalUrl);
      const entidad = entityFromPath(req.originalUrl);
      const entidadId = entityIdFromPath(req.originalUrl);
      auditEvent(req, {
        evento: 'api_mutacion',
        accion: actionFromMethod(req.method),
        modulo,
        entidad,
        entidadId,
        elementoTipo: entidad,
        elementoTitulo: entidadId || entidad,
        detalle: `${req.method} ${req.originalUrl}`,
        metadata: {
          metodo: req.method,
          ruta: req.originalUrl,
          estadoHttp: res.statusCode,
          duracionMs: Date.now() - startedAt,
          datos: maskSensitive(req.body || {}),
          query: maskSensitive(req.query || {}),
        },
      });
    });
  });

  next();
}
