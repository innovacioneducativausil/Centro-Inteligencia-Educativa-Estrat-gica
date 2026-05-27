-- ============================================================
-- BASE DE DATOS: ESTUDIO DE EMPLEABILIDAD - USIL
-- Motor: MySQL 8.0
-- Años cubiertos: 2022, 2023, 2024, 2025
-- Columnas Excel: "Ac Empl 2022", "Ac Empl 2023", "Ac Empl 2024", "Ac Empl 2025"
-- ============================================================

CREATE DATABASE IF NOT EXISTS empleabilidad_usil
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE empleabilidad_usil;

-- ============================================================
-- CATÁLOGOS
-- ============================================================

CREATE TABLE IF NOT EXISTS facultad (
  id_facultad     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_facultad VARCHAR(150) NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_facultad (nombre_facultad)
) COMMENT = 'Facultades de la universidad';

CREATE TABLE IF NOT EXISTS tipo_programa (
  id_tipo_programa INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  descripcion      VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_tipo_programa (descripcion)
) COMMENT = 'PREGRADO, CPEL, EPG, IE, MAESTRIAS, DOCTORADO';

CREATE TABLE IF NOT EXISTS carrera (
  id_carrera       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_carrera   VARCHAR(200) NOT NULL,
  id_facultad      INT UNSIGNED NOT NULL,
  id_tipo_programa INT UNSIGNED NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_carrera (nombre_carrera, id_tipo_programa),
  CONSTRAINT fk_carrera_facultad      FOREIGN KEY (id_facultad)      REFERENCES facultad (id_facultad),
  CONSTRAINT fk_carrera_tipo_programa FOREIGN KEY (id_tipo_programa) REFERENCES tipo_programa (id_tipo_programa)
) COMMENT = 'Carreras por facultad y tipo de programa';

CREATE TABLE IF NOT EXISTS ciclo_egreso (
  id_ciclo_egreso  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_ciclo     VARCHAR(20)  NOT NULL,
  anio_egreso      SMALLINT     NOT NULL,
  periodo_egreso   VARCHAR(50)  NULL,
  estado_academico VARCHAR(60)  NULL,
  estado           VARCHAR(40)  NULL,
  UNIQUE KEY uq_ciclo (codigo_ciclo)
) COMMENT = 'Ciclos: 2021-2, 2022-0, 2022-1, etc.';

-- Normaliza los rangos salariales que cambiaron entre 2022 y 2025
CREATE TABLE IF NOT EXISTS catalogo_salario (
  id_salario           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  descripcion_original VARCHAR(200) NOT NULL,
  rango_estandar       VARCHAR(80)  NOT NULL,
  rango_min_soles      DECIMAL(10,2) NULL,
  rango_max_soles      DECIMAL(10,2) NULL,
  UNIQUE KEY uq_desc_salario (descripcion_original)
) COMMENT = 'Normaliza variantes de rangos salariales 2022-2025 a un estandar unico';

-- Normaliza texto libre del puesto al puesto oficial + nivel
CREATE TABLE IF NOT EXISTS catalogo_puesto (
  id_puesto        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  texto_busqueda   VARCHAR(200) NOT NULL,
  puesto_oficial   VARCHAR(150) NOT NULL,
  nivel_puesto     VARCHAR(40)  NOT NULL,
  UNIQUE KEY uq_texto_busqueda (texto_busqueda)
) COMMENT = 'Texto libre del egresado -> puesto oficial + nivel Alto/Medio/Operativo';

-- ============================================================
-- TABLA PRINCIPAL: EGRESADO
-- Datos fijos del estudiante (no cambian entre años de encuesta)
-- ============================================================

CREATE TABLE IF NOT EXISTS egresado (
  id_egresado           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo_doc              VARCHAR(20)  NOT NULL DEFAULT 'DNI',
  nro_doc               VARCHAR(20)  NOT NULL,
  apellidos_nombres     VARCHAR(200) NOT NULL,
  sexo                  CHAR(1)      NULL CHECK (sexo IN ('M','F')),
  correo_institucional  VARCHAR(150) NULL,
  correo_personal       VARCHAR(150) NULL,
  telefono_1            VARCHAR(20)  NULL,
  telefono_2            VARCHAR(20)  NULL,
  becario               TINYINT(1)   NOT NULL DEFAULT 0,
  doble_grado           TINYINT(1)   NOT NULL DEFAULT 0,
  intercambio           TINYINT(1)   NOT NULL DEFAULT 0,
  id_carrera            INT UNSIGNED NOT NULL,
  id_ciclo_egreso       INT UNSIGNED NOT NULL,
  periodo_ingreso       VARCHAR(100) NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_egresado_doc (tipo_doc, nro_doc),
  CONSTRAINT fk_egresado_carrera FOREIGN KEY (id_carrera)      REFERENCES carrera (id_carrera),
  CONSTRAINT fk_egresado_ciclo   FOREIGN KEY (id_ciclo_egreso) REFERENCES ciclo_egreso (id_ciclo_egreso)
) COMMENT = 'Datos fijos del egresado: identidad, carrera, ciclo de egreso';

