-- ============================================================
-- EMPLEABILIDAD USIL — STORED PROCEDURES
-- Base de datos: empleabilidad_usil
-- Motor: MySQL 8.0
-- Ejecutar con: USE empleabilidad_usil; SOURCE procedures_empl.sql;
-- ============================================================

DELIMITER $$

-- ────────────────────────────────────────────────────────────
-- EGRESADOS / ENCUESTA ANUAL — CONSULTAS
-- Filtros comunes: anio, facultad, carrera, programa, ciclo
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getSatisfaccion $$
CREATE PROCEDURE empl_getSatisfaccion(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50)
)
BEGIN
  SELECT ea.satisfaccion_usil AS nivel, COUNT(*) AS total
  FROM encuesta_anual ea
  JOIN egresado      eg ON ea.id_egresado     = eg.id_egresado
  JOIN carrera       c  ON eg.id_carrera      = c.id_carrera
  JOIN facultad      f  ON c.id_facultad      = f.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY ea.satisfaccion_usil
  ORDER BY FIELD(ea.satisfaccion_usil,'Muy satisfecho','Satisfecho','Indiferente','Insatisfecho','Muy insatisfecho');
END $$

DROP PROCEDURE IF EXISTS empl_getNivelPuesto $$
CREATE PROCEDURE empl_getNivelPuesto(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50)
)
BEGIN
  SELECT ea.nivel_puesto, COUNT(*) AS total
  FROM encuesta_anual ea
  JOIN egresado      eg ON ea.id_egresado     = eg.id_egresado
  JOIN carrera       c  ON eg.id_carrera      = c.id_carrera
  JOIN facultad      f  ON c.id_facultad      = f.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY ea.nivel_puesto
  ORDER BY FIELD(ea.nivel_puesto,'Alto','Medio','Operativo');
END $$

DROP PROCEDURE IF EXISTS empl_getFiltrosEgresados $$
CREATE PROCEDURE empl_getFiltrosEgresados(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50)
)
BEGIN
  -- años disponibles
  SELECT DISTINCT ea.anio_encuesta AS valor
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  ORDER BY ea.anio_encuesta;

  -- facultades disponibles
  SELECT DISTINCT f.nombre_facultad AS valor
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  ORDER BY f.nombre_facultad;

  -- carreras disponibles
  SELECT DISTINCT c.nombre_carrera AS valor
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  ORDER BY c.nombre_carrera;

  -- programas disponibles
  SELECT DISTINCT tp.descripcion AS valor
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  ORDER BY tp.descripcion;

  -- ciclos disponibles
  SELECT DISTINCT ce.codigo_ciclo AS valor, ce.anio_egreso
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
  ORDER BY ce.anio_egreso, ce.codigo_ciclo;
END $$

DROP PROCEDURE IF EXISTS empl_countEgresados $$
CREATE PROCEDURE empl_countEgresados(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50),
  IN p_q        VARCHAR(300)
)
BEGIN
  SELECT COUNT(*) AS total
  FROM encuesta_anual ea
  JOIN egresado      eg ON ea.id_egresado     = eg.id_egresado
  JOIN carrera       c  ON eg.id_carrera      = c.id_carrera
  JOIN facultad      f  ON c.id_facultad      = f.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
    AND (p_q IS NULL OR p_q = ''
         OR eg.apellidos_nombres LIKE CONCAT('%',p_q,'%')
         OR eg.nro_doc LIKE CONCAT('%',p_q,'%'));
END $$

DROP PROCEDURE IF EXISTS empl_listEgresados $$
CREATE PROCEDURE empl_listEgresados(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50),
  IN p_q        VARCHAR(300),
  IN p_limit    INT,
  IN p_offset   INT
)
BEGIN
  SELECT
    eg.nro_doc, eg.apellidos_nombres, eg.correo_institucional,
    c.nombre_carrera AS carrera, f.nombre_facultad AS facultad,
    tp.descripcion   AS programa,
    ea.anio_encuesta AS anio, ea.situacion_laboral, ea.nivel_puesto,
    ea.afinidad_laboral, ea.satisfaccion_usil, ea.es_emprendedor,
    cs.rango_estandar AS salario,
    emp.centro_laboral, emp.rubro, emp.area_trabajo, emp.puesto_libre
  FROM encuesta_anual ea
  JOIN egresado       eg  ON ea.id_egresado     = eg.id_egresado
  JOIN carrera        c   ON eg.id_carrera      = c.id_carrera
  JOIN facultad       f   ON c.id_facultad      = f.id_facultad
  JOIN tipo_programa  tp  ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso   ce  ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  LEFT JOIN catalogo_salario cs  ON ea.id_salario  = cs.id_salario
  LEFT JOIN empleo           emp ON ea.id_encuesta = emp.id_encuesta
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
    AND (p_q IS NULL OR p_q = ''
         OR eg.apellidos_nombres LIKE CONCAT('%',p_q,'%')
         OR eg.nro_doc LIKE CONCAT('%',p_q,'%'))
  ORDER BY ea.anio_encuesta DESC, eg.apellidos_nombres ASC
  LIMIT p_limit OFFSET p_offset;
END $$

