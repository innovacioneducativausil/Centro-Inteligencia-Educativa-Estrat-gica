


import db from '../db.js';


const HASH_USUARIO2026 = '$2b$10$.uvMqDT.FrLCvDpQYrvAr.zL84/e0UPxti5nqKfwj86ugrUUB5wbW';
const HASH_USIL_ADMIN_2026 = '$2b$10$x3pu2mItMxMq6kJKO/FqZ.ojLMhe8tTO3Zp.EM/0MBvicesjcjoiG';

const USUARIOS_NUEVOS = [
  { id: '6d1a4b91-bbb9-4ff6-bcd0-62700b5fcc09', nombre: 'Paolo Tejada Pinto',       corto: 'Paolo',    correo: 'ptejada@usil.edu.pe'   },
  { id: '200db630-a4d7-4f24-92fe-cfac92970cfe', nombre: 'Grecia Mattos Mena',        corto: 'Grecia',   correo: 'gmattos@usil.edu.pe'   },
  { id: '2d8d1fa9-abe4-4f08-95b4-61e17a399906', nombre: 'Patricia Nieto Melgarejo',  corto: 'Patricia', correo: 'pnieto@usil.edu.pe'    },
  { id: 'e9dccce6-ed64-4231-92e0-30d09826c4f7', nombre: 'Jean Paul Kaiser Salas',    corto: 'Jean',     correo: 'jkaiser@usil.edu.pe'   },
  { id: 'e3bba2ff-c54c-4139-a2fc-cf0fa8acc6fa', nombre: 'Angela Jimenez Salas',      corto: 'Angela',   correo: 'ajimenezs@usil.edu.pe' },
];

const USUARIOS_ADMIN = [
  { nombre: 'Krios Valverde', corto: 'Krios', correo: 'kriosv@usil.edu.pe' },
  { nombre: 'Wlimer Campos',  corto: 'Wlimer', correo: 'wcampos@usil.edu.pe' },
];

const USUARIOS_SOLICITADOS = [
  { nombre: 'R Escobedo', corto: 'R Escobedo', correo: 'rescobedo@usil.edu.pe', rol: 'admin' },
  { nombre: 'F Garcia',   corto: 'F Garcia',   correo: 'fgarciacr@usil.edu.pe', rol: 'usuario' },
  { nombre: 'C Chumbes',  corto: 'C Chumbes',  correo: 'cchumbes@usil.edu.pe',  rol: 'usuario' },
  { nombre: 'Innovacion Educativa', corto: 'Innovacion', correo: 'innovacioneducativa@usil.edu.pe', rol: 'admin', hash: HASH_USIL_ADMIN_2026 },
];

