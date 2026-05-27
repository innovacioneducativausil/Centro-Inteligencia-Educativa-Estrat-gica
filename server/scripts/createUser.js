// server/scripts/createUser.js
// Crea un nuevo usuario con contraseña hasheada directamente en la BD.
// Uso: node scripts/createUser.js <correo> <contraseña> "<nombre completo>" [rol]
//
// Roles disponibles: admin | editor | analista | lector  (default: lector)
//
// Ejemplos:
//   node scripts/createUser.js admin@usil.edu Admin2025!  "Ana García"  admin
//   node scripts/createUser.js editor@usil.edu Clave123!  "Luis Torres" editor
//   node scripts/createUser.js lector@usil.edu Pass2025!  "María López"

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const { default: db } = await import('../db.js');

const ROLES_VALIDOS = ['admin', 'editor', 'analista', 'lector'];

const [,, correo, password, nombre, rol = 'lector'] = process.argv;

if (!correo || !password || !nombre) {
  console.log(`
  ❌  Faltan argumentos.

  Uso:
    node scripts/createUser.js <correo> <contraseña> "<nombre>" [rol]

  Roles: admin | editor | analista | lector  (default: lector)

  Ejemplo:
    node scripts/createUser.js admin@usil.edu Admin2025! "Ana García" admin
`);
  process.exit(1);
}

if (!ROLES_VALIDOS.includes(rol)) {
  console.error(`\n❌  Rol inválido: "${rol}". Usa: admin | editor | analista | lector\n`);
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