-- ────────────────────────────────────────────────────────────
-- MERCADO LABORAL — DATOS EGRESADOS (multi-result)
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getDatosEgresados $$
CREATE PROCEDURE empl_getDatosEgresados(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50)
)
BEGIN
  -- Result 0: resumen general
  SELECT
    COUNT(*) AS totalEncuestas,
    SUM(CASE WHEN ea.trabaja = 1 THEN 1 ELSE 0 END) AS egresadosTrabajando,
    SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 ELSE 0 END) AS egresadosAfinidad,
    SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 ELSE 0 END) AS egresadosEmprendedores,
    ROUND(SUM(CASE WHEN ea.trabaja = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 1) AS tasaEmpleabilidad,
    ROUND(SUM(CASE WHEN ea.afinidad_laboral = 'SI' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 1) AS tasaAfinidad
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  ca ON ca.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = ca.id_facultad
  WHERE
    (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR ca.nombre_carrera = p_carrera)
    AND (p_programa IS NULL OR (SELECT tp.descripcion FROM tipo_programa tp WHERE tp.id_tipo_programa = ca.id_tipo_programa LIMIT 1) = p_programa)
    AND (p_ciclo    IS NULL OR (SELECT ce.codigo_ciclo FROM ciclo_egreso ce WHERE ce.id_ciclo_egreso = eg.id_ciclo_egreso LIMIT 1) = p_ciclo);

  -- Result 1: top 5 puestos
  SELECT COALESCE(cp.puesto_oficial, e.puesto_libre, 'Sin puesto registrado') AS nombre,
         COUNT(*) AS total,
         ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  ca ON ca.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = ca.id_facultad
  JOIN empleo e ON e.id_encuesta = ea.id_encuesta
  LEFT JOIN catalogo_puesto cp ON cp.id_puesto = e.id_puesto
  WHERE ea.trabaja = 1
    AND (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad  = p_facultad)
    AND (p_carrera  IS NULL OR ca.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR (SELECT tp.descripcion FROM tipo_programa tp WHERE tp.id_tipo_programa = ca.id_tipo_programa LIMIT 1) = p_programa)
    AND (p_ciclo    IS NULL OR (SELECT ce.codigo_ciclo FROM ciclo_egreso ce WHERE ce.id_ciclo_egreso = eg.id_ciclo_egreso LIMIT 1) = p_ciclo)
  GROUP BY nombre ORDER BY total DESC LIMIT 5;

  -- Result 2: top 5 rubros
  SELECT COALESCE(NULLIF(e.rubro,''), 'Sin rubro registrado') AS nombre,
         COUNT(*) AS total,
         ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  ca ON ca.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = ca.id_facultad
  JOIN empleo e ON e.id_encuesta = ea.id_encuesta
  WHERE ea.trabaja = 1
    AND (p_anio     IS NULL OR ea.anio_encuesta  = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR ca.nombre_carrera = p_carrera)
    AND (p_programa IS NULL OR (SELECT tp.descripcion FROM tipo_programa tp WHERE tp.id_tipo_programa = ca.id_tipo_programa LIMIT 1) = p_programa)
    AND (p_ciclo    IS NULL OR (SELECT ce.codigo_ciclo FROM ciclo_egreso ce WHERE ce.id_ciclo_egreso = eg.id_ciclo_egreso LIMIT 1) = p_ciclo)
  GROUP BY nombre ORDER BY total DESC LIMIT 5;

  -- Result 3: top 5 áreas de trabajo
  SELECT COALESCE(NULLIF(e.area_trabajo,''), 'Sin área registrada') AS nombre,
         COUNT(*) AS total,
         ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  ca ON ca.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = ca.id_facultad
  JOIN empleo e ON e.id_encuesta = ea.id_encuesta
  WHERE ea.trabaja = 1
    AND (p_anio     IS NULL OR ea.anio_encuesta  = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR ca.nombre_carrera = p_carrera)
    AND (p_programa IS NULL OR (SELECT tp.descripcion FROM tipo_programa tp WHERE tp.id_tipo_programa = ca.id_tipo_programa LIMIT 1) = p_programa)
    AND (p_ciclo    IS NULL OR (SELECT ce.codigo_ciclo FROM ciclo_egreso ce WHERE ce.id_ciclo_egreso = eg.id_ciclo_egreso LIMIT 1) = p_ciclo)
  GROUP BY nombre ORDER BY total DESC LIMIT 5;

  -- Result 4: rangos salariales
  SELECT COALESCE(cs.rango_estandar, 'Sin rango registrado') AS nombre,
         COUNT(*) AS total,
         ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  ca ON ca.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = ca.id_facultad
  LEFT JOIN catalogo_salario cs ON cs.id_salario = ea.id_salario
  WHERE ea.trabaja = 1
    AND (p_anio     IS NULL OR ea.anio_encuesta  = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR ca.nombre_carrera = p_carrera)
    AND (p_programa IS NULL OR (SELECT tp.descripcion FROM tipo_programa tp WHERE tp.id_tipo_programa = ca.id_tipo_programa LIMIT 1) = p_programa)
    AND (p_ciclo    IS NULL OR (SELECT ce.codigo_ciclo FROM ciclo_egreso ce WHERE ce.id_ciclo_egreso = eg.id_ciclo_egreso LIMIT 1) = p_ciclo)
  GROUP BY nombre ORDER BY total DESC LIMIT 5;

  -- Result 5: niveles de puesto
  SELECT COALESCE(NULLIF(ea.nivel_puesto,''), 'Sin nivel registrado') AS nombre,
         COUNT(*) AS total,
         ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS pct
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  ca ON ca.id_carrera  = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = ca.id_facultad
  WHERE ea.trabaja = 1
    AND (p_anio     IS NULL OR ea.anio_encuesta  = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR ca.nombre_carrera = p_carrera)
    AND (p_programa IS NULL OR (SELECT tp.descripcion FROM tipo_programa tp WHERE tp.id_tipo_programa = ca.id_tipo_programa LIMIT 1) = p_programa)
    AND (p_ciclo    IS NULL OR (SELECT ce.codigo_ciclo FROM ciclo_egreso ce WHERE ce.id_ciclo_egreso = eg.id_ciclo_egreso LIMIT 1) = p_ciclo)
  GROUP BY nombre ORDER BY total DESC LIMIT 5;
END $$

-- ────────────────────────────────────────────────────────────
-- MERCADO LABORAL — INFORMES Y METODOLOGÍA
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_loadInforme $$
CREATE PROCEDURE empl_loadInforme(IN p_id INT)
BEGIN
  SELECT orden, nombre_puesto AS nombre, descripcion, vacantes_texto AS vacantes, fuente_dato AS fuenteDato
  FROM mercado_puesto_top WHERE id_informe = p_id ORDER BY orden;

  SELECT id_categoria, orden, categoria, origen_datos AS origenDatos
  FROM mercado_habilidad_categoria WHERE id_informe = p_id ORDER BY orden;

  SELECT hi.id_categoria, hi.orden, hi.habilidad
  FROM mercado_habilidad_item hi
  JOIN mercado_habilidad_categoria hc ON hc.id_categoria = hi.id_categoria
  WHERE hc.id_informe = p_id
  ORDER BY hc.orden, hi.orden;

  SELECT orden, nombre, descripcion, origen_datos AS origenDatos
  FROM mercado_herramienta WHERE id_informe = p_id ORDER BY orden;

  SELECT orden, titulo, descripcion, origen_datos AS origenDatos
  FROM mercado_tendencia WHERE id_informe = p_id ORDER BY orden;

  SELECT tipo, orden, texto, origen_datos AS origenDatos
  FROM mercado_recomendacion WHERE id_informe = p_id ORDER BY tipo, orden;
END $$

DROP PROCEDURE IF EXISTS empl_getFiltrosMercado $$
CREATE PROCEDURE empl_getFiltrosMercado()
BEGIN
  SELECT nombre_facultad, nombre_carrera
  FROM mercado_informe
  WHERE activo = 1
  ORDER BY nombre_facultad, nombre_carrera;
END $$

DROP PROCEDURE IF EXISTS empl_getMetodologia $$
CREATE PROCEDURE empl_getMetodologia()
BEGIN
  SELECT orden, titulo, descripcion
  FROM mercado_metodologia WHERE activo = 1 ORDER BY orden;
END $$

DROP PROCEDURE IF EXISTS empl_getInforme $$
CREATE PROCEDURE empl_getInforme(
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200)
)
BEGIN
  SELECT * FROM mercado_informe
  WHERE (p_facultad IS NULL OR nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR nombre_carrera  = p_carrera)
    AND activo = 1
  ORDER BY nombre_facultad, nombre_carrera
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS empl_listInformesAdmin $$
CREATE PROCEDURE empl_listInformesAdmin()
BEGIN
  SELECT id_informe, nombre_facultad, nombre_carrera, periodo, titulo_header, activo
  FROM mercado_informe
  ORDER BY nombre_facultad, nombre_carrera, periodo DESC;
END $$

DROP PROCEDURE IF EXISTS empl_createInformeAdmin $$
CREATE PROCEDURE empl_createInformeAdmin(
  IN p_facultad    VARCHAR(200),
  IN p_carrera     VARCHAR(200),
  IN p_periodo     VARCHAR(50),
  IN p_titulo      VARCHAR(300),
  IN p_descripcion TEXT
)
BEGIN
  INSERT INTO mercado_informe
    (nombre_facultad, nombre_carrera, periodo, titulo_header, descripcion, fuente, origen_datos, activo)
  VALUES
    (p_facultad, p_carrera, p_periodo, p_titulo, p_descripcion, 'Gestion manual', 'manual', 1);
  SELECT LAST_INSERT_ID() AS id_informe;
END $$

DROP PROCEDURE IF EXISTS empl_updateInformeAdmin $$
CREATE PROCEDURE empl_updateInformeAdmin(
  IN p_id       INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_periodo  VARCHAR(50),
  IN p_titulo   VARCHAR(300),
  IN p_desc     TEXT
)
BEGIN
  UPDATE mercado_informe
  SET nombre_facultad = p_facultad,
      nombre_carrera  = p_carrera,
      periodo         = p_periodo,
      titulo_header   = p_titulo,
      descripcion     = p_desc
  WHERE id_informe = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_setInformeEstado $$
CREATE PROCEDURE empl_setInformeEstado(IN p_id INT, IN p_activo TINYINT)
BEGIN
  UPDATE mercado_informe SET activo = p_activo WHERE id_informe = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_getInformeById $$
CREATE PROCEDURE empl_getInformeById(IN p_id INT)
BEGIN
  SELECT id_informe, nombre_carrera FROM mercado_informe WHERE id_informe = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_listMetodologiaAdmin $$
CREATE PROCEDURE empl_listMetodologiaAdmin()
BEGIN
  SELECT id_metodologia, orden, titulo, descripcion, activo
  FROM mercado_metodologia ORDER BY orden;
END $$

DROP PROCEDURE IF EXISTS empl_upsertMetodologia $$
CREATE PROCEDURE empl_upsertMetodologia(IN p_orden INT, IN p_titulo VARCHAR(300), IN p_desc TEXT)
BEGIN
  INSERT INTO mercado_metodologia (orden, titulo, descripcion, activo)
  VALUES (p_orden, p_titulo, p_desc, 1)
  ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), descripcion = VALUES(descripcion);
