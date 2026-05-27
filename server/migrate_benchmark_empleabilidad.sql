-- ============================================================
-- TABLAS PARA BENCHMARKING UNIVERSITARIO
-- Base de datos: empleabilidad_usil
-- ============================================================

USE empleabilidad_usil;

CREATE TABLE IF NOT EXISTS universidad_benchmark (
  id_universidad_benchmark INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_universidad        VARCHAR(220) NOT NULL,
  pais                      VARCHAR(100) NOT NULL DEFAULT 'Peru',
  ciudad                    VARCHAR(120) NULL,
  tipo_benchmark            ENUM('competencia_directa','referente_internacional') NOT NULL,
  sitio_web                 VARCHAR(500) NULL,
  activo                    TINYINT(1) NOT NULL DEFAULT 1,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tipo_benchmark (tipo_benchmark),
  KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  observaciones             TEXT NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_univ_bench (id_universidad_benchmark),
  KEY idx_estado_extraccion (estado_extraccion),
  CONSTRAINT fk_pb_universidad FOREIGN KEY (id_universidad_benchmark)
    REFERENCES universidad_benchmark(id_universidad_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curso_benchmark (
  id_curso_benchmark           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_programa_benchmark        INT UNSIGNED NOT NULL,
  nombre_curso                 VARCHAR(300) NOT NULL,
  ciclo                        VARCHAR(50) NULL,
  area_formacion               VARCHAR(180) NULL,
  descripcion_curso            TEXT NULL,
  competencias_detectadas_json JSON NULL,
  tecnologias_detectadas_json  JSON NULL,
  fuente_url                   VARCHAR(1000) NULL,
  created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cb_programa (id_programa_benchmark),
  CONSTRAINT fk_cb_programa FOREIGN KEY (id_programa_benchmark)
    REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS competencia_benchmark (
  id_competencia_benchmark  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_programa_benchmark     INT UNSIGNED NOT NULL,
  nombre_competencia        VARCHAR(300) NOT NULL,
  descripcion_competencia   TEXT NULL,
  tipo_competencia          ENUM('tecnica','blanda','investigacion','gestion','digital','otro') NOT NULL DEFAULT 'otro',
  evidencia_textual         TEXT NULL,
  fuente_url                VARCHAR(1000) NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_compbench_programa (id_programa_benchmark),
  KEY idx_compbench_tipo (tipo_competencia),
  CONSTRAINT fk_compbench_programa FOREIGN KEY (id_programa_benchmark)
    REFERENCES programa_benchmark(id_programa_benchmark) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
