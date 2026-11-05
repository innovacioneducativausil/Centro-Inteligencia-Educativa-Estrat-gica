

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Clave de servicio para automatizar las corridas curriculares SIN iniciar sesion
 * (curl, PowerShell, tareas programadas): header `x-service-token` igual a la
 * variable de entorno CORRIDAS_SERVICE_TOKEN.
 *
 * - Desactivada si la variable no esta definida o tiene menos de 32 caracteres.
 * - Solo vale para las rutas de esta lista (programar/lanzar/consultar corridas), no
 *   para el resto de la API, y se compara en tiempo constante.
 * - Una sesion normal (JWT) sigue funcionando igual; esto solo es una via adicional.
 */
const SERVICE_TOKEN_PATHS = [
  '/api/curricular/programar-corrida',
  '/api/curricular/corridas-programadas',
  '/api/curricular/estado-carreras',
  '/api/curricular/ranking-evidencia',
  '/api/curricular/diagnostico-llm',
  '/api/curricular/analizar-mapa-async',
  '/api/curricular/analizar-mapa-estado',
  '/api/curricular/analizar-mapa-lote',
];

function tokensIguales(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function requireAuth(req, res, next) {
  const serviceToken = req.headers['x-service-token'];
  if (serviceToken) {
    const esperado = process.env.CORRIDAS_SERVICE_TOKEN;
    const ruta = req.originalUrl.split('?')[0];
    const rutaPermitida = SERVICE_TOKEN_PATHS.some(p => ruta === p || ruta.startsWith(`${p}/`));
    if (!esperado || esperado.length < 32 || !tokensIguales(serviceToken, esperado)) {
      return res.status(401).json({ error: 'Token de servicio invalido.' });
    }
    if (!rutaPermitida) {
      return res.status(403).json({ error: 'El token de servicio no permite esta ruta.' });
    }
    req.user = { id: 'servicio', id_usuario: 'servicio', nombre: 'Servicio', correo: 'servicio@ciee.local', rol: 'admin', esServicio: true };
    return next();
  }

  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.radar_token;

  if ((!authHeader || !authHeader.startsWith('Bearer ')) && !cookieToken) {
    return res.status(401).json({
      error: 'Acceso no autorizado. Se requiere token de autenticacion.',
    });
  }

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : cookieToken;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Sesion expirada. Inicia sesion de nuevo.'
      : 'Token invalido.';
    return res.status(401).json({ error: message });
  }
}
