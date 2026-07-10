import { Router } from 'express';
import { randomUUID } from 'crypto';
import { serverError } from '../middleware/errorHandler.js';
import { auditEvent } from '../services/auditService.js';
import { evaluarReglas, obtenerHistorialMetrica, METRICAS_DISPONIBLES } from '../services/alertEngine.js';
import {
  createReglaAlerta,
  deleteReglaAlerta,
  getAlertaGeneradaById,
  getAlertasGeneradas,
  getReglaAlertaById,
  getReglasAlerta,
  markAlertaAtendida,
  updateReglaAlerta,
} from '../repositories/principal/alertasRepository.js';

const router = Router();

//----------------TI-08 / TI-23 / TI-31----------------
function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
}

const OPERADORES = new Set(['>=', '>', '<=', '<']);
const METRICAS = new Set(METRICAS_DISPONIBLES.map(m => m.key));

router.get('/alertas/metricas', adminOnly, (_req, res) => {
  res.json({ data: METRICAS_DISPONIBLES });
});

//----------------TI-08 / TI-23 / TI-31----------------
router.get('/alertas/historial', adminOnly, async (req, res) => {
  try {
    const metrica = String(req.query.metrica || '').trim();
    const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 180);
    if (!METRICAS.has(metrica)) return res.status(400).json({ error: 'Metrica no valida.' });
    const data = await obtenerHistorialMetrica(metrica, dias);
    res.json({ data });
  } catch (err) {
    serverError(res, err, 'GET /alertas/historial');
  }
});

//----------------TI-08----------------
router.get('/alertas/reglas', adminOnly, async (_req, res) => {
  try {
    const rows = await getReglasAlerta();
    res.json({ data: rows });
  } catch (err) {
    serverError(res, err, 'GET /alertas/reglas');
  }
});

//----------------TI-08----------------
router.post('/alertas/reglas', adminOnly, async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const metrica = String(req.body.metrica || '').trim();
    const operador = String(req.body.operador || '').trim();
    const valorUmbral = Number(req.body.valorUmbral);

    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido.' });
    if (!METRICAS.has(metrica)) return res.status(400).json({ error: 'Metrica no valida.' });
    if (!OPERADORES.has(operador)) return res.status(400).json({ error: 'Operador no valido.' });
    if (!Number.isFinite(valorUmbral)) return res.status(400).json({ error: 'Valor umbral no valido.' });

    const id = randomUUID();
    const created = await createReglaAlerta({ id, nombre, metrica, operador, valorUmbral, creadoPor: req.user.id });

    await auditEvent(req, {
      evento: 'regla_alerta_creada',
      accion: 'crear_regla_alerta',
      modulo: 'alertas',
      entidad: 'regla_alerta',
      entidadId: id,
      elementoTitulo: nombre,
      detalle: `Regla creada: ${metrica} ${operador} ${valorUmbral}`,
      metadata: { metrica, operador, valorUmbral },
    });

    res.status(201).json({ data: created });
  } catch (err) {
    serverError(res, err, 'POST /alertas/reglas');
  }
});

//----------------TI-08----------------
router.put('/alertas/reglas/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getReglaAlertaById(id);
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada.' });

    const nombre = String(req.body.nombre ?? existing.nombre).trim();
    const operador = String(req.body.operador ?? existing.operador).trim();
    const valorUmbral = req.body.valorUmbral !== undefined ? Number(req.body.valorUmbral) : Number(existing.valor_umbral);
    const activa = req.body.activa !== undefined ? Boolean(req.body.activa) : Boolean(existing.activa);

    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido.' });
    if (!OPERADORES.has(operador)) return res.status(400).json({ error: 'Operador no valido.' });
    if (!Number.isFinite(valorUmbral)) return res.status(400).json({ error: 'Valor umbral no valido.' });

    const updated = await updateReglaAlerta(id, { nombre, operador, valorUmbral, activa });

    await auditEvent(req, {
      evento: 'regla_alerta_actualizada',
      accion: 'editar_regla_alerta',
      modulo: 'alertas',
      entidad: 'regla_alerta',
      entidadId: id,
      elementoTitulo: nombre,
      detalle: `Regla actualizada: ${operador} ${valorUmbral}, activa=${activa}`,
    });

    res.json({ data: updated });
  } catch (err) {
    serverError(res, err, 'PUT /alertas/reglas/:id');
  }
});

//----------------TI-08----------------
router.delete('/alertas/reglas/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getReglaAlertaById(id);
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada.' });

    await deleteReglaAlerta(id);

    await auditEvent(req, {
      evento: 'regla_alerta_eliminada',
      accion: 'eliminar_regla_alerta',
      modulo: 'alertas',
      entidad: 'regla_alerta',
      entidadId: id,
      elementoTitulo: existing.nombre,
      detalle: 'Regla de alerta eliminada',
    });

    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'DELETE /alertas/reglas/:id');
  }
});

//----------------TI-23 / TI-31----------------
router.get('/alertas/generadas', adminOnly, async (req, res) => {
  try {
    const soloPendientes = req.query.pendientes === '1';
    const rows = await getAlertasGeneradas({ soloPendientes });
    res.json({ data: rows });
  } catch (err) {
    serverError(res, err, 'GET /alertas/generadas');
  }
});

//----------------TI-23 / TI-31----------------
router.post('/alertas/generadas/:id/atender', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getAlertaGeneradaById(id);
    if (!existing) return res.status(404).json({ error: 'Alerta no encontrada.' });

    await markAlertaAtendida({ id, atendidaPor: req.user.id });

    await auditEvent(req, {
      evento: 'alerta_atendida',
      accion: 'atender_alerta',
      modulo: 'alertas',
      entidad: 'alerta_generada',
      entidadId: String(id),
      elementoTitulo: existing.mensaje,
      detalle: 'Alerta marcada como atendida',
    });

    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'POST /alertas/generadas/:id/atender');
  }
});

//----------------TI-08 / TI-23 / TI-31----------------
router.post('/alertas/evaluar', adminOnly, async (_req, res) => {
  try {
    const generadas = await evaluarReglas();
    res.json({ ok: true, generadas: generadas.length });
  } catch (err) {
    serverError(res, err, 'POST /alertas/evaluar');
  }
});

export default router;
