
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
  database: 'empleabilidad_usil',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit:      0,
  timezone: '+00:00',
});

pool.getConnection()
  .then(conn => { console.log('✅ MySQL conectado a "empleabilidad_usil"'); conn.release(); })
  .catch(err => { console.error('❌ Error empleabilidad_usil:', err.message); });

export default pool;
