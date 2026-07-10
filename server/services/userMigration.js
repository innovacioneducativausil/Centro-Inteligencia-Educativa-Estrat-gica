import { randomUUID } from 'crypto';
import { radarPrisma } from '../prismaClient.js';
import { ensureColumn } from './schemaMaintenance.js';

const HASH_USUARIO2026 = '$2b$10$TcGMVTczjVtjsCBGlNv2HeqBZZBm9ooqtz1pN2NOYSXRx5IYWPccC';
const HASH_USIL_ADMIN_2026 = '$2b$10$VFWnxWhh5OLch4n2vLZ2y..Y5FULqqvqleWKG/8EDEZllZCYY/oaC';

const USUARIOS_NUEVOS = [
  { id: '6d1a4b91-bbb9-4ff6-bcd0-62700b5fcc09', nombre: 'Paolo Tejada Pinto', corto: 'Paolo', correo: 'ptejada@usil.edu.pe' },
  { id: '200db630-a4d7-4f24-92fe-cfac92970cfe', nombre: 'Grecia Mattos Mena', corto: 'Grecia', correo: 'gmattos@usil.edu.pe' },
  { id: '2d8d1fa9-abe4-4f08-95b4-61e17a399906', nombre: 'Patricia Nieto Melgarejo', corto: 'Patricia', correo: 'pnieto@usil.edu.pe' },
  { id: 'e9dccce6-ed64-4231-92e0-30d09826c4f7', nombre: 'Jean Paul Kaiser Salas', corto: 'Jean', correo: 'jkaiser@usil.edu.pe' },
  { id: 'e3bba2ff-c54c-4139-a2fc-cf0fa8acc6fa', nombre: 'Angela Jimenez Salas', corto: 'Angela', correo: 'ajimenezs@usil.edu.pe' },
];

const USUARIOS_ADMIN = [
  { nombre: 'Krios Valverde', corto: 'Krios', correo: 'kriosv@usil.edu.pe' },
  { nombre: 'Wlimer Campos', corto: 'Wlimer', correo: 'wcampos@usil.edu.pe' },
  { nombre: 'Michael Montoya Ruiz', corto: 'Michael', correo: 'mmontoyar@usil.edu.pe' },
];

const USUARIOS_SOLICITADOS = [
  { nombre: 'Ross Escobedo', corto: 'Ross', correo: 'rescobedo@usil.edu.pe', rol: 'admin', reemplazarSiNombre: ['R Escobedo'] },
  { nombre: 'Frank Garcia', corto: 'Frank', correo: 'fgarciacr@usil.edu.pe', rol: 'usuario', reemplazarSiNombre: ['F Garcia'] },
  { nombre: 'Camila Chumbes', corto: 'Camila', correo: 'cchumbes@usil.edu.pe', rol: 'usuario', reemplazarSiNombre: ['C Chumbes'] },
  { nombre: 'Innovacion Educativa', corto: 'Innovacion', correo: 'innovacioneducativa@usil.edu.pe', rol: 'admin', hash: HASH_USIL_ADMIN_2026 },
];

async function ensureUsuarioColumns() {
  const required = [
    ['otp_hash', 'VARCHAR(64) NULL'],
    ['otp_expires', 'DATETIME NULL'],
    ['otp_attempts', 'TINYINT NOT NULL DEFAULT 0'],
    ['otp_purpose', 'VARCHAR(20) NULL'],
    ['failed_login_attempts', 'TINYINT NOT NULL DEFAULT 0'],
    ['locked_until', 'DATETIME NULL'],
    ['password_changed_at', 'DATETIME NULL'],
    ['modulos_permitidos', 'JSON NULL'],
  ];

  for (const [column, definition] of required) {
    await ensureColumn('usuario', column, definition);
  }
  console.log(`[USER MIGRATION] Columnas usuario verificadas (${required.length})`);
}

async function normalizeAllUsers() {
  const usuarios = await radarPrisma.usuario.findMany({
    select: {
      id_usuario: true,
      correo_usuario: true,
      nombre_usuario: true,
      nombre_corto: true,
      rol: true,
      password_hash: true,
      password_changed_at: true,
    },
  });

  const rolesValidos = new Set(['admin', 'usuario', 'lector', 'analista', 'editor']);

  for (const u of usuarios) {
    const now = new Date();
    const correo = (u.correo_usuario || '').trim().toLowerCase();
    const nombre = (u.nombre_usuario || '').trim();
    const nombreCorto = (u.nombre_corto || '').trim() || nombre.split(/\s+/)[0] || null;
    const rol = rolesValidos.has(u.rol) ? u.rol : 'usuario';
    const badHash = !u.password_hash || u.password_hash.length < 60;

    await radarPrisma.usuario.update({
      where: { id_usuario: u.id_usuario },
      data: {
        correo_usuario: correo,
        nombre_usuario: nombre || u.nombre_usuario,
        nombre_corto: nombreCorto,
        rol,
        activo: true,
        email_verificado: true,
        failed_login_attempts: 0,
        otp_attempts: 0,
        fecha_actualizacion: now,
        password_hash: badHash ? HASH_USUARIO2026 : u.password_hash,
        password_changed_at: badHash ? (u.password_changed_at || now) : u.password_changed_at,
      },
    });

    if (badHash) console.log(`[USER MIGRATION] Hash corregido para ${correo}`);
  }

  console.log('[USER MIGRATION] Normalizacion global de usuarios OK');
}