-- ============================================================
-- TABLA CENTRAL: ENCUESTA_ANUAL
-- 1 fila = 1 egresado x 1 año de encuesta
--
-- Mapeo de columnas Excel:
--   "Ac Empl 2022"         -> anio_encuesta=2022, trabaja (0/1)
--   "Ac Empl 2023"         -> anio_encuesta=2023, trabaja (0/1)
--   "Ac Empl 2024"         -> anio_encuesta=2024, trabaja (0/1)
--   "Ac Empl 2025"         -> anio_encuesta=2025, trabaja (0/1)
--   "NIVEL DE PUESTO 20XX" -> nivel_puesto
--   "SALARIO PROMEDIO 20XX"-> id_salario (via catalogo)
--   "Satisfaccion 20XX"    -> satisfaccion_usil
--   "EMPRENDE 20XX"        -> es_emprendedor
--   "Afinidad 20XX"        -> afinidad_laboral
-- ============================================================

CREATE TABLE IF NOT EXISTS encuesta_anual (
  id_encuesta       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_egresado       INT UNSIGNED NOT NULL,

  -- Sufijo del año en la columna Excel: 2022 | 2023 | 2024 | 2025
  anio_encuesta     SMALLINT     NOT NULL,
  trimestre         VARCHAR(5)   NOT NULL DEFAULT 'Q4',

  -- "Ac Empl 20XX" (situacion laboral texto + flag calculado)
  situacion_laboral TEXT         NULL,
  trabaja           TINYINT(1)   NOT NULL DEFAULT 0,

  -- "EMPRENDE 20XX"
  -- NULL = pregunta no incluida en esa encuesta; 0 = respondió No; 1 = respondió Sí
  es_emprendedor    TINYINT(1)   NULL DEFAULT NULL,

  -- "?Tu posicion laboral guarda afinidad?" 20XX
  afinidad_laboral  VARCHAR(10)  NULL,   -- 'SI' | 'NO'

  -- "NIVEL DE PUESTO 20XX"
  nivel_puesto      VARCHAR(40)  NULL,   -- 'Alto' | 'Medio' | 'Operativo'

  -- "SALARIO PROMEDIO 20XX" normalizado
  id_salario        INT UNSIGNED NULL,

  -- "Satisfaccion 20XX"
  satisfaccion_usil VARCHAR(40)  NULL,

  -- 0 = egresado no fue encuestado ese año (fila en blanco en Excel)
  encuestado        TINYINT(1)   NOT NULL DEFAULT 1,
  fuente_carga      VARCHAR(120) NULL,

  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Un egresado solo puede tener 1 registro por anio+trimestre
  UNIQUE KEY uq_encuesta (id_egresado, anio_encuesta, trimestre),
  CONSTRAINT fk_encuesta_egresado FOREIGN KEY (id_egresado) REFERENCES egresado (id_egresado),
  CONSTRAINT fk_encuesta_salario  FOREIGN KEY (id_salario)  REFERENCES catalogo_salario (id_salario)
) COMMENT = '1 fila = 1 egresado x 1 anio. Origen: columnas Ac Empl 2022/2023/2024/2025';

-- ============================================================
-- TABLA: EMPLEO
-- Solo si encuesta_anual.trabaja = 1
-- Mapeo: "Centro Laboral 20XX", "RUBRO 20XX", "Area trabajo 20XX",
--        "PUESTO 20XX", "PUESTO OFICIAL 20XX"
-- ============================================================

