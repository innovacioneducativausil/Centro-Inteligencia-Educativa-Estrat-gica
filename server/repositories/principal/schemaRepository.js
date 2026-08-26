import dbRadar      from '../../db.js';
import dbEmpl       from '../../db_empl.js';
import dbCurricular from '../../db_curricular.js';

const DATABASES = [
  { key: 'radar',         label: 'radar_carreras',    schema: 'radar_carreras',    pool: dbRadar,      color: '#0f8a7e' },
  { key: 'empleabilidad', label: 'empleabilidad_usil', schema: 'empleabilidad_usil', pool: dbEmpl,       color: '#a8650a' },
  { key: 'curricular',    label: 'mallas_usil',       schema: 'mallas_usil',       pool: dbCurricular, color: '#6b46c9' },
];

// MySQL no permite FOREIGN KEY entre bases de datos distintas, así que estos
// cruces no se pueden descubrir por información de esquema: son conocimiento
// de negocio documentado a mano (ver carreraCorrespondenciaService.js y
// cursoMatchingService.js, que son quienes realmente los aplican en runtime).
const CROSS_DB_RELATIONS = [
  {
    id: 'radar-busqueda',
    from: { db: 'radar', table: 'senal / tendencia' },
    to:   { db: 'curricular', table: 'carrera' },
    kind: 'runtime',
    label: 'búsqueda en tiempo de ejecución — sin ID ni texto persistido',
  },
  {
    id: 'mercado-informe-texto',
    from: { db: 'empleabilidad', table: 'mercado_informe', column: 'nombre_carrera' },
    to:   { db: 'curricular', table: 'carrera', column: 'nombre_carrera' },
    kind: 'texto',
    label: 'nombre_carrera = nombre_carrera (texto)',
  },
  {
    id: 'programa-benchmark-id',
    from: { db: 'empleabilidad', table: 'programa_benchmark', column: 'carrera_equivalente_id' },
    to:   { db: 'curricular', table: 'carrera', column: 'id_carrera' },
    kind: 'id',
    label: 'carrera_equivalente_id → id_carrera',
  },
  {
    id: 'correspondencia-malla',
    from: { db: 'curricular', table: 'carrera_correspondencia_empleabilidad', column: 'id_carrera_malla' },
    to:   { db: 'curricular', table: 'carrera', column: 'id_carrera' },
    kind: 'id',
    label: 'id_carrera_malla → carrera.id_carrera',
  },
  {
    id: 'correspondencia-empleabilidad',
    from: { db: 'curricular', table: 'carrera_correspondencia_empleabilidad', column: 'id_carrera_empleabilidad' },
    to:   { db: 'empleabilidad', table: 'carrera', column: 'id_carrera' },
    kind: 'id',
    label: 'id_carrera_empleabilidad → carrera.id_carrera',
  },
];

async function loadDatabaseSchema({ pool, schema }) {
  const [tables] = await pool.query(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS rowCount, DATA_LENGTH AS dataBytes, INDEX_LENGTH AS indexBytes
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [schema],
  );

  const [columns] = await pool.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_KEY AS columnKey, DATA_TYPE AS dataType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [schema],
  );

  const [fks] = await pool.query(
    `SELECT k.TABLE_NAME AS tableName, k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_NAME AS refTable,
            k.REFERENCED_COLUMN_NAME AS refColumn, r.DELETE_RULE AS deleteRule
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    [schema],
  );

  const fkColumnNames = new Set(fks.map(f => `${f.tableName}.${f.columnName}`));

  const tableMap = new Map(tables.map(t => [t.name, {
    name: t.name,
    rowCount: Number(t.rowCount) || 0,
    dataBytes: Number(t.dataBytes) || 0,
    indexBytes: Number(t.indexBytes) || 0,
    columns: [],
    relations: [],
  }]));

  for (const c of columns) {
    const t = tableMap.get(c.tableName);
    if (!t) continue;
    t.columns.push({
      name: c.columnName,
      isPk: c.columnKey === 'PRI',
      isFk: fkColumnNames.has(`${c.tableName}.${c.columnName}`),
      dataType: c.dataType,
    });
  }

  for (const f of fks) {
    const t = tableMap.get(f.tableName);
    if (!t) continue;
    t.relations.push({
      column: f.columnName,
      refTable: f.refTable,
      refColumn: f.refColumn,
      deleteRule: f.deleteRule,
    });
  }

  return Array.from(tableMap.values());
}

async function loadAllSchemas() {
  const results = await Promise.all(DATABASES.map(loadDatabaseSchema));
  return DATABASES.map((db, i) => ({
    key: db.key,
    label: db.label,
    color: db.color,
    tables: results[i],
  }));
}

export async function getSchemaDiagram() {
  const databases = await loadAllSchemas();
  return {
    generatedAt: new Date().toISOString(),
    databases: databases.map(db => ({
      key: db.key,
      label: db.label,
      color: db.color,
      tableCount: db.tables.length,
      tables: db.tables.map(t => ({
        name: t.name,
        columns: t.columns,
        relations: t.relations,
      })),
    })),
    crossDb: CROSS_DB_RELATIONS,
  };
}

export async function getSchemaSizes() {
  const databases = await loadAllSchemas();
  return {
    generatedAt: new Date().toISOString(),
    databases: databases.map(db => ({
      key: db.key,
      label: db.label,
      color: db.color,
      tables: db.tables
        .map(t => ({ name: t.name, rowCount: t.rowCount, dataBytes: t.dataBytes, indexBytes: t.indexBytes }))
        .sort((a, b) => b.dataBytes - a.dataBytes),
    })),
  };
}