async function createUsuario({ id = randomUUID(), nombre, corto, correo, hash, rol }) {
  await radarPrisma.usuario.create({
    data: {
      id_usuario: id,
      nombre_usuario: nombre,
      nombre_corto: corto,
      correo_usuario: correo,
      password_hash: hash || HASH_USUARIO2026,
      rol,
      activo: true,
      email_verificado: true,
    },
  });
}

export async function runUserMigration() {
  console.log('[USER MIGRATION] Iniciando...');

  try {
    await radarPrisma.$executeRawUnsafe("ALTER TABLE usuario MODIFY rol VARCHAR(50) NOT NULL DEFAULT 'usuario'");
    console.log('[USER MIGRATION] Paso 1: rol a VARCHAR(50) OK');
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 1 (ALTER):', e.message);
  }

  try {
    await radarPrisma.$executeRawUnsafe('ALTER TABLE usuario MODIFY password_hash VARCHAR(255) NOT NULL');
    console.log('[USER MIGRATION] Paso 1b: password_hash a VARCHAR(255) OK');
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 1b (ALTER password_hash):', e.message);
  }

  await ensureUsuarioColumns();
  await normalizeAllUsers();

  await radarPrisma.usuario.updateMany({
    where: { rol: 'admin' },
    data: {
      activo: true,
      email_verificado: true,
      failed_login_attempts: 0,
      locked_until: null,
      fecha_actualizacion: new Date(),
    },
  });

  try {
    const r = await radarPrisma.usuario.updateMany({
      where: { correo_usuario: 'acastroh@usil.edu.pe', NOT: { rol: 'admin' } },
      data: { rol: 'admin', fecha_actualizacion: new Date() },
    });
    if (r.count) console.log('[USER MIGRATION] Paso 2: acastroh a admin');
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 2:', e.message);
  }

  try {
    const r = await radarPrisma.usuario.updateMany({
      where: { rol: { in: ['editor', 'analista', 'lector'] } },
      data: { rol: 'usuario', fecha_actualizacion: new Date() },
    });
    if (r.count) console.log(`[USER MIGRATION] Paso 3: ${r.count} usuarios migrados a usuario`);
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 3:', e.message);
  }

  try {
    await radarPrisma.usuario.deleteMany({ where: { correo_usuario: 'admin@usil.edu' } });
    console.log('[USER MIGRATION] Paso 4: admin@usil.edu eliminado');
  } catch (e) {
    console.warn('[USER MIGRATION] Paso 4:', e.message);
  }

  for (const u of USUARIOS_NUEVOS) {
    try {
      const existe = await radarPrisma.usuario.findUnique({
        where: { correo_usuario: u.correo },
        select: { id_usuario: true, password_hash: true },
      });

      if (!existe) {
        await createUsuario({ ...u, rol: 'usuario' });
        console.log(`[USER MIGRATION] Paso 5: creado ${u.correo}`);
      } else if (!existe.password_hash || existe.password_hash.length < 60) {
        await radarPrisma.usuario.update({
          where: { correo_usuario: u.correo },
          data: { password_hash: HASH_USUARIO2026, fecha_actualizacion: new Date() },
        });
        console.log(`[USER MIGRATION] Paso 5: hash corregido para ${u.correo}`);
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 5 (${u.correo}):`, e.message);
    }
  }

  for (const u of USUARIOS_ADMIN) {
    try {
      const existe = await radarPrisma.usuario.findUnique({
        where: { correo_usuario: u.correo },
        select: { id_usuario: true },
      });

      if (!existe) {
        await createUsuario({ ...u, rol: 'admin' });
        console.log(`[USER MIGRATION] Paso 6: admin creado ${u.correo}`);
      } else {
        await radarPrisma.usuario.update({
          where: { correo_usuario: u.correo },
          data: {
            rol: 'admin',
            password_hash: HASH_USUARIO2026,
            activo: true,
            email_verificado: true,
            fecha_actualizacion: new Date(),
          },
        });
        console.log(`[USER MIGRATION] Paso 6: admin actualizado ${u.correo}`);
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 6 (${u.correo}):`, e.message);
    }
  }

  for (const u of USUARIOS_SOLICITADOS) {
    try {
      const existe = await radarPrisma.usuario.findUnique({
        where: { correo_usuario: u.correo },
        select: {
          id_usuario: true,
          rol: true,
          nombre_usuario: true,
          nombre_corto: true,
          password_hash: true,
        },
      });

      if (!existe) {
        await createUsuario({ ...u });
        console.log(`[USER MIGRATION] Paso 7: creado ${u.correo} (${u.rol})`);
      } else {
        const shouldReplaceName = Array.isArray(u.reemplazarSiNombre)
          && u.reemplazarSiNombre.includes(existe.nombre_usuario || '');
        const nextNombre = shouldReplaceName ? u.nombre : (existe.nombre_usuario || u.nombre);
        const nextCorto = shouldReplaceName ? u.corto : (existe.nombre_corto || u.corto);

        await radarPrisma.usuario.update({
          where: { correo_usuario: u.correo },
          data: {
            nombre_usuario: nextNombre,
            nombre_corto: nextCorto,
            password_hash: u.hash || existe.password_hash || HASH_USUARIO2026,
            rol: u.rol,
            activo: true,
            email_verificado: true,
            failed_login_attempts: 0,
            locked_until: null,
            password_changed_at: new Date(),
            fecha_actualizacion: new Date(),
          },
        });
        console.log(`[USER MIGRATION] Paso 7: actualizado ${u.correo} (${u.rol})`);
      }
    } catch (e) {
      console.warn(`[USER MIGRATION] Paso 7 (${u.correo}):`, e.message);
    }
  }

  console.log('[USER MIGRATION] Finalizada.');
}