CREATE TABLE IF NOT EXISTS empleo (
  id_empleo       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_encuesta     INT UNSIGNED NOT NULL,

  -- "Nombre del centro laboral (Razon Social) 20XX"
  centro_laboral  VARCHAR(200) NULL,

  -- "RUBRO 20XX"
  rubro           VARCHAR(150) NULL,

  -- "Area de trabajo 20XX"
  area_trabajo    VARCHAR(150) NULL,

  -- "PUESTO 20XX" (texto libre del egresado)
  puesto_libre    VARCHAR(200) NULL,

  -- "PUESTO OFICIAL 20XX" -> normalizado via catalogo
  id_puesto       INT UNSIGNED NULL,

  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_empleo_encuesta (id_encuesta),
  CONSTRAINT fk_empleo_encuesta FOREIGN KEY (id_encuesta) REFERENCES encuesta_anual (id_encuesta),
  CONSTRAINT fk_empleo_puesto   FOREIGN KEY (id_puesto)   REFERENCES catalogo_puesto (id_puesto)
) COMMENT = 'Datos laborales por año. Columnas: Centro Laboral/RUBRO/PUESTO 20XX';

-- ============================================================
-- DATOS INICIALES
-- ============================================================

INSERT IGNORE INTO tipo_programa (descripcion) VALUES
  ('PREGRADO'), ('CPEL'), ('EPG'), ('IE'), ('MAESTRIAS'), ('DOCTORADO'), ('SEGUNDA ESPECIALIDAD');

-- Rangos salariales: variantes de 2022, 2023, 2024 y 2025 -> estandar unico
INSERT IGNORE INTO catalogo_salario (descripcion_original, rango_estandar, rango_min_soles, rango_max_soles) VALUES
  -- Estandar actual 2024-2025
  ('Menos de S/. 1,500',                 'Menos de S/. 1,500',                0,      1499.99),
  ('De S/. 1,500 a menos de S/. 3,500',  'De S/. 1,500 a menos de S/. 3,500', 1500,   3499.99),
  ('De S/. 3,500 a menos de S/. 5,500',  'De S/. 3,500 a menos de S/. 5,500', 3500,   5499.99),
  ('De S/. 5,500 a menos de S/. 7,500',  'De S/. 5,500 a menos de S/. 7,500', 5500,   7499.99),
  ('De S/. 7,500 a mas',                 'De S/. 7,500 a mas',                7500,   NULL),
  -- Variantes 2022
  ('Menos de S/. 1,025',                 'Menos de S/. 1,500',                0,      1024.99),
  ('De S/. 1,025 a menos de S/. 1,500',  'Menos de S/. 1,500',                1025,   1499.99),
  ('De S/. 1,500 a menos de S/. 3,000',  'De S/. 1,500 a menos de S/. 3,500', 1500,   2999.99),
  ('De S/. 3,000 a menos de S/. 6,000',  'De S/. 3,500 a menos de S/. 5,500', 3000,   5999.99),
  ('De S/. 6,000 a mas',                 'De S/. 7,500 a mas',                6000,   NULL),
  -- Variantes 2023 (salario minimo)
  ('Sueldo hasta 2 salarios minimos',    'Menos de S/. 1,500',                0,      2049.99),
  ('Sueldo hasta 4 salarios minimos',    'De S/. 1,500 a menos de S/. 3,500', 2050,   4099.99),
  ('Sueldo hasta 6 salarios minimos',    'De S/. 3,500 a menos de S/. 5,500', 4100,   6149.99),
  ('Sueldo mas de 6 salarios minimos',   'De S/. 7,500 a mas',                6150,   NULL),
  -- Variantes 2025
  ('De S/. 6,500 a menos de S/. 8,500',  'De S/. 5,500 a menos de S/. 7,500', 6500,   8499.99),
  ('De S/. 8,500 a mas',                 'De S/. 7,500 a mas',                8500,   NULL),
  -- Rangos granulares S/500 (Excel con más detalle) → agrupados en los 5 rangos canónicos
  ('De S/. 1,500 a menos de S/. 2,500',  'De S/. 1,500 a menos de S/. 3,500', 1500,   2499.99),
  ('De S/. 2,500 a menos de S/. 3,500',  'De S/. 1,500 a menos de S/. 3,500', 2500,   3499.99),
  ('De S/. 3,500 a menos de S/. 4,500',  'De S/. 3,500 a menos de S/. 5,500', 3500,   4499.99),
  ('De S/. 4,500 a menos de S/. 5,500',  'De S/. 3,500 a menos de S/. 5,500', 4500,   5499.99),
  ('De S/. 5,500 a menos de S/. 6,500',  'De S/. 5,500 a menos de S/. 7,500', 5500,   6499.99),
  ('De S/. 6,500 a menos de S/. 7,500',  'De S/. 5,500 a menos de S/. 7,500', 6500,   7499.99),
  ('De S/. 7,500 a más',                  'De S/. 7,500 a mas',                7500,   NULL),
  ('De S/7,500 a menos de S/. 8,500',    'De S/. 7,500 a mas',                7500,   8499.99),
  ('De S/. 8500 a menos de S/. 9,500',   'De S/. 7,500 a mas',                8500,   9499.99),
  ('Más de S/. 9,500',                    'De S/. 7,500 a mas',                9500,   NULL),
  ('Mas de S/. 9,500',                    'De S/. 7,500 a mas',                9500,   NULL),
  -- Variantes con typos / sin punto en "S/"
  ('De S/. 5,500 a menos de S/6,500',    'De S/. 5,500 a menos de S/. 7,500', 5500,   6499.99),
  ('De S/. 6,500 a menos de S/7,500',    'De S/. 5,500 a menos de S/. 7,500', 6500,   7499.99),
  ('De S/7,500 a menos de S/8,500',      'De S/. 7,500 a mas',                7500,   8499.99),
  ('De s/. 1,025 a menos de S/. 1500',   'Menos de S/. 1,500',                1025,   1499.99),
  ('De s/. 1,025 a menos de S/. 1,500',  'Menos de S/. 1,500',                1025,   1499.99);

