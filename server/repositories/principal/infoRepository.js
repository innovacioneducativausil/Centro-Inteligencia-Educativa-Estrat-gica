import db from '../../db.js';

export async function getDatabaseTables() {
  const [rows] = await db.query('SHOW TABLES');
  return rows.map(row => Object.values(row)[0]);
}

export async function describeTable(tableName) {
  const safeTableName = String(tableName || '').replace(/[^a-zA-Z0-9_]/g, '');
  const [rows] = await db.query(`DESCRIBE \`${safeTableName}\``);
  return { table: safeTableName, columns: rows };
}
