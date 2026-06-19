-- ============================================================
-- Benchmarking curricular v2
-- Ejecutar en Railway MySQL sobre la base empleabilidad_usil.
-- Nota: si Railway no permite USE, selecciona la BD y ejecuta desde CREATE/ALTER.
-- ============================================================

USE empleabilidad_usil;

CREATE TABLE IF NOT EXISTS universidad_benchmark (
  id_universidad_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_universidad VARCHAR(220) NOT NULL,
  pais VARCHAR(100) NOT NULL DEFAULT 'Peru',
  ciudad VARCHAR(120) NULL,
  tipo_benchmark ENUM('competencia_directa','referente_nacional','competencia_internacional','referente_internacional','referente_tecnologico') NOT NULL,
  sitio_web VARCHAR(500) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tipo_benchmark (tipo_benchmark),
  KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE universidad_benchmark
  MODIFY tipo_benchmark ENUM('competencia_directa','referente_nacional','competencia_internacional','referente_internacional','referente_tecnologico') NOT NULL;

CREATE TABLE IF NOT EXISTS programa_benchmark (
  id_programa_benchmark     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_universidad_benchmark  INT UNSIGNED NOT NULL,
  nombre_programa           VARCHAR(300) NOT NULL,
  url_programa              VARCHAR(1000) NULL,
  carrera_equivalente_id    INT UNSIGNED NULL,
  modalidad                 VARCHAR(100) NULL,
  duracion                  VARCHAR(100) NULL,
  perfil_egreso_texto       MEDIUMTEXT NULL,
  plan_estudios_texto       MEDIUMTEXT NULL,
  fuente_texto_original     MEDIUMTEXT NULL,
  fecha_captura             DATETIME NULL,
  estado_extraccion         ENUM('pendiente','procesado','error','verificado') NOT NULL DEFAULT 'pendiente',
  estado_validacion         ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado',
  observaciones             TEXT NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_univ_bench (id_universidad_benchmark),
  KEY idx_estado_extraccion (estado_extraccion),
  KEY idx_estado_validacion (estado_validacion),
  KEY idx_carrera_equivalente (carrera_equivalente_id),
  CONSTRAINT fk_pb_universidad FOREIGN KEY (id_universidad_benchmark)
    REFERENCES universidad_benchmark(id_universidad_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Si programa_benchmark ya existía y falla por columna duplicada, omite este ALTER.
ALTER TABLE programa_benchmark
  ADD COLUMN estado_validacion ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado' AFTER estado_extraccion;

CREATE TABLE IF NOT EXISTS benchmark_source (
  id_benchmark_source       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_programa_benchmark     INT UNSIGNED NOT NULL,
  tipo_fuente               ENUM('pagina_programa','malla_curricular','plan_estudios','perfil_egreso','competencias','campo_laboral','acreditacion','brochure_pdf','actualizacion_curricular','repositorio','otra') NOT NULL DEFAULT 'pagina_programa',
  titulo                    VARCHAR(300) NOT NULL,
  url                       VARCHAR(1200) NOT NULL,
  estado                    ENUM('registrado','pendiente_extraccion','extraido','pendiente_validacion','validado','rechazado','desactualizado','reemplazado') NOT NULL DEFAULT 'registrado',
  es_fuente_principal       TINYINT(1) NOT NULL DEFAULT 0,
  fecha_captura             DATETIME NULL,
  fecha_validacion          DATETIME NULL,
  validado_por              VARCHAR(160) NULL,
  extractor                 VARCHAR(80) NULL,
  extractor_version         VARCHAR(40) NULL,
  evidencia_resumen         TEXT NULL,
  observaciones             TEXT NULL,
  snapshot_hash             VARCHAR(128) NULL,
  activo                    TINYINT(1) NOT NULL DEFAULT 1,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_benchmark_source_url (id_programa_benchmark, url(255)),
  KEY idx_bs_programa (id_programa_benchmark),
  KEY idx_bs_estado (estado),
  KEY idx_bs_tipo (tipo_fuente),
  CONSTRAINT fk_bs_programa FOREIGN KEY (id_programa_benchmark)
    REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS benchmark_source_candidate (
  id_candidate              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_programa_benchmark     INT UNSIGNED NOT NULL,
  url                       VARCHAR(1200) NOT NULL,
  titulo                    VARCHAR(400) NULL,
  snippet                   TEXT NULL,
  tipo_fuente_detectado     ENUM('pagina_programa','malla_curricular','plan_estudios','perfil_egreso','competencias','brochure_pdf','otra') NOT NULL DEFAULT 'otra',
  score_total               DECIMAL(6,2) NOT NULL DEFAULT 0,
  score_detalle_json        JSON NULL,
  estado                    ENUM('candidato','aprobado','descartado','duplicado','no_oficial') NOT NULL DEFAULT 'candidato',
  motivo                    TEXT NULL,
  buscado_en                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revisado_en               DATETIME NULL,
  revisado_por              VARCHAR(160) NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_candidate_program_url (id_programa_benchmark, url(255)),
  KEY idx_candidate_programa (id_programa_benchmark),
  KEY idx_candidate_estado (estado),
  KEY idx_candidate_score (score_total),
  CONSTRAINT fk_candidate_programa FOREIGN KEY (id_programa_benchmark)
    REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS benchmark_program_equivalence (
  id_equivalence            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_programa_benchmark     INT UNSIGNED NOT NULL,
  nombre_oficial_sugerido   VARCHAR(300) NULL,
  aliases_json              JSON NULL,
  nivel_equivalencia        ENUM('exacta','parcial','cercana','referente','no_equivalente') NOT NULL DEFAULT 'cercana',
  observaciones             TEXT NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_equivalence_programa (id_programa_benchmark),
  CONSTRAINT fk_equivalence_programa FOREIGN KEY (id_programa_benchmark)
    REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