export async function runUserMigration() {
  console.log('[USER MIGRATION] Iniciando...');


  try {
    await db.query(`ALTER TABLE usuario MODIFY rol VARCHAR(50) NOT NULL DEFAULT 'usuario'`);
    console.log('[USER MIGRATION] Paso 1: rol → VARCHAR(50) OK');
  } catch (e) {

    console.warn('[USER MIGRATION] Paso 1 (ALTER):', e.message);
  }


  try {
    await db.query(`ALTER TABLE usuario MODIFY password_hash VARCHAR(255) NOT NULL`);
    console.log('[USER MIGRATION] Paso 1b: password_hash → VARCHAR(255) OK');
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 1b (ALTER password_hash):', e.message);
  }


  try {
    const [columns] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario'`
    );
    const existing = new Set(columns.map(c => c.COLUMN_NAME));
    const toAdd = [];
    if (!existing.has('otp_hash'))     toAdd.push('ADD COLUMN otp_hash VARCHAR(64) NULL');
    if (!existing.has('otp_expires'))  toAdd.push('ADD COLUMN otp_expires DATETIME NULL');
    if (!existing.has('otp_attempts')) toAdd.push('ADD COLUMN otp_attempts TINYINT NOT NULL DEFAULT 0');
    if (!existing.has('otp_purpose'))  toAdd.push('ADD COLUMN otp_purpose VARCHAR(20) NULL');

    if (toAdd.length) {
      await db.query(`ALTER TABLE usuario ${toAdd.join(', ')}`);
      console.log(`[USER MIGRATION] Paso 1c: columnas OTP agregadas (${toAdd.length})`);
    }
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 1c (OTP columns):', e.message);
  }


  try {
    const [r] = await db.query(
      `UPDATE usuario SET rol='admin' WHERE correo_usuario='acastroh@usil.edu.pe' AND rol != 'admin'`
    );
    if (r.affectedRows) console.log('[USER MIGRATION] Paso 2: acastroh → admin');
  } catch (e) { console.warn('[USER MIGRATION] Paso 2:', e.message); }


  try {
    const [r] = await db.query(
      `UPDATE usuario SET rol='usuario' WHERE rol IN ('editor','analista','lector')`
    );
    if (r.affectedRows) console.log(`[USER MIGRATION] Paso 3: ${r.affectedRows} usuarios migrados → usuario`);
  } catch (e) { console.warn('[USER MIGRATION] Paso 3:', e.message); }


  try {
    await db.query(`DELETE FROM usuario WHERE correo_usuario='admin@usil.edu'`);
    console.log('[USER MIGRATION] Paso 4: admin@usil.edu eliminado');
  } catch (e) { console.warn('[USER MIGRATION] Paso 4:', e.message); }


  for (const u of USUARIOS_NUEVOS) {
    try {
      const [[existe]] = await db.query(
        'SELECT id_usuario, CHAR_LENGTH(password_hash) as hash_len FROM usuario WHERE correo_usuario = ?',
        [u.correo]
      );
      if (!existe) {
        await db.query(
          `INSERT INTO usuario
             (id_usuario,nombre_usuario,nombre_corto,correo_usuario,password_hash,rol,activo,email_verificado,fecha_creacion,fecha_actualizacion)
           VALUES (?,?,?,?,?,'usuario',1,1,NOW(),NOW())`,
          [u.id, u.nombre, u.corto, u.correo, HASH_USUARIO2026]
        );
        console.log(`[USER MIGRATION] Paso 5: creado ${u.correo}`);
      } else if (existe.hash_len < 60) {

        await db.query(
          'UPDATE usuario SET password_hash = ? WHERE correo_usuario = ?',
          [HASH_USUARIO2026, u.correo]
        );
        console.log(`[USER MIGRATION] Paso 5: hash corregido para ${u.correo}`);
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 5 (${u.correo}):`, e.message);
    }
  }


  for (const u of USUARIOS_ADMIN) {
    try {
      const [[existe]] = await db.query(
        'SELECT id_usuario, CHAR_LENGTH(password_hash) as hash_len, rol FROM usuario WHERE correo_usuario = ?',
        [u.correo]
      );

      if (!existe) {
        await db.query(
          `INSERT INTO usuario
             (id_usuario,nombre_usuario,nombre_corto,correo_usuario,password_hash,rol,activo,email_verificado,fecha_creacion,fecha_actualizacion)
           VALUES (UUID(),?,?,?,?,'admin',1,1,NOW(),NOW())`,
          [u.nombre, u.corto, u.correo, HASH_USUARIO2026]
        );
        console.log(`[USER MIGRATION] Paso 6: admin creado ${u.correo}`);
      } else {
        const updates = ['rol = ?', 'password_hash = ?', 'activo = 1', 'email_verificado = 1', 'fecha_actualizacion = NOW()'];
        const params = ['admin', HASH_USUARIO2026];
        params.push(u.correo);
        const [r] = await db.query(
          `UPDATE usuario SET ${updates.join(', ')} WHERE correo_usuario = ?`,
          params
        );
        if (r.affectedRows) console.log(`[USER MIGRATION] Paso 6: admin actualizado ${u.correo}`);
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 6 (${u.correo}):`, e.message);
    }
  }


  for (const u of USUARIOS_SOLICITADOS) {
    try {
      const [[existe]] = await db.query(
        'SELECT id_usuario, rol FROM usuario WHERE correo_usuario = ?',
        [u.correo]
      );

      if (!existe) {
        await db.query(
          `INSERT INTO usuario
             (id_usuario,nombre_usuario,nombre_corto,correo_usuario,password_hash,rol,activo,email_verificado,fecha_creacion,fecha_actualizacion)
           VALUES (UUID(),?,?,?,?,?,1,1,NOW(),NOW())`,
          [u.nombre, u.corto, u.correo, u.hash || HASH_USUARIO2026, u.rol]
        );
        console.log(`[USER MIGRATION] Paso 7: creado ${u.correo} (${u.rol})`);
      } else {
        const [r] = await db.query(
          `UPDATE usuario
           SET nombre_usuario = ?, nombre_corto = ?, password_hash = ?, rol = ?,
               activo = 1, email_verificado = 1, fecha_actualizacion = NOW()
           WHERE correo_usuario = ?`,
          [u.nombre, u.corto, u.hash || HASH_USUARIO2026, u.rol, u.correo]
        );
        if (r.affectedRows) console.log(`[USER MIGRATION] Paso 7: actualizado ${u.correo} (${u.rol})`);
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 7 (${u.correo}):`, e.message);
    }
  }

  console.log('[USER MIGRATION] Finalizada.');
}
