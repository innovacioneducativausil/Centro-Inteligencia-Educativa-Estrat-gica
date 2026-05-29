// server/services/userMigration.js
// Migración automática de usuarios y roles. Se ejecuta al arrancar Railway.
import db from '../db.js';

// Hash de bcrypt para la contraseña temporal "Usuario2026*" (rondas=10, verificado localmente)
const HASH_USUARIO2026 = '$2b$10$.uvMqDT.FrLCvDpQYrvAr.zL84/e0UPxti5nqKfwj86ugrUUB5wbW';

const USUARIOS_NUEVOS = [
  { id: '6d1a4b91-bbb9-4ff6-bcd0-62700b5fcc09', nombre: 'Paolo Tejada Pinto',       corto: 'Paolo',    correo: 'ptejada@usil.edu.pe'   },
  { id: '200db630-a4d7-4f24-92fe-cfac92970cfe', nombre: 'Grecia Mattos Mena',        corto: 'Grecia',   correo: 'gmattos@usil.edu.pe'   },
  { id: '2d8d1fa9-abe4-4f08-95b4-61e17a399906', nombre: 'Patricia Nieto Melgarejo',  corto: 'Patricia', correo: 'pnieto@usil.edu.pe'    },
  { id: 'e9dccce6-ed64-4231-92e0-30d09826c4f7', nombre: 'Jean Paul Kaiser Salas',    corto: 'Jean',     correo: 'jkaiser@usil.edu.pe'   },
  { id: 'e3bba2ff-c54c-4139-a2fc-cf0fa8acc6fa', nombre: 'Angela Jimenez Salas',      corto: 'Angela',   correo: 'ajimenezs@usil.edu.pe' },
];

export async function runUserMigration() {
  try {
    // 1. Ampliar ENUM para incluir 'usuario' (si ya está, MySQL lo ignora silenciosamente)
    await db.query(
      `ALTER TABLE usuario MODIFY rol ENUM('admin','editor','analista','lector','usuario') NOT NULL DEFAULT 'usuario'`
    );

    // 2. Poner acastroh como admin explícitamente
    await db.query(
      `UPDATE usuario SET rol='admin' WHERE correo_usuario='acastroh@usil.edu.pe' AND rol != 'admin'`
    );

    // 3. Migrar roles legacy → usuario
    await db.query(
      `UPDATE usuario SET rol='usuario' WHERE rol IN ('editor','analista','lector')`
    );

    // 4. Limpiar ENUM — solo admin y usuario
    await db.query(
      `ALTER TABLE usuario MODIFY rol ENUM('admin','usuario') NOT NULL DEFAULT 'usuario'`
    );

    // 5. Eliminar usuario admin@usil.edu (solo existe en Railway como cuenta temporal)
    await db.query(`DELETE FROM usuario WHERE correo_usuario='admin@usil.edu'`);

    // 6. Crear los 5 usuarios nuevos si no existen
    for (const u of USUARIOS_NUEVOS) {
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
        console.log(`[USER MIGRATION] Creado: ${u.correo}`);
      }
    }

    console.log('[USER MIGRATION] Completada correctamente.');
  } catch (err) {
    console.error('[USER MIGRATION] Error (no crítico):', err.message);
  }
}