END $$

DROP PROCEDURE IF EXISTS empl_updateMetodologia $$
CREATE PROCEDURE empl_updateMetodologia(IN p_id INT, IN p_titulo VARCHAR(300), IN p_desc TEXT)
BEGIN
  UPDATE mercado_metodologia SET titulo = p_titulo, descripcion = p_desc WHERE id_metodologia = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_getMetodologiaById $$
CREATE PROCEDURE empl_getMetodologiaById(IN p_id INT)
BEGIN
  SELECT id_metodologia FROM mercado_metodologia WHERE id_metodologia = p_id;
END $$

-- ────────────────────────────────────────────────────────────
-- BENCHMARKING — UNIVERSIDADES
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getUniversidades $$
CREATE PROCEDURE empl_getUniversidades(
  IN p_activo INT,
  IN p_tipo   VARCHAR(100)
)
BEGIN
  SELECT * FROM universidad_benchmark
  WHERE (p_activo IS NULL OR activo = p_activo)
    AND (p_tipo   IS NULL OR p_tipo = '' OR tipo_benchmark = p_tipo)
  ORDER BY tipo_benchmark, nombre_universidad;
END $$

DROP PROCEDURE IF EXISTS empl_createUniversidad $$
CREATE PROCEDURE empl_createUniversidad(
  IN p_nombre VARCHAR(300),
  IN p_pais   VARCHAR(100),
  IN p_ciudad VARCHAR(100),
  IN p_tipo   VARCHAR(100),
  IN p_web    VARCHAR(500)
)
BEGIN
  INSERT INTO universidad_benchmark (nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web)
  VALUES (p_nombre, p_pais, p_ciudad, p_tipo, p_web);
  SELECT LAST_INSERT_ID() AS id_universidad_benchmark;
END $$

DROP PROCEDURE IF EXISTS empl_updateUniversidad $$
CREATE PROCEDURE empl_updateUniversidad(
  IN p_id     INT,
  IN p_nombre VARCHAR(300),
  IN p_pais   VARCHAR(100),
  IN p_ciudad VARCHAR(100),
  IN p_tipo   VARCHAR(100),
  IN p_web    VARCHAR(500)
)
BEGIN
  UPDATE universidad_benchmark
  SET nombre_universidad = COALESCE(p_nombre, nombre_universidad),
      pais               = COALESCE(p_pais,   pais),
      ciudad             = COALESCE(p_ciudad, ciudad),
      tipo_benchmark     = COALESCE(p_tipo,   tipo_benchmark),
      sitio_web          = COALESCE(p_web,    sitio_web)
  WHERE id_universidad_benchmark = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_deleteUniversidad $$
CREATE PROCEDURE empl_deleteUniversidad(IN p_id INT)
BEGIN
  UPDATE universidad_benchmark SET activo = 0 WHERE id_universidad_benchmark = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_findUniversidadByNombreTipo $$
CREATE PROCEDURE empl_findUniversidadByNombreTipo(IN p_nombre VARCHAR(300), IN p_tipo VARCHAR(100))
BEGIN
  SELECT id_universidad_benchmark
  FROM universidad_benchmark
  WHERE nombre_universidad = p_nombre AND tipo_benchmark = p_tipo
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS empl_insertUniversidad $$
CREATE PROCEDURE empl_insertUniversidad(
  IN p_nombre VARCHAR(300),
  IN p_pais   VARCHAR(100),
  IN p_ciudad VARCHAR(100),
  IN p_tipo   VARCHAR(100),
  IN p_web    VARCHAR(500)
)
BEGIN
  INSERT INTO universidad_benchmark (nombre_universidad, pais, ciudad, tipo_benchmark, sitio_web)
  VALUES (p_nombre, p_pais, p_ciudad, p_tipo, p_web);
  SELECT LAST_INSERT_ID() AS id_universidad_benchmark;
END $$

-- ────────────────────────────────────────────────────────────
-- BENCHMARKING — PROGRAMAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getProgramas $$
CREATE PROCEDURE empl_getProgramas(
  IN p_id_carrera INT,
  IN p_id_univ    INT,
  IN p_tipo       VARCHAR(100)
)
BEGIN
  SELECT pb.*, ub.nombre_universidad, ub.tipo_benchmark, ub.pais
  FROM programa_benchmark pb
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  WHERE (p_id_carrera IS NULL OR pb.carrera_equivalente_id = p_id_carrera)
    AND (p_id_univ    IS NULL OR pb.id_universidad_benchmark = p_id_univ)
    AND (p_tipo IS NULL OR p_tipo = '' OR ub.tipo_benchmark = p_tipo)
    AND ub.activo = 1
  ORDER BY ub.tipo_benchmark, ub.nombre_universidad, pb.nombre_programa;
END $$

DROP PROCEDURE IF EXISTS empl_getPrograma $$
CREATE PROCEDURE empl_getPrograma(IN p_id INT)
BEGIN
  SELECT pb.*, ub.nombre_universidad, ub.tipo_benchmark, ub.pais
  FROM programa_benchmark pb
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  WHERE pb.id_programa_benchmark = p_id;

  SELECT * FROM competencia_benchmark
  WHERE id_programa_benchmark = p_id ORDER BY tipo_competencia, nombre_competencia;

  SELECT * FROM curso_benchmark
  WHERE id_programa_benchmark = p_id ORDER BY ciclo, nombre_curso;

  SELECT * FROM benchmark_source
  WHERE id_programa_benchmark = p_id AND activo = 1
  ORDER BY es_fuente_principal DESC, tipo_fuente, titulo;
END $$

DROP PROCEDURE IF EXISTS empl_createPrograma $$
CREATE PROCEDURE empl_createPrograma(
  IN p_id_univ   INT,
  IN p_nombre    VARCHAR(300),
  IN p_url       VARCHAR(500),
  IN p_id_carrera INT,
  IN p_modalidad VARCHAR(100),
  IN p_duracion  VARCHAR(50)
)
BEGIN
  INSERT INTO programa_benchmark
    (id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, modalidad, duracion)
  VALUES
    (p_id_univ, p_nombre, p_url, p_id_carrera, p_modalidad, p_duracion);
  SELECT LAST_INSERT_ID() AS id_programa_benchmark;
END $$

DROP PROCEDURE IF EXISTS empl_findProgramaByUnivCarreraNombre $$
CREATE PROCEDURE empl_findProgramaByUnivCarreraNombre(IN p_id_univ INT, IN p_id_carrera INT, IN p_nombre VARCHAR(300))
BEGIN
  SELECT id_programa_benchmark
  FROM programa_benchmark
  WHERE id_universidad_benchmark = p_id_univ
    AND carrera_equivalente_id   = p_id_carrera
    AND nombre_programa          = p_nombre
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS empl_insertProgramaBenchmark $$
CREATE PROCEDURE empl_insertProgramaBenchmark(
  IN p_id_univ   INT,
  IN p_nombre    VARCHAR(300),
  IN p_id_carrera INT
)
BEGIN
  INSERT INTO programa_benchmark
    (id_universidad_benchmark, nombre_programa, url_programa, carrera_equivalente_id, estado_validacion, observaciones)
  VALUES
    (p_id_univ, p_nombre, NULL, p_id_carrera, 'registrado',
     'Semilla inicial. Requiere que admin reemplace o complemente con URL oficial especifica de carrera, malla, perfil o plan de estudios.');
  SELECT LAST_INSERT_ID() AS id_programa_benchmark;
END $$

