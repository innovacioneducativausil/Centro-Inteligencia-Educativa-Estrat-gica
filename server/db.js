// server/db.js — Conexión a MySQL
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'radar_carreras',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone: '+00:00',
});

// Verificar conexión al arrancar
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL conectado a "radar_carreras" en puerto 3306');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error de conexión MySQL:', err.message);
  });

export default pool;
