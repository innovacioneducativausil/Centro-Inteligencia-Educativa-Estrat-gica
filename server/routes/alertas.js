import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { auditEvent } from '../services/auditService.js';
import { evaluarReglas, METRICAS_DISPONIBLES } from '../services/alertEngine.js';

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

//----------------TI-08----------------
router.get('/alertas/reglas', adminOnly, async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM regla_alerta ORDER BY fecha_creacion DESC');
    res.json({ data: rows });
  } catch (err) {
    console.error('[GET /alertas/reglas]', err);
    res.status(500).json({ error: 'Error interno.' });
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
    await db.query(
      `INSERT INTO regla_alerta (id_regla, nombre, metrica, operador, valor_umbral, activa, creado_por)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [id, nombre, metrica, operador, valorUmbral, req.user.id]
    );

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

    const [[created]] = await db.query('SELECT * FROM regla_alerta WHERE id_regla = ?', [id]);
    res.status(201).json({ data: created });
  } catch (err) {
    console.error('[POST /alertas/reglas]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

//----------------TI-08----------------
router.put('/alertas/reglas/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await db.query('SELECT * FROM regla_alerta WHERE id_regla = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada.' });

    const nombre = String(req.body.nombre ?? existing.nombre).trim();
    const operador = String(req.body.operador ?? existing.operador).trim();
    const valorUmbral = req.body.valorUmbral !== undefined ? Number(req.body.valorUmbral) : Number(existing.valor_umbral);
    const activa = req.body.activa !== undefined ? Boolean(req.body.activa) : Boolean(existing.activa);

    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido.' });
    if (!OPERADORES.has(operador)) return res.status(400).json({ error: 'Operador no valido.' });
    if (!Number.isFinite(valorUmbral)) return res.status(400).json({ error: 'Valor umbral no valido.' });

    await db.query(
      `UPDATE regla_alerta SET nombre = ?, operador = ?, valor_umbral = ?, activa = ? WHERE id_regla = ?`,
      [nombre, operador, valorUmbral, activa ? 1 : 0, id]
    );

    await auditEvent(req, {
      evento: 'regla_alerta_actualizada',
      accion: 'editar_regla_alerta',
      modulo: 'alertas',
      entidad: 'regla_alerta',
      entidadId: id,
      elementoTitulo: nombre,
      detalle: `Regla actualizada: ${operador} ${valorUmbral}, activa=${activa}`,
    });

    const [[updated]] = await db.query('SELECT * FROM regla_alerta WHERE id_regla = ?', [id]);
    res.json({ data: updated });
  } catch (err) {
    console.error('[PUT /alertas/reglas/:id]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

//----------------TI-08----------------
router.delete('/alertas/reglas/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await db.query('SELECT * FROM regla_alerta WHERE id_regla = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada.' });

    await db.query('DELETE FROM regla_alerta WHERE id_regla = ?', [id]);

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
    console.error('[DELETE /alertas/reglas/:id]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

//----------------TI-23 / TI-31----------------
router.get('/alertas/generadas', adminOnly, async (req, res) => {
  try {
    const soloPendientes = req.query.pendientes === '1';
    const where = soloPendientes ? 'WHERE ag.atendida = 0' : '';
    const [rows] = await db.query(`
      SELECT ag.*, r.nombre AS regla_nombre
      FROM alerta_generada ag
      LEFT JOIN regla_alerta r ON r.id_regla = ag.id_regla
      ${where}
      ORDER BY ag.fecha_generada DESC
      LIMIT 200
    `);
    res.json({ data: rows });
  } catch (err) {
    console.error('[GET /alertas/generadas]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

//----------------TI-23 / TI-31----------------
router.post('/alertas/generadas/:id/atender', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await db.query('SELECT * FROM alerta_generada WHERE id_alerta = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Alerta no encontrada.' });

    await db.query(
      `UPDATE alerta_generada SET atendida = 1, atendida_por = ?, fecha_atendida = NOW() WHERE id_alerta = ?`,
      [req.user.id, id]
    );

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
    console.error('[POST /alertas/generadas/:id/atender]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

//----------------TI-08 / TI-23 / TI-31----------------
router.post('/alertas/evaluar', adminOnly, async (_req, res) => {
  try {
    const generadas = await evaluarReglas();
    res.json({ ok: true, generadas: generadas.length });
  } catch (err) {
    console.error('[POST /alertas/evaluar]', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

export default router;
