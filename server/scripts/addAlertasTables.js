

import db from '../db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

//----------------TI-08 / TI-23 / TI-31----------------
async function run() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS regla_alerta (
      id_regla          VARCHAR(36)  NOT NULL PRIMARY KEY,
      nombre             VARCHAR(150) NOT NULL,
      metrica            VARCHAR(50)  NOT NULL,
      operador           VARCHAR(2)   NOT NULL,
      valor_umbral       DECIMAL(12,2) NOT NULL,
      activa             TINYINT(1)   NOT NULL DEFAULT 1,
      creado_por         VARCHAR(36)  NULL,
      fecha_creacion     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alerta_generada (
      id_alerta       BIGINT AUTO_INCREMENT PRIMARY KEY,
      id_regla        VARCHAR(36)  NOT NULL,
      metrica         VARCHAR(50)  NOT NULL,
      valor_medido    DECIMAL(12,2) NOT NULL,
      valor_umbral    DECIMAL(12,2) NOT NULL,
      mensaje         VARCHAR(500) NOT NULL,
      fecha_generada  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atendida        TINYINT(1)   NOT NULL DEFAULT 0,
      atendida_por    VARCHAR(36)  NULL,
      fecha_atendida  DATETIME     NULL,
      INDEX idx_regla (id_regla),
      INDEX idx_atendida (atendida)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('✅ Tablas regla_alerta / alerta_generada listas.');
  process.exit(0);
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
