// server/scripts/setPassword.js
// Genera hash bcrypt y actualiza la contraseña de un usuario en la BD.
// Uso: node scripts/setPassword.js <correo> <nueva_contraseña>
//
// Ejemplos:
//   node scripts/setPassword.js admin@usil.edu MiClave2025!
//   node scripts/setPassword.js  (sin args → lista usuarios existentes)

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Importar pool después de cargar .env
const { default: db } = await import('../db.js');

const [,, correo, password] = process.argv;

// Sin argumentos → listar usuarios
if (!correo) {
  console.log('\n📋  Usuarios en la base de datos:\n');
  const [rows] = await db.query(
    'SELECT correo_usuario, nombre_usuario, rol, activo FROM usuario ORDER BY fecha_creacion'
  );
  if (rows.length === 0) {
    console.log('   (No hay usuarios registrados)');
  } else {
    rows.forEach(u => {
      const estado = u.activo ? '✅ activo' : '❌ inactivo';
      console.log(`   ${u.correo_usuario}   [${u.rol}]   ${estado}   ${u.nombre_usuario}`);
    });
  }
  console.log('\n   Uso: node scripts/setPassword.js <correo> <nueva_contraseña>\n');
  await db.end?.();
  process.exit(0);
}

if (!password) {
  console.error('\n❌  Falta la contraseña.');
  console.error('   Uso: node scripts/setPassword.js <correo> <nueva_contraseña>\n');
  process.exit(1);
}

// Verificar que el usuario existe
const [[user]] = await db.query(
  'SELECT id_usuario, nombre_usuario FROM usuario WHERE correo_usuario = ?',
  [correo.trim().toLowerCase()]
);

if (!user) {
  console.error(`\n❌  No existe ningún usuario con el correo: ${correo}\n`);
  process.exit(1);
}

// Generar hash bcrypt (factor de coste 10)
const hash = await bcrypt.hash(password, 10);

// Actualizar en la BD
await db.query(
  'UPDATE usuario SET password_hash = ? WHERE id_usuario = ?',
  [hash, user.id_usuario]
);

console.log(`\n✅  Contraseña actualizada correctamente`);
console.log(`   Usuario : ${user.nombre_usuario}`);
console.log(`   Correo  : ${correo}`);
console.log(`   Hash    : ${hash.substring(0, 30)}…\n`);

process.exit(0);