DROP PROCEDURE IF EXISTS empl_getCoberturaStats $$
CREATE PROCEDURE empl_getCoberturaStats()
BEGIN
  SELECT
    pb.carrera_equivalente_id AS id_carrera,
    ub.tipo_benchmark,
    COUNT(DISTINCT pb.id_programa_benchmark) AS total_programas,
    COUNT(DISTINCT bs.id_benchmark_source) AS total_fuentes,
    COUNT(DISTINCT CASE WHEN bs.estado='validado' THEN bs.id_benchmark_source END) AS fuentes_validadas,
    COUNT(DISTINCT CASE WHEN bs.estado IN ('registrado','pendiente_extraccion','extraido','pendiente_validacion') THEN bs.id_benchmark_source END) AS fuentes_pendientes,
    MAX(COALESCE(bs.fecha_validacion, bs.fecha_captura, bs.updated_at, pb.updated_at)) AS ultima_revision
  FROM programa_benchmark pb
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  LEFT JOIN benchmark_source bs ON bs.id_programa_benchmark = pb.id_programa_benchmark AND bs.activo = 1
  WHERE ub.activo = 1 AND pb.carrera_equivalente_id IS NOT NULL
  GROUP BY pb.carrera_equivalente_id, ub.tipo_benchmark;
END $$

DROP PROCEDURE IF EXISTS empl_updateProgramaUrlCurado $$
CREATE PROCEDURE empl_updateProgramaUrlCurado(IN p_id INT, IN p_url VARCHAR(500), IN p_obs TEXT)
BEGIN
  UPDATE programa_benchmark SET url_programa = p_url, observaciones = p_obs WHERE id_programa_benchmark = p_id;
END $$

-- ────────────────────────────────────────────────────────────
-- BENCHMARKING — FUENTES
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_upsertBenchmarkSource $$
CREATE PROCEDURE empl_upsertBenchmarkSource(
  IN p_id_prog         INT,
  IN p_tipo_fuente     VARCHAR(100),
  IN p_titulo          VARCHAR(500),
  IN p_url             VARCHAR(1000),
  IN p_estado          VARCHAR(50),
  IN p_es_principal    TINYINT,
  IN p_evidencia       TEXT,
  IN p_observaciones   TEXT
)
BEGIN
  INSERT INTO benchmark_source
    (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, evidencia_resumen, observaciones)
  VALUES
    (p_id_prog, p_tipo_fuente, p_titulo, p_url, p_estado, p_es_principal, p_evidencia, p_observaciones)
  ON DUPLICATE KEY UPDATE
    tipo_fuente       = VALUES(tipo_fuente),
    titulo            = VALUES(titulo),
    estado            = VALUES(estado),
    es_fuente_principal = VALUES(es_fuente_principal),
    evidencia_resumen = VALUES(evidencia_resumen),
    observaciones     = VALUES(observaciones),
    activo            = 1;
  SELECT LAST_INSERT_ID() AS id_benchmark_source;
END $$

