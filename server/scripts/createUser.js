// server/scripts/createUser.js
// Crea un nuevo usuario con contraseña hasheada directamente en la BD.
// Uso: node scripts/createUser.js <correo> <contraseña> "<nombre completo>" [rol]
//
// Roles disponibles: admin | usuario  (default: usuario)
//
// Ejemplos:
//   node scripts/createUser.js admin@usil.edu Admin2025!  "Ana García"  admin
//   node scripts/createUser.js user@usil.edu  Clave123!   "Luis Torres" usuario

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const { default: db } = await import('../db.js');

const ROLES_VALIDOS = ['admin', 'usuario'];

const [,, correo, password, nombre, rol = 'usuario'] = process.argv;

if (!correo || !password || !nombre) {
  console.log(`
  ❌  Faltan argumentos.

  Uso:
    node scripts/createUser.js <correo> <contraseña> "<nombre>" [rol]

  Roles: admin | usuario  (default: usuario)

  Ejemplo:
    node scripts/createUser.js admin@usil.edu  Admin2025!  "Ana García"  admin
    node scripts/createUser.js user@usil.edu   Clave123!   "Luis Torres"
`);
  process.exit(1);
}

if (!ROLES_VALIDOS.includes(rol)) {
  console.error(`\n❌  Rol inválido: "${rol}". Usa: admin | usuario\n`);
  process.exit(1);
}

// Verificar si ya existe
const [[existe]] = await db.query(
  'SELECT id_usuario FROM usuario WHERE correo_usuario = ?',
  [correo.trim().toLowerCase()]
);
if (existe) {
  console.error(`\n❌  Ya existe un usuario con ese correo: ${correo}\n`);
  console.error('   Usa setPassword.js si quieres cambiar su contraseña.\n');
  process.exit(1);
}

// Generar hash bcrypt
const hash = await bcrypt.hash(password, 10);

// Insertar usuario
const id = randomUUID();
const nombreCorto = nombre.trim().split(' ')[0]; // primer nombre como nombre corto

await db.query(
  `INSERT INTO usuario
     (id_usuario, nombre_usuario, nombre_corto, correo_usuario, password_hash,
      rol, activo, email_verificado, fecha_creacion, fecha_actualizacion)
   VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())`,
  [id, nombre.trim(), nombreCorto, correo.trim().toLowerCase(), hash, rol]
);

console.log(`
✅  Usuario creado correctamente

   Nombre  : ${nombre.trim()}
   Correo  : ${correo.trim().toLowerCase()}
   Rol     : ${rol}
   ID      : ${id}

   Ya puedes iniciar sesión en la plataforma.
`);

process.exit(0);