INSERT IGNORE INTO catalogo_puesto (texto_busqueda, puesto_oficial, nivel_puesto) VALUES
  ('Gerente',       'Gerente(a)',                           'Alto'),
  ('Subgerente',    'Gerente(a)',                           'Alto'),
  ('Director',      'Director(a)',                          'Alto'),
  ('Jefe',          'Jefe(a)',                              'Alto'),
  ('Coordinador',   'Coordinador(a) / Encargado(a)',        'Alto'),
  ('Encargado',     'Coordinador(a) / Encargado(a)',        'Alto'),
  ('Supervisor',    'Supervisor(a)',                        'Alto'),
  ('Administrador', 'Administrador(a)',                     'Alto'),
  ('Consultor',     'Consultor(a)',                         'Alto'),
  ('Analista',      'Analista / Profesional / Especialista','Medio'),
  ('Especialista',  'Analista / Profesional / Especialista','Medio'),
  ('Profesional',   'Analista / Profesional / Especialista','Medio'),
  ('Docente',       'Docente',                              'Medio'),
  ('Investigador',  'Investigador(a)',                      'Medio'),
  ('Asistente',     'Asistente / Auxiliar / Operador',      'Operativo'),
  ('Auxiliar',      'Asistente / Auxiliar / Operador',      'Operativo'),
  ('Operador',      'Asistente / Auxiliar / Operador',      'Operativo'),
  ('Practicante',   'Practicante',                          'Operativo'),
  ('Tecnico',       'Tecnico(a)',                           'Operativo'),
  ('Independiente', 'Independiente / Emprendedor',          'Medio'),
  ('Emprendedor',   'Independiente / Emprendedor',          'Medio');

-- ============================================================
-- VISTAS PARA EL API Y EL DASHBOARD
-- ============================================================

-- KPIs + tasas por año/trimestre/carrera/facultad (alimenta todos los recuadros)
CREATE OR REPLACE VIEW v_resumen_empleabilidad AS
SELECT
  ea.anio_encuesta,
  ea.trimestre,
  f.nombre_facultad,
  tp.descripcion                                               AS tipo_programa,
  c.nombre_carrera,
  ce.codigo_ciclo,
  ce.anio_egreso,
  COUNT(ea.id_encuesta)                                        AS total_encuestados,
  SUM(ea.trabaja)                                              AS total_trabajan,
  ROUND(SUM(ea.trabaja)        * 100.0 / NULLIF(COUNT(ea.id_encuesta),0), 2) AS tasa_empleabilidad,
  SUM(ea.es_emprendedor)                                       AS total_emprendedores,
  ROUND(SUM(ea.es_emprendedor) * 100.0 / NULLIF(COUNT(ea.id_encuesta),0), 2) AS tasa_emprendimiento,
  SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 ELSE 0 END) AS con_afinidad,
  ROUND(SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 ELSE 0 END) * 100.0
        / NULLIF(SUM(ea.trabaja),0), 2)                        AS tasa_afinidad
