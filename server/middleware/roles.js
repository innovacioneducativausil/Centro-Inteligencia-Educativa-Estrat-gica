export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere un rol autorizado.' });
    }
    next();
  };
}

export const adminOnly = requireRole('admin');
