
import { Router } from 'express';
import { serverError } from '../middleware/errorHandler.js';
import { auditEvent } from '../services/auditService.js';
import {
  getActividadAcciones,
  getActividadEventos,
  getActividadExportRows,
  getActividadModulos,
  getActividadPage,
  getActividadUsuariosActivos,
} from '../repositories/principal/actividadRepository.js';

const router = Router();

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  // Las columnas JSON (p.ej. metadata) llegan ya parseadas como objeto desde
  // mysql2; sin este caso String(value) las volvia "[object Object]" en el CSV.
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function actividadCsv(rows) {
  const headers = ['fecha_hora', 'correo', 'rol', 'evento', 'accion', 'modulo', 'entidad', 'entidad_id', 'elemento_tipo', 'elemento_titulo', 'detalle', 'ip', 'user_agent', 'metadata'];
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n');
}


router.post('/actividad', async (req, res) => {
  try {
    const { evento, accion, modulo, vista, elementoUuid, elementoTipo, elementoTitulo, detalle, metadata } = req.body;
    if (!evento || typeof evento !== 'string') {
      return res.status(400).json({ error: 'evento es requerido.' });
    }

    const auditMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...(vista ? { vista } : {}),
    };

    await auditEvent(req, {
      evento,
      accion: accion || evento,
      modulo,
      entidadId: elementoUuid,
      elementoTipo,
      elementoTitulo,
      detalle,
      metadata: Object.keys(auditMetadata).length ? auditMetadata : null,
    });

    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'POST /actividad');
  }
});


router.get('/actividad', adminOnly, async (req, res) => {
  try {
    const { rows, total, page, pages } = await getActividadPage(req.query);
    res.json({ data: rows, total, page, pages });
  } catch (err) {
    serverError(res, err, 'GET /actividad');
  }
});


router.get('/actividad/export', adminOnly, async (req, res) => {
  try {
    const rows = await getActividadExportRows(req.query);

    await auditEvent(req, {
      evento: 'auditoria_exportada',
      accion: 'exportar_auditoria',
      modulo: 'monitor',
      entidad: 'actividad_usuario',
      detalle: `Exportacion CSV de auditoria (${rows.length} registros)`,
      metadata: { filtros: req.query, total: rows.length },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + actividadCsv(rows));
  } catch (err) {
    serverError(res, err, 'GET /actividad/export');
  }
});


router.get('/actividad/usuarios', adminOnly, async (req, res) => {
  try {
    const rows = await getActividadUsuariosActivos();
    res.json({ data: rows });
  } catch (err) {
    serverError(res, err, 'GET /actividad/usuarios');
  }
});


router.get('/actividad/eventos', adminOnly, async (req, res) => {
  try {
    res.json({ data: await getActividadEventos() });
  } catch (err) {
    serverError(res, err, 'GET /actividad/eventos');
  }
});

router.get('/actividad/acciones', adminOnly, async (req, res) => {
  try {
    res.json({ data: await getActividadAcciones() });
  } catch (err) {
    serverError(res, err, 'GET /actividad/acciones');
  }
});

router.get('/actividad/modulos', adminOnly, async (_req, res) => {
  try {
    res.json({ data: await getActividadModulos() });
  } catch (err) {
    serverError(res, err, 'GET /actividad/modulos');
  }
});

export default router;