FROM encuesta_anual ea
JOIN egresado      eg ON ea.id_egresado      = eg.id_egresado
JOIN carrera       c  ON eg.id_carrera       = c.id_carrera
JOIN facultad      f  ON c.id_facultad       = f.id_facultad
JOIN tipo_programa tp ON c.id_tipo_programa  = tp.id_tipo_programa
JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso  = ce.id_ciclo_egreso
WHERE ea.encuestado = 1
GROUP BY ea.anio_encuesta, ea.trimestre,
         f.nombre_facultad, tp.descripcion, c.nombre_carrera,
         ce.codigo_ciclo, ce.anio_egreso;

-- Recuadro: Rango Salarial Promedio
CREATE OR REPLACE VIEW v_rangos_salariales AS
SELECT
  ea.anio_encuesta,
  ea.trimestre,
  cs.rango_estandar,
  cs.rango_min_soles,
  cs.rango_max_soles,
  COUNT(*)                                                      AS total,
  ROUND(COUNT(*) * 100.0 /
    SUM(COUNT(*)) OVER (PARTITION BY ea.anio_encuesta, ea.trimestre), 2) AS porcentaje
FROM encuesta_anual   ea
JOIN catalogo_salario cs ON ea.id_salario = cs.id_salario
WHERE ea.encuestado = 1 AND ea.trabaja = 1
GROUP BY ea.anio_encuesta, ea.trimestre,
         cs.rango_estandar, cs.rango_min_soles, cs.rango_max_soles;

-- Recuadro: Nivel de Puesto
CREATE OR REPLACE VIEW v_nivel_puesto AS
SELECT
  ea.anio_encuesta,
  ea.trimestre,
  ea.nivel_puesto,
  COUNT(*)                                                      AS total,
  ROUND(COUNT(*) * 100.0 /
    SUM(COUNT(*)) OVER (PARTITION BY ea.anio_encuesta, ea.trimestre), 2) AS porcentaje
FROM encuesta_anual ea
WHERE ea.encuestado = 1 AND ea.trabaja = 1 AND ea.nivel_puesto IS NOT NULL
GROUP BY ea.anio_encuesta, ea.trimestre, ea.nivel_puesto;

-- Recuadro: Satisfaccion USIL
CREATE OR REPLACE VIEW v_satisfaccion_usil AS
SELECT
  ea.anio_encuesta,
  ea.trimestre,
  ea.satisfaccion_usil,
  COUNT(*)                                                      AS total,
  ROUND(COUNT(*) * 100.0 /
    SUM(COUNT(*)) OVER (PARTITION BY ea.anio_encuesta, ea.trimestre), 2) AS porcentaje
FROM encuesta_anual ea
WHERE ea.encuestado = 1 AND ea.satisfaccion_usil IS NOT NULL
GROUP BY ea.anio_encuesta, ea.trimestre, ea.satisfaccion_usil;

-- Historial completo por egresado: muestra evolucion 2022-2025
CREATE OR REPLACE VIEW v_historial_egresado AS
SELECT
  eg.nro_doc,
  eg.apellidos_nombres,
  eg.sexo,
  f.nombre_facultad,
  tp.descripcion               AS tipo_programa,
  c.nombre_carrera,
  ce.codigo_ciclo,
  ce.anio_egreso,
  ea.anio_encuesta,
  ea.trimestre,
  ea.trabaja,
  ea.es_emprendedor,
  ea.afinidad_laboral,
  ea.nivel_puesto,
  cs.rango_estandar            AS rango_salarial,
  ea.satisfaccion_usil,
  em.centro_laboral,
  em.rubro,
  em.area_trabajo,
  em.puesto_libre,
  cp.puesto_oficial,
  cp.nivel_puesto              AS nivel_puesto_normalizado
FROM encuesta_anual     ea
JOIN egresado           eg ON ea.id_egresado      = eg.id_egresado
JOIN carrera            c  ON eg.id_carrera       = c.id_carrera
JOIN facultad           f  ON c.id_facultad       = f.id_facultad
JOIN tipo_programa      tp ON c.id_tipo_programa  = tp.id_tipo_programa
JOIN ciclo_egreso       ce ON eg.id_ciclo_egreso  = ce.id_ciclo_egreso
LEFT JOIN empleo          em ON ea.id_encuesta    = em.id_encuesta
LEFT JOIN catalogo_puesto cp ON em.id_puesto      = cp.id_puesto
LEFT JOIN catalogo_salario cs ON ea.id_salario    = cs.id_salario;
