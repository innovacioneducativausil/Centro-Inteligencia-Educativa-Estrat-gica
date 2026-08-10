USE mallas_usil;

CREATE TABLE IF NOT EXISTS curricular_importacion (
  id_importacion INT UNSIGNED NOT NULL AUTO_INCREMENT,
  archivo_nombre VARCHAR(255) NOT NULL,
  archivo_hash CHAR(64) NOT NULL,
  tipo_archivo VARCHAR(20) NOT NULL DEFAULT 'xlsm',
  plantilla_detectada VARCHAR(80) NULL,
  carrera_detectada VARCHAR(200) NULL,
  modalidad_detectada VARCHAR(80) NULL,
  periodo_aplicacion VARCHAR(20) NULL,
  total_creditos SMALLINT UNSIGNED NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'importado',
  resumen_json JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_importacion),
  KEY idx_curr_imp_hash (archivo_hash),
  KEY idx_curr_imp_carrera (carrera_detectada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The importer adds these columns idempotently when they do not exist:
-- ALTER TABLE malla_version ADD COLUMN periodo_aplicacion VARCHAR(20) NULL;
-- ALTER TABLE malla_version ADD COLUMN modalidad VARCHAR(80) NULL;
-- ALTER TABLE malla_version ADD COLUMN total_creditos SMALLINT UNSIGNED NULL;
-- ALTER TABLE malla_version ADD COLUMN id_importacion INT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS curso_detalle_curricular (
  id_curso INT UNSIGNED NOT NULL,
  codigo_oficial VARCHAR(40) NULL,
  codigo_interno VARCHAR(40) NULL,
  carrera_coordinacion VARCHAR(160) NULL,
  tipo_estudio VARCHAR(80) NULL,
  modalidad_curso VARCHAR(80) NULL,
  horas_teoria_presencial SMALLINT UNSIGNED NULL,
  horas_teoria_virtual SMALLINT UNSIGNED NULL,
  horas_practica_presencial SMALLINT UNSIGNED NULL,
  horas_practica_virtual SMALLINT UNSIGNED NULL,
  horas_lab_presencial SMALLINT UNSIGNED NULL,
  horas_lab_virtual SMALLINT UNSIGNED NULL,
  horas_autonomas SMALLINT UNSIGNED NULL,
  fila_origen SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_curso),
  CONSTRAINT fk_cdc_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS malla_fundamento_curricular (
  id_malla INT UNSIGNED NOT NULL,
  codigo_programa VARCHAR(40) NULL,
  grado_otorgado VARCHAR(220) NULL,
  titulo_otorgado VARCHAR(260) NULL,
  regimen_estudios VARCHAR(80) NULL,
  duracion_meses SMALLINT UNSIGNED NULL,
  fecha_aprobacion VARCHAR(80) NULL,
  objetivo_academico TEXT NULL,
  perfil_ingreso TEXT NULL,
  perfil_egreso TEXT NULL,
  objetivos_educacionales TEXT NULL,
  resumen_plan_json JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_malla),
  CONSTRAINT fk_malla_fundamento_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS competencia_curricular (
  id_competencia INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_malla INT UNSIGNED NOT NULL,
  codigo_competencia VARCHAR(30) NOT NULL,
  nombre_competencia VARCHAR(300) NOT NULL,
  tipo_competencia VARCHAR(40) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_competencia),
  UNIQUE KEY uq_comp_malla_codigo (id_malla, codigo_competencia),
  CONSTRAINT fk_comp_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS competencia_nivel (
  id_nivel INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_competencia INT UNSIGNED NOT NULL,
  nivel TINYINT UNSIGNED NOT NULL,
  etiqueta VARCHAR(60) NULL,
  descripcion TEXT NULL,
  PRIMARY KEY (id_nivel),
  UNIQUE KEY uq_comp_nivel (id_competencia, nivel),
  CONSTRAINT fk_comp_nivel_comp FOREIGN KEY (id_competencia) REFERENCES competencia_curricular(id_competencia) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curso_competencia (
  id_curso INT UNSIGNED NOT NULL,
  id_competencia INT UNSIGNED NOT NULL,
  nivel TINYINT UNSIGNED NOT NULL DEFAULT 0,
  evidencia_textual TEXT NULL,
  PRIMARY KEY (id_curso, id_competencia, nivel),
  CONSTRAINT fk_ccurso_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso) ON DELETE CASCADE,
  CONSTRAINT fk_ccurso_comp FOREIGN KEY (id_competencia) REFERENCES competencia_curricular(id_competencia) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curso_sumilla (
  id_sumilla INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_curso INT UNSIGNED NOT NULL,
  sumilla TEXT NULL,
  resultado_aprendizaje TEXT NULL,
  justificacion TEXT NULL,
  recursos_necesarios TEXT NULL,
  pertinencia_modalidad TEXT NULL,
  metodologia TEXT NULL,
  idoneidad_modalidad TEXT NULL,
  fila_sumilla SMALLINT UNSIGNED NULL,
  fila_matriz SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_sumilla),
  UNIQUE KEY uq_sumilla_curso (id_curso),
  CONSTRAINT fk_sumilla_curso FOREIGN KEY (id_curso) REFERENCES curso(id_curso) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS electivo_catalogo (
  id_electivo INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_malla INT UNSIGNED NOT NULL,
  ciclo_sugerido TINYINT UNSIGNED NULL,
  codigo_oficial VARCHAR(40) NULL,
  codigo_curso VARCHAR(40) NULL,
  nombre_curso VARCHAR(220) NOT NULL,
  carrera_coordinacion VARCHAR(160) NULL,
  tipo_estudio VARCHAR(80) NULL,
  condicion VARCHAR(40) NULL,
  modalidad_curso VARCHAR(80) NULL,
  creditos TINYINT UNSIGNED NULL,
  horas_teoria_presencial SMALLINT UNSIGNED NULL,
  horas_teoria_virtual SMALLINT UNSIGNED NULL,
  horas_practica_presencial SMALLINT UNSIGNED NULL,
  horas_practica_virtual SMALLINT UNSIGNED NULL,
  horas_lab_presencial SMALLINT UNSIGNED NULL,
  horas_lab_virtual SMALLINT UNSIGNED NULL,
  horas_autonomas SMALLINT UNSIGNED NULL,
  prerequisito TEXT NULL,
  creditos_minimos SMALLINT UNSIGNED NULL,
  mencion VARCHAR(180) NULL,
  fila_origen SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_electivo),
  KEY idx_electivo_malla (id_malla),
  CONSTRAINT fk_electivo_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mencion_curricular (
  id_mencion INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_malla INT UNSIGNED NOT NULL,
  codigo_mencion VARCHAR(20) NULL,
  nombre_mencion VARCHAR(220) NOT NULL,
  tipo VARCHAR(40) NOT NULL DEFAULT 'mencion',
  fila_origen SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_mencion),
  UNIQUE KEY uq_mencion_malla_nombre (id_malla, nombre_mencion),
  CONSTRAINT fk_mencion_malla FOREIGN KEY (id_malla) REFERENCES malla_version(id_malla) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mencion_curso (
  id_mencion_curso INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_mencion INT UNSIGNED NOT NULL,
  id_electivo INT UNSIGNED NULL,
  codigo_oficial VARCHAR(40) NULL,
  codigo_curso VARCHAR(40) NULL,
  nombre_curso VARCHAR(220) NOT NULL,
  ciclo TINYINT UNSIGNED NULL,
  condicion VARCHAR(40) NULL,
  nro_orden TINYINT UNSIGNED NULL,
  fila_origen SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_mencion_curso),
  KEY idx_mencion_curso_mencion (id_mencion),
  KEY idx_mencion_curso_electivo (id_electivo),
  CONSTRAINT fk_mencion_curso_mencion FOREIGN KEY (id_mencion) REFERENCES mencion_curricular(id_mencion) ON DELETE CASCADE,
  CONSTRAINT fk_mencion_curso_electivo FOREIGN KEY (id_electivo) REFERENCES electivo_catalogo(id_electivo) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