DROP PROCEDURE IF EXISTS empl_insertBenchmarkSourceIgnore $$
CREATE PROCEDURE empl_insertBenchmarkSourceIgnore(
  IN p_id_prog    INT,
  IN p_tipo       VARCHAR(100),
  IN p_titulo     VARCHAR(500),
  IN p_url        VARCHAR(1000),
  IN p_obs        TEXT
)
BEGIN
  INSERT IGNORE INTO benchmark_source
    (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
  VALUES
    (p_id_prog, p_tipo, p_titulo, p_url, 'registrado', 1, p_obs);
END $$

DROP PROCEDURE IF EXISTS empl_getFuentes $$
CREATE PROCEDURE empl_getFuentes(IN p_id_prog INT)
BEGIN
  SELECT * FROM benchmark_source
  WHERE id_programa_benchmark = p_id_prog AND activo = 1
  ORDER BY es_fuente_principal DESC, tipo_fuente, titulo;
END $$

DROP PROCEDURE IF EXISTS empl_updateFuente $$
CREATE PROCEDURE empl_updateFuente(
  IN p_id      INT,
  IN p_estado  VARCHAR(50),
  IN p_titulo  VARCHAR(500),
  IN p_url     VARCHAR(1000),
  IN p_tipo    VARCHAR(100),
  IN p_obs     TEXT
)
BEGIN
  UPDATE benchmark_source
  SET estado      = COALESCE(p_estado, estado),
      titulo      = COALESCE(p_titulo, titulo),
      url         = COALESCE(p_url,    url),
      tipo_fuente = COALESCE(p_tipo,   tipo_fuente),
      observaciones = COALESCE(p_obs,  observaciones)
  WHERE id_benchmark_source = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_findExistingBenchmarkSource $$
CREATE PROCEDURE empl_findExistingBenchmarkSource(IN p_id_prog INT, IN p_url VARCHAR(1000))
BEGIN
  SELECT id_benchmark_source
  FROM benchmark_source
  WHERE id_programa_benchmark = p_id_prog AND url = p_url AND activo = 1
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS empl_insertBenchmarkSource $$
CREATE PROCEDURE empl_insertBenchmarkSource(
  IN p_id_prog INT,
  IN p_tipo    VARCHAR(100),
  IN p_titulo  VARCHAR(500),
  IN p_url     VARCHAR(1000),
  IN p_obs     TEXT
)
BEGIN
  INSERT INTO benchmark_source
    (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
  VALUES
    (p_id_prog, p_tipo, p_titulo, p_url, 'pendiente_extraccion', 1, p_obs)
  ON DUPLICATE KEY UPDATE
    tipo_fuente = VALUES(tipo_fuente),
    titulo      = VALUES(titulo),
    activo      = 1,
    es_fuente_principal = 1,
    observaciones = VALUES(observaciones);
  SELECT LAST_INSERT_ID() AS id_benchmark_source;
END $$

DROP PROCEDURE IF EXISTS empl_getFuentesByProgramas $$
CREATE PROCEDURE empl_getFuentesByProgramas(IN p_ids_json JSON)
BEGIN
  SELECT id_programa_benchmark, tipo_fuente, titulo, url, estado
  FROM benchmark_source
  WHERE activo = 1
    AND id_programa_benchmark IN (
      SELECT jt.v FROM JSON_TABLE(p_ids_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt
    );
END $$

-- ────────────────────────────────────────────────────────────
-- BENCHMARKING — CANDIDATOS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getCandidatos $$
CREATE PROCEDURE empl_getCandidatos(IN p_id_prog INT, IN p_incluir_historial TINYINT)
BEGIN
  SELECT *
  FROM benchmark_source_candidate
  WHERE id_programa_benchmark = p_id_prog
    AND (p_incluir_historial = 1 OR estado IN ('candidato','aprobado'))
  ORDER BY
    CASE estado WHEN 'candidato' THEN 0 WHEN 'aprobado' THEN 1 ELSE 2 END,
    score_total DESC,
    buscado_en DESC;
END $$

DROP PROCEDURE IF EXISTS empl_getCandidatoWithPrograma $$
CREATE PROCEDURE empl_getCandidatoWithPrograma(IN p_id INT)
BEGIN
  SELECT c.*, pb.id_programa_benchmark, pb.nombre_programa
  FROM benchmark_source_candidate c
  JOIN programa_benchmark pb ON pb.id_programa_benchmark = c.id_programa_benchmark
  WHERE c.id_candidate = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_demoteCandidatosAprobados $$
CREATE PROCEDURE empl_demoteCandidatosAprobados(IN p_id_prog INT, IN p_exclude_id INT)
BEGIN
  UPDATE benchmark_source_candidate
  SET estado = 'candidato'
  WHERE id_programa_benchmark = p_id_prog AND id_candidate <> p_exclude_id AND estado = 'aprobado';
END $$

DROP PROCEDURE IF EXISTS empl_approveCandidato $$
CREATE PROCEDURE empl_approveCandidato(IN p_id INT, IN p_usuario VARCHAR(200))
BEGIN
  UPDATE benchmark_source_candidate
  SET estado = 'aprobado', revisado_en = NOW(), revisado_por = p_usuario
  WHERE id_candidate = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_discardCandidato $$
CREATE PROCEDURE empl_discardCandidato(IN p_id INT, IN p_motivo TEXT, IN p_usuario VARCHAR(200))
BEGIN
  UPDATE benchmark_source_candidate
  SET estado      = 'descartado',
      motivo      = COALESCE(p_motivo, motivo),
      revisado_en = NOW(),
      revisado_por = p_usuario
  WHERE id_candidate = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_updateProgramaAprobado $$
CREATE PROCEDURE empl_updateProgramaAprobado(IN p_id_prog INT, IN p_url VARCHAR(500), IN p_score DECIMAL(5,2))
BEGIN
  UPDATE programa_benchmark
  SET url_programa      = p_url,
      estado_extraccion = 'pendiente',
      observaciones     = CONCAT('Fuente aprobada por admin desde candidatos. Score ', p_score, '.')
  WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_getCandidatosByProgramas $$
CREATE PROCEDURE empl_getCandidatosByProgramas(IN p_ids_json JSON)
BEGIN
  SELECT id_programa_benchmark, titulo, url, estado
  FROM benchmark_source_candidate
  WHERE estado IN ('candidato','aprobado')
    AND id_programa_benchmark IN (
      SELECT jt.v FROM JSON_TABLE(p_ids_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt
    );
END $$

-- ────────────────────────────────────────────────────────────
-- BENCHMARKING — COMPARACIÓN Y EQUIVALENCIAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_upsertEquivalencia $$
CREATE PROCEDURE empl_upsertEquivalencia(
  IN p_id_prog    INT,
  IN p_nombre     VARCHAR(300),
  IN p_aliases    JSON,
  IN p_nivel      VARCHAR(50),
  IN p_obs        TEXT
)
BEGIN
  INSERT INTO benchmark_program_equivalence
    (id_programa_benchmark, nombre_oficial_sugerido, aliases_json, nivel_equivalencia, observaciones)
  VALUES
    (p_id_prog, p_nombre, p_aliases, p_nivel, p_obs)
  ON DUPLICATE KEY UPDATE
    nombre_oficial_sugerido = VALUES(nombre_oficial_sugerido),
    aliases_json            = VALUES(aliases_json),
    nivel_equivalencia      = VALUES(nivel_equivalencia),
    observaciones           = VALUES(observaciones);
END $$

DROP PROCEDURE IF EXISTS empl_getCompararData $$
CREATE PROCEDURE empl_getCompararData(IN p_id_carrera INT)
BEGIN
  SELECT cb.nombre_competencia, cb.tipo_competencia,
         pb.nombre_programa, pb.url_programa, pb.estado_extraccion, pb.fecha_captura,
         ub.nombre_universidad, ub.pais, ub.tipo_benchmark
  FROM competencia_benchmark cb
  JOIN programa_benchmark pb ON pb.id_programa_benchmark = cb.id_programa_benchmark
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  WHERE pb.carrera_equivalente_id = p_id_carrera AND ub.activo = 1
  ORDER BY ub.tipo_benchmark, ub.nombre_universidad, cb.tipo_competencia, cb.nombre_competencia;

  SELECT cu.nombre_curso, cu.area_formacion,
         pb.nombre_programa,
         ub.nombre_universidad, ub.tipo_benchmark
  FROM curso_benchmark cu
  JOIN programa_benchmark pb ON pb.id_programa_benchmark = cu.id_programa_benchmark
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  WHERE pb.carrera_equivalente_id = p_id_carrera AND ub.activo = 1
  ORDER BY ub.tipo_benchmark, ub.nombre_universidad, cu.area_formacion;
END $$

DROP PROCEDURE IF EXISTS empl_getCompararByTipo $$
CREATE PROCEDURE empl_getCompararByTipo(IN p_id_carrera INT, IN p_tipo VARCHAR(100))
BEGIN
  SELECT cb.nombre_competencia, cb.tipo_competencia, cb.evidencia_textual,
         pb.nombre_programa, pb.url_programa, pb.estado_extraccion, pb.fecha_captura,
         ub.nombre_universidad, ub.pais, ub.tipo_benchmark
  FROM competencia_benchmark cb
  JOIN programa_benchmark pb ON pb.id_programa_benchmark = cb.id_programa_benchmark
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  WHERE pb.carrera_equivalente_id = p_id_carrera AND ub.tipo_benchmark = p_tipo AND ub.activo = 1
  ORDER BY ub.nombre_universidad, cb.tipo_competencia, cb.nombre_competencia;

  SELECT pb.id_programa_benchmark, pb.id_universidad_benchmark, pb.nombre_programa, pb.url_programa,
         pb.estado_extraccion, pb.fecha_captura, pb.duracion, pb.modalidad, pb.estado_validacion,
         ub.nombre_universidad, ub.pais, ub.tipo_benchmark,
         COUNT(cb.id_competencia_benchmark)                                                      AS total_competencias,
         COUNT(DISTINCT cu.id_curso_benchmark)                                                  AS total_cursos,
         COUNT(DISTINCT bs.id_benchmark_source)                                                 AS total_fuentes,
         COUNT(DISTINCT CASE WHEN bs.estado='validado' THEN bs.id_benchmark_source END)         AS fuentes_validadas,
         COUNT(DISTINCT CASE WHEN bs.estado IN ('registrado','pendiente_extraccion','extraido','pendiente_validacion') THEN bs.id_benchmark_source END) AS fuentes_pendientes,
         COUNT(DISTINCT CASE WHEN bsc.estado IN ('candidato','aprobado') THEN bsc.id_candidate END) AS total_candidatos
  FROM programa_benchmark pb
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  LEFT JOIN competencia_benchmark cb ON cb.id_programa_benchmark = pb.id_programa_benchmark
  LEFT JOIN curso_benchmark cu ON cu.id_programa_benchmark = pb.id_programa_benchmark
  LEFT JOIN benchmark_source bs ON bs.id_programa_benchmark = pb.id_programa_benchmark AND bs.activo = 1
  LEFT JOIN benchmark_source_candidate bsc ON bsc.id_programa_benchmark = pb.id_programa_benchmark
  WHERE pb.carrera_equivalente_id = p_id_carrera AND ub.tipo_benchmark = p_tipo AND ub.activo = 1
  GROUP BY pb.id_programa_benchmark, pb.id_universidad_benchmark, pb.nombre_programa, pb.url_programa,
           pb.estado_extraccion, pb.fecha_captura, pb.duracion, pb.modalidad, pb.estado_validacion,
           ub.nombre_universidad, ub.pais, ub.tipo_benchmark
  ORDER BY ub.nombre_universidad;
END $$

DROP PROCEDURE IF EXISTS empl_getCursosByProgramas $$
CREATE PROCEDURE empl_getCursosByProgramas(IN p_ids_json JSON)
BEGIN
  SELECT id_programa_benchmark, nombre_curso, ciclo, area_formacion, descripcion_curso, fuente_url
  FROM curso_benchmark
  WHERE id_programa_benchmark IN (
    SELECT jt.v FROM JSON_TABLE(p_ids_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt
  )
  ORDER BY
    CASE WHEN ciclo REGEXP '^[0-9]+$' THEN 0 WHEN ciclo IS NULL OR ciclo = '' THEN 2 ELSE 1 END,
    CAST(NULLIF(ciclo, '') AS UNSIGNED),
    ciclo,
    nombre_curso;
END $$

-- ────────────────────────────────────────────────────────────
-- SCRAPING — CANDIDATOS Y FUENTES
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_setCandidatosDuplicado $$
CREATE PROCEDURE empl_setCandidatosDuplicado(IN p_id_prog INT)
BEGIN
  UPDATE benchmark_source_candidate
  SET estado = 'duplicado'
  WHERE id_programa_benchmark = p_id_prog AND estado = 'candidato';
END $$

DROP PROCEDURE IF EXISTS empl_upsertCuratedSource $$
CREATE PROCEDURE empl_upsertCuratedSource(
  IN p_id_prog     INT,
  IN p_tipo_fuente VARCHAR(100),
  IN p_titulo      VARCHAR(500),
  IN p_url         VARCHAR(1000),
  IN p_obs         TEXT
)
BEGIN
  INSERT INTO benchmark_source
    (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
  VALUES
    (p_id_prog, p_tipo_fuente, p_titulo, p_url, 'pendiente_validacion', 1, p_obs)
  ON DUPLICATE KEY UPDATE
    tipo_fuente       = VALUES(tipo_fuente),
    titulo            = VALUES(titulo),
    estado            = 'pendiente_validacion',
    es_fuente_principal = 1,
    observaciones     = VALUES(observaciones),
    activo            = 1;
END $$

DROP PROCEDURE IF EXISTS empl_upsertCuratedCandidate $$
CREATE PROCEDURE empl_upsertCuratedCandidate(
  IN p_id_prog    INT,
  IN p_url        VARCHAR(1000),
  IN p_titulo     VARCHAR(500),
  IN p_tipo       VARCHAR(100),
  IN p_score_json JSON,
  IN p_motivo     TEXT
)
BEGIN
  INSERT INTO benchmark_source_candidate
    (id_programa_benchmark, url, titulo, snippet, tipo_fuente_detectado,
     score_total, score_detalle_json, estado, motivo)
  VALUES
    (p_id_prog, p_url, p_titulo,
     'URL curada desde mapa base de benchmarking; pendiente de validacion academica.',
     p_tipo, 100, p_score_json, 'aprobado', p_motivo)
  ON DUPLICATE KEY UPDATE
    titulo              = VALUES(titulo),
    tipo_fuente_detectado = VALUES(tipo_fuente_detectado),
    score_total         = 100,
    score_detalle_json  = VALUES(score_detalle_json),
    estado              = 'aprobado',
    motivo              = VALUES(motivo),
    buscado_en          = NOW(),
    updated_at          = CURRENT_TIMESTAMP;
END $$

DROP PROCEDURE IF EXISTS empl_upsertCandidate $$
CREATE PROCEDURE empl_upsertCandidate(
  IN p_id_prog    INT,
  IN p_url        VARCHAR(1000),
  IN p_titulo     VARCHAR(500),
  IN p_snippet    TEXT,
  IN p_tipo       VARCHAR(100),
  IN p_score      DECIMAL(5,2),
  IN p_score_json JSON,
  IN p_motivo     TEXT
)
BEGIN
  INSERT INTO benchmark_source_candidate
    (id_programa_benchmark, url, titulo, snippet, tipo_fuente_detectado,
     score_total, score_detalle_json, estado, motivo)
  VALUES
    (p_id_prog, p_url, p_titulo, p_snippet, p_tipo,
     p_score, p_score_json, 'candidato', p_motivo)
  ON DUPLICATE KEY UPDATE
    titulo              = VALUES(titulo),
    snippet             = VALUES(snippet),
    tipo_fuente_detectado = VALUES(tipo_fuente_detectado),
    score_total         = VALUES(score_total),
    score_detalle_json  = VALUES(score_detalle_json),
    estado              = 'candidato',
    motivo              = VALUES(motivo),
    buscado_en          = NOW(),
    updated_at          = CURRENT_TIMESTAMP;
END $$

DROP PROCEDURE IF EXISTS empl_updateProgramaUrlAndObservaciones $$
CREATE PROCEDURE empl_updateProgramaUrlAndObservaciones(IN p_id_prog INT, IN p_url VARCHAR(500), IN p_obs TEXT)
BEGIN
  UPDATE programa_benchmark
  SET url_programa = p_url, estado_extraccion = 'pendiente', observaciones = p_obs
  WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_updateProgramaObservaciones $$
CREATE PROCEDURE empl_updateProgramaObservaciones(IN p_id_prog INT, IN p_obs TEXT)
BEGIN
  UPDATE programa_benchmark SET observaciones = p_obs WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_getCreatedBenchmarkSource $$
CREATE PROCEDURE empl_getCreatedBenchmarkSource(IN p_id_prog INT, IN p_url VARCHAR(1000))
BEGIN
  SELECT id_benchmark_source
  FROM benchmark_source
  WHERE id_programa_benchmark = p_id_prog AND url = p_url AND activo = 1
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS empl_insertSourceSnapshot $$
CREATE PROCEDURE empl_insertSourceSnapshot(
  IN p_id_source      INT,
  IN p_id_prog        INT,
  IN p_url            VARCHAR(1000),
  IN p_url_final      VARCHAR(1000),
  IN p_titulo         VARCHAR(500),
  IN p_texto          LONGTEXT,
  IN p_hash           VARCHAR(64),
  IN p_parser         VARCHAR(100),
  IN p_estado_parseo  VARCHAR(50),
  IN p_cursos         INT,
  IN p_obs            TEXT
)
BEGIN
  INSERT INTO benchmark_source_snapshot
    (id_benchmark_source, id_programa_benchmark, url, url_final, titulo, texto_extraido,
     hash_contenido, parser_usado, estado_parseo, cursos_detectados, observaciones)
  VALUES
    (p_id_source, p_id_prog, p_url, COALESCE(p_url_final, p_url),
     p_titulo, p_texto, p_hash, p_parser,
     COALESCE(p_estado_parseo, 'sin_parsear'), COALESCE(p_cursos, 0), p_obs);
  SELECT LAST_INSERT_ID() AS id_snapshot;
END $$

DROP PROCEDURE IF EXISTS empl_insertParseLog $$
CREATE PROCEDURE empl_insertParseLog(
  IN p_id_prog   INT,
  IN p_id_snap   INT,
  IN p_parser    VARCHAR(100),
  IN p_estado    VARCHAR(50),
  IN p_cursos    INT,
  IN p_detalle   TEXT
)
BEGIN
  INSERT INTO benchmark_parse_log
    (id_programa_benchmark, id_snapshot, parser_usado, estado, cursos_detectados, detalle)
  VALUES
    (p_id_prog, p_id_snap,
     COALESCE(p_parser, 'sin_parser'),
     COALESCE(p_estado, 'requiere_revision'),
     COALESCE(p_cursos, 0), p_detalle);
END $$

DROP PROCEDURE IF EXISTS empl_deleteCursosBenchmark $$
CREATE PROCEDURE empl_deleteCursosBenchmark(IN p_id_prog INT)
BEGIN
  DELETE FROM curso_benchmark WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_insertCursoBenchmark $$
CREATE PROCEDURE empl_insertCursoBenchmark(
  IN p_id_prog    INT,
  IN p_nombre     VARCHAR(300),
  IN p_ciclo      VARCHAR(50),
  IN p_area       VARCHAR(100),
  IN p_desc       TEXT,
  IN p_fuente_url VARCHAR(1000)
)
BEGIN
  INSERT INTO curso_benchmark
    (id_programa_benchmark, nombre_curso, ciclo, area_formacion, descripcion_curso, fuente_url)
  VALUES
    (p_id_prog, p_nombre, p_ciclo, p_area, p_desc, p_fuente_url);
END $$

DROP PROCEDURE IF EXISTS empl_updateBenchmarkSourceAfterExtraction $$
CREATE PROCEDURE empl_updateBenchmarkSourceAfterExtraction(
  IN p_id_source    INT,
  IN p_estado       VARCHAR(50),
  IN p_evidencia    TEXT,
  IN p_snapshot_hash VARCHAR(64)
)
BEGIN
  UPDATE benchmark_source
  SET estado            = p_estado,
      fecha_captura     = NOW(),
      extractor         = 'selenium',
      extractor_version = 'malla_v1',
      evidencia_resumen = p_evidencia,
      snapshot_hash     = p_snapshot_hash
  WHERE id_benchmark_source = p_id_source;
END $$

DROP PROCEDURE IF EXISTS empl_updateProgramaAfterExtraction $$
CREATE PROCEDURE empl_updateProgramaAfterExtraction(
  IN p_id_prog INT,
  IN p_texto   LONGTEXT,
  IN p_url     VARCHAR(500),
  IN p_obs     TEXT
)
BEGIN
  UPDATE programa_benchmark
  SET fuente_texto_original = p_texto,
      url_programa          = COALESCE(NULLIF(p_url,''), url_programa),
      fecha_captura         = NOW(),
      estado_extraccion     = 'procesado',
      observaciones         = p_obs
  WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_setScrapingStatus $$
CREATE PROCEDURE empl_setScrapingStatus(IN p_id_prog INT, IN p_estado VARCHAR(50), IN p_obs TEXT)
BEGIN
  UPDATE programa_benchmark SET estado_extraccion = p_estado, observaciones = p_obs WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_getProgramaUrl $$
CREATE PROCEDURE empl_getProgramaUrl(IN p_id_prog INT)
BEGIN
  SELECT id_programa_benchmark, url_programa FROM programa_benchmark WHERE id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_getProgramaWithEquivalencia $$
CREATE PROCEDURE empl_getProgramaWithEquivalencia(IN p_id_prog INT)
BEGIN
  SELECT pb.id_programa_benchmark, pb.nombre_programa, pb.url_programa,
         ub.nombre_universidad, ub.sitio_web,
         bpe.nombre_oficial_sugerido, bpe.aliases_json
  FROM programa_benchmark pb
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  LEFT JOIN benchmark_program_equivalence bpe ON bpe.id_programa_benchmark = pb.id_programa_benchmark
  WHERE pb.id_programa_benchmark = p_id_prog;
END $$

-- ────────────────────────────────────────────────────────────
-- NORMALIZACIÓN IA
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getProgramaForNormalizacion $$
CREATE PROCEDURE empl_getProgramaForNormalizacion(IN p_id_prog INT)
BEGIN
  SELECT pb.id_programa_benchmark, pb.nombre_programa, pb.fuente_texto_original,
         pb.url_programa, ub.nombre_universidad
  FROM programa_benchmark pb
  JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
  WHERE pb.id_programa_benchmark = p_id_prog;
END $$

DROP PROCEDURE IF EXISTS empl_getCursosBenchmark $$
CREATE PROCEDURE empl_getCursosBenchmark(IN p_id_prog INT)
BEGIN
  SELECT nombre_curso, ciclo, descripcion_curso, fuente_url
  FROM curso_benchmark
  WHERE id_programa_benchmark = p_id_prog
  ORDER BY
    CASE WHEN ciclo REGEXP '^[0-9]+$' THEN 0 WHEN ciclo IS NULL OR ciclo = '' THEN 2 ELSE 1 END,
    CAST(NULLIF(ciclo, '') AS UNSIGNED),
    ciclo,
    nombre_curso;
END $$

DROP PROCEDURE IF EXISTS empl_executeNormalizacion $$
CREATE PROCEDURE empl_executeNormalizacion(
  IN p_id_prog              INT,
  IN p_competencias_json    JSON,
  IN p_cursos_json          JSON,
  IN p_texto_curricular     LONGTEXT,
  IN p_fuente_texto_orig    LONGTEXT,
  IN p_perfil_egreso        TEXT,
  IN p_url_programa         VARCHAR(1000)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  -- Limpiar competencias previas
  DELETE FROM competencia_benchmark WHERE id_programa_benchmark = p_id_prog;

  -- Insertar competencias nuevas desde JSON array [{nombre, tipo}]
  IF JSON_LENGTH(p_competencias_json) > 0 THEN
    INSERT INTO competencia_benchmark (id_programa_benchmark, nombre_competencia, tipo_competencia, fuente_url)
    SELECT p_id_prog,
           LEFT(jt.nombre, 299),
           jt.tipo,
           p_url_programa
    FROM JSON_TABLE(p_competencias_json, '$[*]' COLUMNS(
      nombre VARCHAR(300) PATH '$.nombre',
      tipo   VARCHAR(50)  PATH '$.tipo'
    )) AS jt
    WHERE jt.nombre IS NOT NULL AND jt.nombre <> 'no_identificado';
  END IF;

  -- Limpiar cursos previos
  DELETE FROM curso_benchmark WHERE id_programa_benchmark = p_id_prog;

  -- Insertar cursos nuevos desde JSON array [{nombre, ciclo, area, evidencia, competencias_json, tecnologias_json}]
  IF JSON_LENGTH(p_cursos_json) > 0 AND p_texto_curricular <> p_fuente_texto_orig THEN
    UPDATE programa_benchmark
    SET fuente_texto_original = LEFT(p_texto_curricular, 120000), fecha_captura = NOW()
    WHERE id_programa_benchmark = p_id_prog;
  END IF;

  IF JSON_LENGTH(p_cursos_json) > 0 THEN
    INSERT INTO curso_benchmark
      (id_programa_benchmark, nombre_curso, ciclo, area_formacion, descripcion_curso,
       competencias_detectadas_json, tecnologias_detectadas_json, fuente_url)
    SELECT p_id_prog,
           LEFT(jt.nombre, 299),
           jt.ciclo,
           jt.area,
           jt.evidencia,
           jt.competencias_json,
           jt.tecnologias_json,
           p_url_programa
    FROM JSON_TABLE(p_cursos_json, '$[*]' COLUMNS(
      nombre           VARCHAR(300) PATH '$.nombre',
      ciclo            VARCHAR(50)  PATH '$.ciclo',
      area             VARCHAR(100) PATH '$.area',
      evidencia        TEXT         PATH '$.evidencia',
      competencias_json JSON        PATH '$.competencias_json',
      tecnologias_json  JSON        PATH '$.tecnologias_json'
    )) AS jt;
  END IF;

  -- Actualizar estado del programa
  UPDATE programa_benchmark
  SET perfil_egreso_texto = p_perfil_egreso,
      estado_extraccion   = IF(
        (SELECT COUNT(*) FROM curso_benchmark        WHERE id_programa_benchmark = p_id_prog) > 0
        OR
        (SELECT COUNT(*) FROM competencia_benchmark  WHERE id_programa_benchmark = p_id_prog) > 0,
        'verificado', 'procesado'
      ),
      updated_at = NOW()
  WHERE id_programa_benchmark = p_id_prog;

  COMMIT;

  -- Devolver conteos resultantes
  SELECT
    (SELECT COUNT(*) FROM curso_benchmark       WHERE id_programa_benchmark = p_id_prog) AS cursos,
    (SELECT COUNT(*) FROM competencia_benchmark WHERE id_programa_benchmark = p_id_prog) AS competencias;
END $$

-- ────────────────────────────────────────────────────────────
-- EGRESADOS — STATS TAB (multi-result: 9 SELECTs)
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getStatsTab $$
CREATE PROCEDURE empl_getStatsTab(
  IN p_anio     INT,
  IN p_facultad VARCHAR(200),
  IN p_carrera  VARCHAR(200),
  IN p_programa VARCHAR(100),
  IN p_ciclo    VARCHAR(50),
  IN p_tipo     VARCHAR(50)
)
BEGIN
  -- Result 0: totals + afinidad
  SELECT COUNT(*) AS total,
    SUM(CASE WHEN ea.afinidad_laboral='SI' THEN 1 ELSE 0 END) AS afinidad,
    SUM(CASE WHEN ea.afinidad_laboral IS NOT NULL THEN 1 ELSE 0 END) AS resp_af
  FROM encuesta_anual ea
  JOIN egresado      eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera       c  ON c.id_carrera   = eg.id_carrera
  JOIN facultad      f  ON f.id_facultad  = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE (p_anio     IS NULL OR ea.anio_encuesta   = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad   = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera    = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion      = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo     = p_ciclo);

  -- Result 1: nivel_puesto
  SELECT ea.nivel_puesto AS label, COUNT(*) AS n
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE ea.nivel_puesto IS NOT NULL
    AND (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY ea.nivel_puesto ORDER BY n DESC LIMIT 7;

  -- Result 2: satisfaccion_usil
  SELECT ea.satisfaccion_usil AS label, COUNT(*) AS n
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE ea.satisfaccion_usil IS NOT NULL
    AND (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY ea.satisfaccion_usil ORDER BY n DESC LIMIT 7;

  -- Result 3: rango salarial
  SELECT cs.rango_estandar AS label, COUNT(*) AS n
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  LEFT JOIN catalogo_salario cs ON cs.id_salario = ea.id_salario
  WHERE cs.rango_estandar IS NOT NULL
    AND (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY cs.rango_estandar ORDER BY n DESC LIMIT 7;

  -- Result 4: rubro (solo tipo=laboral)
  IF p_tipo = 'laboral' THEN
    SELECT emp.rubro AS label, COUNT(*) AS n
    FROM encuesta_anual ea
    JOIN egresado eg ON eg.id_egresado = ea.id_egresado
    JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
    JOIN facultad f  ON f.id_facultad  = c.id_facultad
    JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
    JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
    LEFT JOIN empleo emp ON emp.id_encuesta = ea.id_encuesta
    WHERE emp.rubro IS NOT NULL
      AND (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
      AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
      AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
      AND (p_programa IS NULL OR tp.descripcion    = p_programa)
      AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
    GROUP BY emp.rubro ORDER BY n DESC LIMIT 7;
  ELSE
    SELECT NULL AS label, 0 AS n WHERE 1=0;
  END IF;

  -- Result 5: centro_laboral (solo tipo=laboral)
  IF p_tipo = 'laboral' THEN
    SELECT emp.centro_laboral AS label, COUNT(*) AS n
    FROM encuesta_anual ea
    JOIN egresado eg ON eg.id_egresado = ea.id_egresado
    JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
    JOIN facultad f  ON f.id_facultad  = c.id_facultad
    JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
    JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
    LEFT JOIN empleo emp ON emp.id_encuesta = ea.id_encuesta
    WHERE emp.centro_laboral IS NOT NULL
      AND (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
      AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
      AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
      AND (p_programa IS NULL OR tp.descripcion    = p_programa)
      AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
    GROUP BY emp.centro_laboral ORDER BY n DESC LIMIT 7;
  ELSE
    SELECT NULL AS label, 0 AS n WHERE 1=0;
  END IF;

  -- Result 6: area_trabajo (solo tipo=laboral)
  IF p_tipo = 'laboral' THEN
    SELECT emp.area_trabajo AS label, COUNT(*) AS n
    FROM encuesta_anual ea
    JOIN egresado eg ON eg.id_egresado = ea.id_egresado
    JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
    JOIN facultad f  ON f.id_facultad  = c.id_facultad
    JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
    JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
    LEFT JOIN empleo emp ON emp.id_encuesta = ea.id_encuesta
    WHERE emp.area_trabajo IS NOT NULL
      AND (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
      AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
      AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
      AND (p_programa IS NULL OR tp.descripcion    = p_programa)
      AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
    GROUP BY emp.area_trabajo ORDER BY n DESC LIMIT 7;
  ELSE
    SELECT NULL AS label, 0 AS n WHERE 1=0;
  END IF;

  -- Result 7: carrera
  SELECT c.nombre_carrera AS label, COUNT(*) AS n
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY c.nombre_carrera ORDER BY n DESC LIMIT 7;

  -- Result 8: facultad
  SELECT f.nombre_facultad AS label, COUNT(*) AS n
  FROM encuesta_anual ea
  JOIN egresado eg ON eg.id_egresado = ea.id_egresado
  JOIN carrera  c  ON c.id_carrera   = eg.id_carrera
  JOIN facultad f  ON f.id_facultad  = c.id_facultad
  JOIN tipo_programa tp ON c.id_tipo_programa = tp.id_tipo_programa
  JOIN ciclo_egreso  ce ON eg.id_ciclo_egreso = ce.id_ciclo_egreso
  WHERE (p_anio     IS NULL OR ea.anio_encuesta = p_anio)
    AND (p_facultad IS NULL OR f.nombre_facultad = p_facultad)
    AND (p_carrera  IS NULL OR c.nombre_carrera  = p_carrera)
    AND (p_programa IS NULL OR tp.descripcion    = p_programa)
    AND (p_ciclo    IS NULL OR ce.codigo_ciclo   = p_ciclo)
  GROUP BY f.nombre_facultad ORDER BY n DESC LIMIT 7;
END $$

-- ────────────────────────────────────────────────────────────
-- INFORME_EMPLEABILIDAD (tabla separada de mercado_informe)
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_getInformes $$
CREATE PROCEDURE empl_getInformes(
  IN p_anio     INT,
  IN p_unidad   VARCHAR(200),
  IN p_facultad VARCHAR(200)
)
BEGIN
  SELECT id, nombre, anio, unidad, facultad, url_descarga, tipo_acceso
  FROM informe_empleabilidad
  WHERE activo = 1
    AND (p_anio     IS NULL OR anio    = p_anio)
    AND (p_unidad   IS NULL OR unidad  = p_unidad)
    AND (p_facultad IS NULL OR facultad = p_facultad)
  ORDER BY anio DESC, unidad, facultad;

  SELECT DISTINCT anio FROM informe_empleabilidad WHERE activo=1 ORDER BY anio DESC;

  SELECT DISTINCT unidad FROM informe_empleabilidad WHERE activo=1 ORDER BY unidad;

  SELECT DISTINCT facultad FROM informe_empleabilidad WHERE activo=1 ORDER BY facultad;
END $$

DROP PROCEDURE IF EXISTS empl_createInforme $$
CREATE PROCEDURE empl_createInforme(
  IN p_nombre  VARCHAR(300),
  IN p_anio    INT,
  IN p_unidad  VARCHAR(200),
  IN p_facultad VARCHAR(200),
  IN p_url     VARCHAR(500),
  IN p_tipo    VARCHAR(50)
)
BEGIN
  INSERT INTO informe_empleabilidad (nombre, anio, unidad, facultad, url_descarga, tipo_acceso, activo)
  VALUES (p_nombre, p_anio, p_unidad, COALESCE(p_facultad,'No aplica'), p_url, p_tipo, 1);
  SELECT LAST_INSERT_ID() AS id;
END $$

DROP PROCEDURE IF EXISTS empl_updateInforme $$
CREATE PROCEDURE empl_updateInforme(
  IN p_id      INT,
  IN p_nombre  VARCHAR(300),
  IN p_anio    INT,
  IN p_unidad  VARCHAR(200),
  IN p_facultad VARCHAR(200),
  IN p_url     VARCHAR(500),
  IN p_tipo    VARCHAR(50)
)
BEGIN
  UPDATE informe_empleabilidad
  SET nombre = p_nombre, anio = p_anio, unidad = p_unidad,
      facultad = COALESCE(p_facultad,'No aplica'),
      url_descarga = p_url, tipo_acceso = p_tipo
  WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_setInformeEmplEstado $$
CREATE PROCEDURE empl_setInformeEmplEstado(IN p_id INT, IN p_activo TINYINT)
BEGIN
  UPDATE informe_empleabilidad SET activo = p_activo WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_getInformeEmplById $$
CREATE PROCEDURE empl_getInformeEmplById(IN p_id INT)
BEGIN
  SELECT id, nombre FROM informe_empleabilidad WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS empl_listInformesEmplAdmin $$
CREATE PROCEDURE empl_listInformesEmplAdmin()
BEGIN
  SELECT id, nombre, anio, unidad, facultad, url_descarga, tipo_acceso, activo
  FROM informe_empleabilidad ORDER BY anio DESC, unidad, facultad;
END $$

-- ────────────────────────────────────────────────────────────
-- BENCHMARKING — ACTUALIZACIÓN TIPO (migración puntual)
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS empl_updateTipoBenchmarkInternacional $$
CREATE PROCEDURE empl_updateTipoBenchmarkInternacional()
BEGIN
  UPDATE universidad_benchmark
  SET tipo_benchmark = 'competencia_internacional'
  WHERE tipo_benchmark = 'referente_tecnologico';

  UPDATE universidad_benchmark ub
  JOIN programa_benchmark pb ON pb.id_universidad_benchmark = ub.id_universidad_benchmark
  SET ub.tipo_benchmark = 'competencia_internacional'
  WHERE ub.tipo_benchmark = 'referente_internacional'
    AND pb.nombre_programa LIKE '%/ programa equivalente';

  UPDATE programa_benchmark
  SET estado_extraccion = 'pendiente', fecha_captura = NULL
  WHERE estado_extraccion = 'error'
    AND nombre_programa LIKE '%/ programa equivalente';
END $$

DELIMITER ;
