// server/middleware/auth.js
// Middleware JWT para proteger rutas de la API.
import jwt from 'jsonwebtoken';

/**
 * Verifica JWT por cookie httpOnly o por Authorization Bearer.
 * Bearer se mantiene como compatibilidad para clientes existentes.
 */
export function requireAuth(req, res, next) {
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
