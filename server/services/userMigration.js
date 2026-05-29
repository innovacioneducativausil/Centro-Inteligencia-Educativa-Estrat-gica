// server/services/userMigration.js
// Migración automática de usuarios y roles al arrancar Railway.
// Cada paso tiene su propio try/catch — un fallo no detiene los siguientes.
import db from '../db.js';

// Hash bcrypt de "Usuario2026*" (verificado: bcrypt.compare retorna true)
const HASH_USUARIO2026 = '$2b$10$.uvMqDT.FrLCvDpQYrvAr.zL84/e0UPxti5nqKfwj86ugrUUB5wbW';

const USUARIOS_NUEVOS = [
  { id: '6d1a4b91-bbb9-4ff6-bcd0-62700b5fcc09', nombre: 'Paolo Tejada Pinto',       corto: 'Paolo',    correo: 'ptejada@usil.edu.pe'   },
  { id: '200db630-a4d7-4f24-92fe-cfac92970cfe', nombre: 'Grecia Mattos Mena',        corto: 'Grecia',   correo: 'gmattos@usil.edu.pe'   },
  { id: '2d8d1fa9-abe4-4f08-95b4-61e17a399906', nombre: 'Patricia Nieto Melgarejo',  corto: 'Patricia', correo: 'pnieto@usil.edu.pe'    },
  { id: 'e9dccce6-ed64-4231-92e0-30d09826c4f7', nombre: 'Jean Paul Kaiser Salas',    corto: 'Jean',     correo: 'jkaiser@usil.edu.pe'   },
  { id: 'e3bba2ff-c54c-4139-a2fc-cf0fa8acc6fa', nombre: 'Angela Jimenez Salas',      corto: 'Angela',   correo: 'ajimenezs@usil.edu.pe' },
];

export async function runUserMigration() {
  console.log('[USER MIGRATION] Iniciando...');

  // Paso 1: Convertir columna rol de ENUM a VARCHAR(50)
  // Esto permite insertar 'usuario' sin importar el ENUM previo
  try {
    await db.query(`ALTER TABLE usuario MODIFY rol VARCHAR(50) NOT NULL DEFAULT 'usuario'`);
    console.log('[USER MIGRATION] Paso 1: rol → VARCHAR(50) OK');
  } catch (e) {
    // Puede fallar si ya es VARCHAR — no es crítico
    console.warn('[USER MIGRATION] Paso 1 (ALTER):', e.message);
  }

  // Paso 2: Poner acastroh como admin
  try {
    const [r] = await db.query(
      `UPDATE usuario SET rol='admin' WHERE correo_usuario='acastroh@usil.edu.pe' AND rol != 'admin'`
    );
    if (r.affectedRows) console.log('[USER MIGRATION] Paso 2: acastroh → admin');
  } catch (e) { console.warn('[USER MIGRATION] Paso 2:', e.message); }

  // Paso 3: Migrar roles legacy → usuario
  try {
    const [r] = await db.query(
      `UPDATE usuario SET rol='usuario' WHERE rol IN ('editor','analista','lector')`
    );
    if (r.affectedRows) console.log(`[USER MIGRATION] Paso 3: ${r.affectedRows} usuarios migrados → usuario`);
  } catch (e) { console.warn('[USER MIGRATION] Paso 3:', e.message); }

  // Paso 4: Eliminar admin@usil.edu
  try {
    await db.query(`DELETE FROM usuario WHERE correo_usuario='admin@usil.edu'`);
    console.log('[USER MIGRATION] Paso 4: admin@usil.edu eliminado');
  } catch (e) { console.warn('[USER MIGRATION] Paso 4:', e.message); }

  // Paso 5: Crear usuarios nuevos si no existen
  for (const u of USUARIOS_NUEVOS) {
    try {
      const [[existe]] = await db.query(
        'SELECT id_usuario FROM usuario WHERE correo_usuario = ?',
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
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 5 (${u.correo}):`, e.message);
    }
  }

  console.log('[USER MIGRATION] Finalizada.');
}
