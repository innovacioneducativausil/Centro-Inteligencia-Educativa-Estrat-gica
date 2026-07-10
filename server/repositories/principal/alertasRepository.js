import db from '../../db.js';

export async function getReglasAlerta() {
  const [rows] = await db.query('SELECT * FROM regla_alerta ORDER BY fecha_creacion DESC');
  return rows;
}

export async function createReglaAlerta({ id, nombre, metrica, operador, valorUmbral, creadoPor }) {
  await db.query(
    `INSERT INTO regla_alerta (id_regla, nombre, metrica, operador, valor_umbral, activa, creado_por)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [id, nombre, metrica, operador, valorUmbral, creadoPor]
  );

  return getReglaAlertaById(id);
}

export async function getReglaAlertaById(id) {
  const [[row]] = await db.query('SELECT * FROM regla_alerta WHERE id_regla = ?', [id]);
  return row || null;
}

export async function updateReglaAlerta(id, { nombre, operador, valorUmbral, activa }) {
  await db.query(
    'UPDATE regla_alerta SET nombre = ?, operador = ?, valor_umbral = ?, activa = ? WHERE id_regla = ?',
    [nombre, operador, valorUmbral, activa ? 1 : 0, id]
  );

  return getReglaAlertaById(id);
}

export async function deleteReglaAlerta(id) {
  await db.query('DELETE FROM regla_alerta WHERE id_regla = ?', [id]);
}

export async function getAlertasGeneradas({ soloPendientes = false } = {}) {
  const where = soloPendientes ? 'WHERE ag.atendida = 0' : '';
  const [rows] = await db.query(
    `SELECT ag.*, r.nombre AS regla_nombre
     FROM alerta_generada ag
     LEFT JOIN regla_alerta r ON r.id_regla = ag.id_regla
     ${where}
     ORDER BY ag.fecha_generada DESC
     LIMIT 200`
  );

  return rows;
}

export async function getAlertaGeneradaById(id) {
  const [[row]] = await db.query('SELECT * FROM alerta_generada WHERE id_alerta = ?', [id]);
  return row || null;
}

export async function markAlertaAtendida({ id, atendidaPor }) {
  await db.query(
    'UPDATE alerta_generada SET atendida = 1, atendida_por = ?, fecha_atendida = NOW() WHERE id_alerta = ?',
    [atendidaPor, id]
  );
}
