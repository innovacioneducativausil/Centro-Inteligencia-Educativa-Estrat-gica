export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere un rol autorizado.' });
    }
    next();
  };
}

export const adminOnly     = requireRole('admin');
export const adminOrAnalyst = adminOnly;

// Gate adicional sobre adminOnly: no todo admin debe ver esto, solo los correos listados.
export function requireSpecificAdmins(...correos) {
  const whitelist = new Set(correos.map(c => c.toLowerCase()));
  return (req, res, next) => {
    if (!req.user || req.user.rol !== 'admin' || !whitelist.has((req.user.correo || '').toLowerCase())) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere un rol autorizado.' });
    }
    next();
  };
}
