-- ============================================================
-- TABLAS PARA MOTOR DE IMPACTO CURRICULAR
-- Base de datos: mallas_usil
-- ============================================================

USE mallas_usil;

CREATE TABLE IF NOT EXISTS evidencia_curricular (
  id_evidencia        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  modulo_origen       ENUM('radar','empleabilidad','mercado_laboral','benchmarking') NOT NULL,
  tipo_evidencia      ENUM('senal','tendencia','escenario','oferta_laboral','dato_empleabilidad','benchmark_universitario','informe_carrera') NOT NULL,
  referencia_id       INT UNSIGNED NULL,
  titulo_evidencia    VARCHAR(300) NOT NULL,
  descripcion_evidencia TEXT NULL,
  fuente_url          VARCHAR(1000) NULL,
  fecha_fuente        DATE NULL,
  nivel_confianza     DECIMAL(5,2) NOT NULL DEFAULT 0.50,
  estado_verificacion ENUM('pendiente','verificado','rechazado') NOT NULL DEFAULT 'pendiente',
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ev_modulo (modulo_origen),
  KEY idx_ev_estado (estado_verificacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS impacto_curricular (
  id_impacto        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_carrera        INT UNSIGNED NOT NULL,
  id_malla_version  INT UNSIGNED NOT NULL,
  id_curso          INT UNSIGNED NULL,
  titulo_impacto    VARCHAR(300) NOT NULL,
  descripcion_impacto TEXT NULL,
  nivel_impacto     ENUM('bajo','medio','alto','critico') NOT NULL DEFAULT 'bajo',
  score_impacto     DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  estado            ENUM('detectado','en_revision','aprobado','rechazado') NOT NULL DEFAULT 'detectado',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_imp_carrera (id_carrera),
  KEY idx_imp_malla (id_malla_version),
  KEY idx_imp_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS impacto_curricular_evidencia (
  id_impacto             INT UNSIGNED NOT NULL,
  id_evidencia           INT UNSIGNED NOT NULL,
  peso                   DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  justificacion_relacion TEXT NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_impacto, id_evidencia),
  CONSTRAINT fk_ice_impacto  FOREIGN KEY (id_impacto)  REFERENCES impacto_curricular(id_impacto)  ON DELETE CASCADE,
  CONSTRAINT fk_ice_evidencia FOREIGN KEY (id_evidencia) REFERENCES evidencia_curricular(id_evidencia) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brecha_curricular (
  id_brecha           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_impacto          INT UNSIGNED NOT NULL,
  id_carrera          INT UNSIGNED NOT NULL,
  id_curso            INT UNSIGNED NULL,
  tipo_brecha         ENUM('competencia_faltante','contenido_desactualizado','baja_cobertura','falta_practica','falta_herramienta','desalineacion_mercado','otro') NOT NULL DEFAULT 'otro',
  descripcion_brecha  TEXT NOT NULL,
  competencia_afectada VARCHAR(300) NULL,
  evidencia_resumen   TEXT NULL,
  prioridad           ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_brecha_impacto (id_impacto),
  KEY idx_brecha_carrera (id_carrera),
  KEY idx_brecha_prioridad (prioridad),
  CONSTRAINT fk_brecha_impacto FOREIGN KEY (id_impacto) REFERENCES impacto_curricular(id_impacto) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS propuesta_curricular (
  id_propuesta           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_brecha              INT UNSIGNED NOT NULL,
  id_carrera             INT UNSIGNED NOT NULL,
  id_malla_version_origen INT UNSIGNED NOT NULL,
  tipo_propuesta         ENUM('actualizar_silabo','agregar_unidad','modificar_unidad','aumentar_horas','crear_curso_electivo','crear_curso_obligatorio','mover_curso_ciclo','conectar_cursos','actualizar_competencia') NOT NULL,
  titulo_propuesta       VARCHAR(300) NOT NULL,
  descripcion_propuesta  TEXT NOT NULL,
  justificacion          TEXT NOT NULL,
  impacto_esperado       TEXT NULL,
  estado_revision        ENUM('pendiente','aprobada','rechazada','observada') NOT NULL DEFAULT 'pendiente',
  usuario_creador        VARCHAR(120) NULL,
  usuario_revisor        VARCHAR(120) NULL,
  fecha_revision         DATETIME NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_prop_brecha (id_brecha),
  KEY idx_prop_carrera (id_carrera),
  KEY idx_prop_estado (estado_revision),
  CONSTRAINT fk_prop_brecha FOREIGN KEY (id_brecha) REFERENCES brecha_curricular(id_brecha) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS malla_version_propuesta (
  id_malla_version_propuesta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_malla_version_origen    INT UNSIGNED NOT NULL,
  id_propuesta               INT UNSIGNED NOT NULL,
  nombre_version             VARCHAR(200) NOT NULL,
  descripcion_cambios        TEXT NULL,
  estado                     ENUM('borrador','en_revision','aprobada','rechazada') NOT NULL DEFAULT 'borrador',
  created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mvp_origen (id_malla_version_origen),
  KEY idx_mvp_propuesta (id_propuesta),
  CONSTRAINT fk_mvp_propuesta FOREIGN KEY (id_propuesta) REFERENCES propuesta_curricular(id_propuesta) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
