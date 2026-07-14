-- ============================================================
-- RADAR CARRERAS — STORED PROCEDURES
-- Base de datos: radar_carreras
-- Motor: MySQL 8.0
-- Ejecutar con: USE radar_carreras; SOURCE procedures_radar.sql;
-- ============================================================

DELIMITER $$

-- ────────────────────────────────────────────────────────────
-- UTILIDADES COMPARTIDAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS radar_getAdminOptions $$
CREATE PROCEDURE radar_getAdminOptions()
BEGIN
  SELECT id_pestel, nombre_pestel, slug_pestel, color, letra_codigo
  FROM pestel WHERE activo = 1 ORDER BY nombre_pestel;

  SELECT id_sector, nombre_sector
  FROM sector WHERE activo = 1 ORDER BY nombre_sector;
END $$

DROP PROCEDURE IF EXISTS radar_getNotificaciones $$
CREATE PROCEDURE radar_getNotificaciones()
BEGIN
  (SELECT id_senal AS id, titulo_senal AS titulo, 'senal' AS tipo,
          id_estado, fecha_publicacion, fecha_creacion
   FROM senal
   WHERE id_estado = 1 AND fecha_publicacion IS NOT NULL)
  UNION ALL
  (SELECT id_tendencia AS id, titulo_tendencia AS titulo, 'tendencia' AS tipo,
          id_estado, fecha_publicacion, fecha_creacion
   FROM tendencia
   WHERE id_estado = 1 AND fecha_publicacion IS NOT NULL)
  UNION ALL
  (SELECT id_escenario AS id, titulo_escenario AS titulo, 'escenario' AS tipo,
          id_estado, fecha_publicacion, fecha_creacion
   FROM escenario
   WHERE id_estado = 1 AND fecha_publicacion IS NOT NULL)
  ORDER BY fecha_publicacion DESC
  LIMIT 30;
END $$

DROP PROCEDURE IF EXISTS radar_getPestelsAndSectors $$
CREATE PROCEDURE radar_getPestelsAndSectors()
BEGIN
  SELECT id_pestel, nombre_pestel FROM pestel WHERE activo = 1;
  SELECT id_sector, nombre_sector  FROM sector  WHERE activo = 1;
END $$

DROP FUNCTION IF EXISTS radar_findOrCreateTopico $$
CREATE FUNCTION radar_findOrCreateTopico(p_nombre VARCHAR(300))
RETURNS INT
READS SQL DATA
MODIFIES SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_id INT DEFAULT NULL;
  SET p_nombre = TRIM(p_nombre);
  IF p_nombre IS NULL OR p_nombre = '' THEN RETURN NULL; END IF;
  SELECT id_topico INTO v_id FROM topico WHERE LOWER(TRIM(nombre)) = LOWER(p_nombre) LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO topico (nombre) VALUES (p_nombre);
    SET v_id = LAST_INSERT_ID();
  END IF;
  RETURN v_id;
END $$

DROP PROCEDURE IF EXISTS radar_resolveTopico $$
CREATE PROCEDURE radar_resolveTopico(IN p_nombre VARCHAR(300))
BEGIN
  DECLARE v_id INT DEFAULT NULL;
  IF p_nombre IS NULL OR TRIM(p_nombre) = '' THEN
    SELECT NULL AS id_topico;
  ELSE
    SET p_nombre = TRIM(p_nombre);
    INSERT IGNORE INTO topico (nombre) VALUES (p_nombre);
    SELECT id_topico INTO v_id FROM topico WHERE nombre = p_nombre LIMIT 1;
    SELECT v_id AS id_topico;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_lookupTendenciaByName $$
CREATE PROCEDURE radar_lookupTendenciaByName(IN p_nombre VARCHAR(500))
BEGIN
  SELECT id_tendencia FROM tendencia
  WHERE LOWER(TRIM(titulo_tendencia)) = LOWER(TRIM(p_nombre))
     OR LOWER(TRIM(nombre_tendencia)) = LOWER(TRIM(p_nombre))
  LIMIT 1;
END $$

-- ────────────────────────────────────────────────────────────
-- SEÑALES — CONSULTAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS radar_countSenales $$
CREATE PROCEDURE radar_countSenales(
  IN p_q          VARCHAR(300),
  IN p_estado     INT,
  IN p_excl_arch  TINYINT,
  IN p_pestel_csv VARCHAR(1000),
  IN p_sector_csv VARCHAR(1000)
)
BEGIN
  SELECT COUNT(DISTINCT s.id_senal) AS total
  FROM senal s
  WHERE
    (p_q IS NULL OR p_q = '' OR s.titulo_senal LIKE CONCAT('%',p_q,'%') OR s.desc_corta_senal LIKE CONCAT('%',p_q,'%'))
    AND (p_estado IS NULL OR s.id_estado = p_estado)
    AND (p_estado IS NOT NULL OR p_excl_arch = 0 OR s.id_estado <> 4)
    AND (p_pestel_csv IS NULL OR p_pestel_csv = '' OR EXISTS (
      SELECT 1 FROM senal_pestel _fp WHERE _fp.id_senal = s.id_senal AND FIND_IN_SET(_fp.id_pestel, p_pestel_csv)
    ))
    AND (p_sector_csv IS NULL OR p_sector_csv = '' OR EXISTS (
      SELECT 1 FROM senal_sector _fs WHERE _fs.id_senal = s.id_senal AND FIND_IN_SET(_fs.id_sector, p_sector_csv)
    ));
END $$

DROP PROCEDURE IF EXISTS radar_listSenales $$
CREATE PROCEDURE radar_listSenales(
  IN p_q          VARCHAR(300),
  IN p_estado     INT,
  IN p_excl_arch  TINYINT,
  IN p_pestel_csv VARCHAR(1000),
  IN p_sector_csv VARCHAR(1000),
  IN p_limit      INT,
  IN p_offset     INT
)
BEGIN
  SELECT
    s.id_senal, s.titulo_senal, s.desc_corta_senal, s.fuente_senal, s.url_fuente,
    s.id_estado, s.fecha_publicacion, s.fecha_creacion, s.fecha_actualizacion,
    s.fecha_archivado,
    TIMESTAMPDIFF(DAY, s.fecha_archivado, NOW()) AS dias_archivado,
    GROUP_CONCAT(DISTINCT p.nombre_pestel  ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
    MIN(p.slug_pestel)                                                              AS pestel_slug,
    GROUP_CONCAT(DISTINCT p.color          ORDER BY p.orden_display SEPARATOR ',') AS pestel_colores,
    GROUP_CONCAT(DISTINCT p.letra_codigo   ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
    GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector  SEPARATOR '|') AS sector_nombres,
    tp.nombre AS topico_nombre
  FROM senal s
  LEFT JOIN senal_pestel sp  ON s.id_senal   = sp.id_senal
  LEFT JOIN pestel p         ON sp.id_pestel = p.id_pestel  AND p.activo = 1
  LEFT JOIN senal_sector ss  ON s.id_senal   = ss.id_senal
  LEFT JOIN sector sec       ON ss.id_sector = sec.id_sector AND sec.activo = 1
  LEFT JOIN topico tp        ON s.id_topico  = tp.id_topico
  WHERE
    (p_q IS NULL OR p_q = '' OR s.titulo_senal LIKE CONCAT('%',p_q,'%') OR s.desc_corta_senal LIKE CONCAT('%',p_q,'%'))
    AND (p_estado IS NULL OR s.id_estado = p_estado)
    AND (p_estado IS NOT NULL OR p_excl_arch = 0 OR s.id_estado <> 4)
    AND (p_pestel_csv IS NULL OR p_pestel_csv = '' OR EXISTS (
      SELECT 1 FROM senal_pestel _fp WHERE _fp.id_senal = s.id_senal AND FIND_IN_SET(_fp.id_pestel, p_pestel_csv)
    ))
    AND (p_sector_csv IS NULL OR p_sector_csv = '' OR EXISTS (
      SELECT 1 FROM senal_sector _fs WHERE _fs.id_senal = s.id_senal AND FIND_IN_SET(_fs.id_sector, p_sector_csv)
    ))
  GROUP BY s.id_senal
  ORDER BY s.fecha_creacion DESC
  LIMIT p_limit OFFSET p_offset;
END $$

DROP PROCEDURE IF EXISTS radar_getSenalEstado $$
CREATE PROCEDURE radar_getSenalEstado(IN p_uuid CHAR(36))
BEGIN
  SELECT id_senal, id_estado FROM senal WHERE id_senal = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_getSenalDetalle $$
CREATE PROCEDURE radar_getSenalDetalle(IN p_uuid CHAR(36))
BEGIN
  SELECT s.id_senal, s.titulo_senal, s.nombre_senal,
         s.desc_corta_senal, s.desc_larga_senal, s.razon_cambio,
         s.fuente_senal, s.url_fuente,
         s.url_imagen_senal, s.url_video_senal, s.id_estado,
         s.pais_origen, s.fecha_senal_articulo, s.autor,
         s.fecha_creacion, s.fecha_publicacion, s.fecha_actualizacion,
         tp.nombre AS topico_nombre
  FROM senal s
  LEFT JOIN topico tp ON s.id_topico = tp.id_topico
  WHERE s.id_senal = p_uuid;

  SELECT id_pestel FROM senal_pestel WHERE id_senal = p_uuid;

  SELECT id_sector FROM senal_sector WHERE id_senal = p_uuid;

  SELECT t.id_tendencia AS uuid, t.nombre_tendencia AS nombre
  FROM senal_tendencia st JOIN tendencia t ON st.id_tendencia = t.id_tendencia
  WHERE st.id_senal = p_uuid;

  SELECT e.id_escenario AS uuid, e.nombre_escenario AS nombre
  FROM senal_escenario se JOIN escenario e ON se.id_escenario = e.id_escenario
  WHERE se.id_senal = p_uuid;
END $$

-- ────────────────────────────────────────────────────────────
-- SEÑALES — ESCRITURAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS radar_updateSenalEstado $$
CREATE PROCEDURE radar_updateSenalEstado(IN p_uuid CHAR(36), IN p_estado INT)
BEGIN
  UPDATE senal
  SET id_estado          = p_estado,
      fecha_archivado    = NULL,
      fecha_actualizacion = NOW(),
      fecha_publicacion  = IF(p_estado = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion)
  WHERE id_senal = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_archiveSenal $$
CREATE PROCEDURE radar_archiveSenal(IN p_uuid CHAR(36), IN p_usuario_id INT)
BEGIN
  UPDATE senal
  SET id_estado              = 4,
      fecha_archivado        = NOW(),
      fecha_actualizacion    = NOW(),
      id_usuario_actualizador = p_usuario_id
  WHERE id_senal = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_ensureUniqueSenal $$
CREATE PROCEDURE radar_ensureUniqueSenal(
  IN p_titulo     VARCHAR(500),
  IN p_nombre     VARCHAR(500),
  IN p_exclude_id CHAR(36)
)
BEGIN
  SELECT id_senal AS id, titulo_senal AS titulo, nombre_senal AS nombre
  FROM senal
  WHERE (LOWER(TRIM(titulo_senal)) IN (LOWER(TRIM(p_titulo)), LOWER(TRIM(p_nombre)))
      OR LOWER(TRIM(nombre_senal)) IN (LOWER(TRIM(p_titulo)), LOWER(TRIM(p_nombre))))
    AND (p_exclude_id IS NULL OR id_senal <> p_exclude_id)
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS radar_createSenal $$
CREATE PROCEDURE radar_createSenal(
  IN p_id            CHAR(36),
  IN p_titulo        VARCHAR(500),
  IN p_nombre        VARCHAR(500),
  IN p_desc_corta    TEXT,
  IN p_desc_larga    TEXT,
  IN p_razon         TEXT,
  IN p_fuente        VARCHAR(500),
  IN p_url_fuente    TEXT,
  IN p_imagen        TEXT,
  IN p_video         TEXT,
  IN p_autor         VARCHAR(300),
  IN p_fecha_art     DATE,
  IN p_estado        INT,
  IN p_usuario_id    INT,
  IN p_pestel_json   JSON,
  IN p_sector_json   JSON,
  IN p_tend_json     JSON,
  IN p_esc_json      JSON
)
BEGIN
  INSERT INTO senal
    (id_senal, titulo_senal, nombre_senal,
     desc_corta_senal, desc_larga_senal, razon_cambio,
     fuente_senal, url_fuente,
     url_imagen_senal, url_video_senal,
     autor, fecha_senal_articulo, id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga, p_razon,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_autor, p_fecha_art, p_estado, p_usuario_id,
     IF(p_estado = 1, NOW(), NULL));

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO senal_pestel (id_senal, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO senal_sector (id_senal, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_tend_json) > 0 THEN
    INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia)
    SELECT p_id, jt.v FROM JSON_TABLE(p_tend_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_esc_json) > 0 THEN
    INSERT IGNORE INTO senal_escenario (id_senal, id_escenario)
    SELECT p_id, jt.v FROM JSON_TABLE(p_esc_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_updateSenal $$
CREATE PROCEDURE radar_updateSenal(
  IN p_uuid       CHAR(36),
  IN p_titulo     VARCHAR(500),
  IN p_nombre     VARCHAR(500),
  IN p_desc_corta TEXT,
  IN p_desc_larga TEXT,
  IN p_razon      TEXT,
  IN p_fuente     VARCHAR(500),
  IN p_url_fuente TEXT,
  IN p_imagen     TEXT,
  IN p_video      TEXT,
  IN p_autor      VARCHAR(300),
  IN p_fecha_art  DATE,
  IN p_estado     INT,
  IN p_usuario_id INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON,
  IN p_tend_json   JSON,
  IN p_esc_json    JSON
)
BEGIN
  UPDATE senal
  SET titulo_senal           = p_titulo,
      nombre_senal           = p_nombre,
      desc_corta_senal       = p_desc_corta,
      desc_larga_senal       = p_desc_larga,
      razon_cambio           = p_razon,
      fuente_senal           = p_fuente,
      url_fuente             = p_url_fuente,
      url_imagen_senal       = p_imagen,
      url_video_senal        = p_video,
      autor                  = p_autor,
      fecha_senal_articulo   = p_fecha_art,
      id_estado              = p_estado,
      id_usuario_actualizador = p_usuario_id,
      fecha_publicacion      = IF(p_estado = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion),
      fecha_actualizacion    = NOW()
  WHERE id_senal = p_uuid;

  DELETE FROM senal_pestel    WHERE id_senal = p_uuid;
  DELETE FROM senal_sector    WHERE id_senal = p_uuid;
  DELETE FROM senal_tendencia WHERE id_senal = p_uuid;
  DELETE FROM senal_escenario WHERE id_senal = p_uuid;

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO senal_pestel (id_senal, id_pestel)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO senal_sector (id_senal, id_sector)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_tend_json) > 0 THEN
    INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_tend_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_esc_json) > 0 THEN
    INSERT IGNORE INTO senal_escenario (id_senal, id_escenario)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_esc_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;
END $$

-- ────────────────────────────────────────────────────────────
-- TENDENCIAS — CONSULTAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS radar_countTendencias $$
CREATE PROCEDURE radar_countTendencias(
  IN p_q          VARCHAR(300),
  IN p_estado     INT,
  IN p_excl_arch  TINYINT,
  IN p_pestel_csv VARCHAR(1000),
  IN p_sector_csv VARCHAR(1000)
)
BEGIN
  SELECT COUNT(DISTINCT t.id_tendencia) AS total
  FROM tendencia t
  WHERE
    (p_q IS NULL OR p_q = '' OR t.titulo_tendencia LIKE CONCAT('%',p_q,'%') OR t.desc_corta_tendencia LIKE CONCAT('%',p_q,'%'))
    AND (p_estado IS NULL OR t.id_estado = p_estado)
    AND (p_estado IS NOT NULL OR p_excl_arch = 0 OR t.id_estado <> 4)
    AND (p_pestel_csv IS NULL OR p_pestel_csv = '' OR EXISTS (
      SELECT 1 FROM tendencia_pestel _fp WHERE _fp.id_tendencia = t.id_tendencia AND FIND_IN_SET(_fp.id_pestel, p_pestel_csv)
    ))
    AND (p_sector_csv IS NULL OR p_sector_csv = '' OR EXISTS (
      SELECT 1 FROM tendencia_sector _fs WHERE _fs.id_tendencia = t.id_tendencia AND FIND_IN_SET(_fs.id_sector, p_sector_csv)
    ));
END $$

DROP PROCEDURE IF EXISTS radar_listTendencias $$
CREATE PROCEDURE radar_listTendencias(
  IN p_q          VARCHAR(300),
  IN p_estado     INT,
  IN p_excl_arch  TINYINT,
  IN p_pestel_csv VARCHAR(1000),
  IN p_sector_csv VARCHAR(1000),
  IN p_limit      INT,
  IN p_offset     INT
)
BEGIN
  SELECT
    t.id_tendencia, t.titulo_tendencia, t.desc_corta_tendencia, t.fuente_tendencia, t.url_fuente,
    t.id_estado, t.fecha_publicacion, t.fecha_creacion, t.fecha_actualizacion,
    t.fecha_archivado,
    TIMESTAMPDIFF(DAY, t.fecha_archivado, NOW()) AS dias_archivado,
    GROUP_CONCAT(DISTINCT p.nombre_pestel  ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
    MIN(p.slug_pestel)                                                              AS pestel_slug,
    GROUP_CONCAT(DISTINCT p.color          ORDER BY p.orden_display SEPARATOR ',') AS pestel_colores,
    GROUP_CONCAT(DISTINCT p.letra_codigo   ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
    GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector  SEPARATOR '|') AS sector_nombres,
    tpc.nombre AS topico_nombre
  FROM tendencia t
  LEFT JOIN tendencia_pestel tp2 ON t.id_tendencia = tp2.id_tendencia
  LEFT JOIN pestel p             ON tp2.id_pestel  = p.id_pestel  AND p.activo = 1
  LEFT JOIN tendencia_sector ts  ON t.id_tendencia = ts.id_tendencia
  LEFT JOIN sector sec           ON ts.id_sector   = sec.id_sector AND sec.activo = 1
  LEFT JOIN topico tpc           ON t.id_topico    = tpc.id_topico
  WHERE
    (p_q IS NULL OR p_q = '' OR t.titulo_tendencia LIKE CONCAT('%',p_q,'%') OR t.desc_corta_tendencia LIKE CONCAT('%',p_q,'%'))
    AND (p_estado IS NULL OR t.id_estado = p_estado)
    AND (p_estado IS NOT NULL OR p_excl_arch = 0 OR t.id_estado <> 4)
    AND (p_pestel_csv IS NULL OR p_pestel_csv = '' OR EXISTS (
      SELECT 1 FROM tendencia_pestel _fp WHERE _fp.id_tendencia = t.id_tendencia AND FIND_IN_SET(_fp.id_pestel, p_pestel_csv)
    ))
    AND (p_sector_csv IS NULL OR p_sector_csv = '' OR EXISTS (
      SELECT 1 FROM tendencia_sector _fs WHERE _fs.id_tendencia = t.id_tendencia AND FIND_IN_SET(_fs.id_sector, p_sector_csv)
    ))
  GROUP BY t.id_tendencia
  ORDER BY t.fecha_creacion DESC
  LIMIT p_limit OFFSET p_offset;
END $$

DROP PROCEDURE IF EXISTS radar_getTendenciaDetalle $$
CREATE PROCEDURE radar_getTendenciaDetalle(IN p_uuid CHAR(36))
BEGIN
  SELECT t.id_tendencia, t.titulo_tendencia, t.nombre_tendencia,
         t.desc_corta_tendencia, t.desc_larga_tendencia, t.razon_cambio,
         t.fuente_tendencia, t.url_fuente,
         t.url_imagen_tendencia, t.url_video_tendencia, t.id_estado,
         t.autor, t.fecha_creacion, t.fecha_publicacion, t.fecha_actualizacion,
         tp.nombre AS topico_nombre
  FROM tendencia t
  LEFT JOIN topico tp ON t.id_topico = tp.id_topico
  WHERE t.id_tendencia = p_uuid;

  SELECT id_pestel FROM tendencia_pestel WHERE id_tendencia = p_uuid;
  SELECT id_sector FROM tendencia_sector  WHERE id_tendencia = p_uuid;

  SELECT tp.nombre FROM topico_relac_tendencia trt
  JOIN topico tp ON trt.id_topico = tp.id_topico
  WHERE trt.id_tendencia = p_uuid;

  SELECT s.id_senal AS uuid, s.nombre_senal AS nombre
  FROM senal_tendencia st JOIN senal s ON st.id_senal = s.id_senal
  WHERE st.id_tendencia = p_uuid;

  SELECT e.id_escenario AS uuid, e.nombre_escenario AS nombre
  FROM tendencia_escenario te JOIN escenario e ON te.id_escenario = e.id_escenario
  WHERE te.id_tendencia = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_updateTendenciaEstado $$
CREATE PROCEDURE radar_updateTendenciaEstado(IN p_uuid CHAR(36), IN p_estado INT)
BEGIN
  UPDATE tendencia
  SET id_estado          = p_estado,
      fecha_archivado    = NULL,
      fecha_actualizacion = NOW(),
      fecha_publicacion  = IF(p_estado = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion)
  WHERE id_tendencia = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_archiveTendencia $$
CREATE PROCEDURE radar_archiveTendencia(IN p_uuid CHAR(36), IN p_usuario_id INT)
BEGIN
  UPDATE tendencia
  SET id_estado              = 4,
      fecha_archivado        = NOW(),
      fecha_actualizacion    = NOW(),
      id_usuario_actualizador = p_usuario_id
  WHERE id_tendencia = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_ensureUniqueTendencia $$
CREATE PROCEDURE radar_ensureUniqueTendencia(
  IN p_titulo     VARCHAR(500),
  IN p_nombre     VARCHAR(500),
  IN p_exclude_id CHAR(36)
)
BEGIN
  SELECT id_tendencia AS id, titulo_tendencia AS titulo, nombre_tendencia AS nombre
  FROM tendencia
  WHERE (LOWER(TRIM(titulo_tendencia)) IN (LOWER(TRIM(p_titulo)), LOWER(TRIM(p_nombre)))
      OR LOWER(TRIM(nombre_tendencia)) IN (LOWER(TRIM(p_titulo)), LOWER(TRIM(p_nombre))))
    AND (p_exclude_id IS NULL OR id_tendencia <> p_exclude_id)
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS radar_createTendencia $$
CREATE PROCEDURE radar_createTendencia(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(500),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_autor       VARCHAR(300),
  IN p_estado      INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON,
  IN p_senal_json  JSON,
  IN p_esc_json    JSON
)
BEGIN
  INSERT INTO tendencia
    (id_tendencia, titulo_tendencia, nombre_tendencia,
     desc_corta_tendencia, desc_larga_tendencia, razon_cambio,
     fuente_tendencia, url_fuente,
     url_imagen_tendencia, url_video_tendencia,
     autor, id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga, p_razon,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_autor, p_estado, p_usuario_id,
     IF(p_estado = 1, NOW(), NULL));

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_senal_json) > 0 THEN
    INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia)
    SELECT jt.v, p_id FROM JSON_TABLE(p_senal_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_esc_json) > 0 THEN
    INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario)
    SELECT p_id, jt.v FROM JSON_TABLE(p_esc_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_updateTendencia $$
CREATE PROCEDURE radar_updateTendencia(
  IN p_uuid        CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(500),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_autor       VARCHAR(300),
  IN p_estado      INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON,
  IN p_senal_json  JSON,
  IN p_esc_json    JSON
)
BEGIN
  UPDATE tendencia
  SET titulo_tendencia        = p_titulo,
      nombre_tendencia        = p_nombre,
      desc_corta_tendencia    = p_desc_corta,
      desc_larga_tendencia    = p_desc_larga,
      razon_cambio            = p_razon,
      fuente_tendencia        = p_fuente,
      url_fuente              = p_url_fuente,
      url_imagen_tendencia    = p_imagen,
      url_video_tendencia     = p_video,
      autor                   = p_autor,
      id_estado               = p_estado,
      id_usuario_actualizador = p_usuario_id,
      fecha_publicacion       = IF(p_estado = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion),
      fecha_actualizacion     = NOW()
  WHERE id_tendencia = p_uuid;

  DELETE FROM tendencia_pestel   WHERE id_tendencia = p_uuid;
  DELETE FROM tendencia_sector   WHERE id_tendencia = p_uuid;
  DELETE FROM senal_tendencia    WHERE id_tendencia = p_uuid;
  DELETE FROM tendencia_escenario WHERE id_tendencia = p_uuid;

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_senal_json) > 0 THEN
    INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia)
    SELECT jt.v, p_uuid FROM JSON_TABLE(p_senal_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_esc_json) > 0 THEN
    INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_esc_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;
END $$

-- ────────────────────────────────────────────────────────────
-- ESCENARIOS — CONSULTAS
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS radar_countEscenarios $$
CREATE PROCEDURE radar_countEscenarios(
  IN p_q          VARCHAR(300),
  IN p_estado     INT,
  IN p_excl_arch  TINYINT,
  IN p_pestel_csv VARCHAR(1000),
  IN p_sector_csv VARCHAR(1000)
)
BEGIN
  SELECT COUNT(DISTINCT e.id_escenario) AS total
  FROM escenario e
  WHERE
    (p_q IS NULL OR p_q = '' OR e.titulo_escenario LIKE CONCAT('%',p_q,'%') OR e.desc_corta_escenario LIKE CONCAT('%',p_q,'%'))
    AND (p_estado IS NULL OR e.id_estado = p_estado)
    AND (p_estado IS NOT NULL OR p_excl_arch = 0 OR e.id_estado <> 4)
    AND (p_pestel_csv IS NULL OR p_pestel_csv = '' OR EXISTS (
      SELECT 1 FROM escenario_pestel _fp WHERE _fp.id_escenario = e.id_escenario AND FIND_IN_SET(_fp.id_pestel, p_pestel_csv)
    ))
    AND (p_sector_csv IS NULL OR p_sector_csv = '' OR EXISTS (
      SELECT 1 FROM escenario_sector _fs WHERE _fs.id_escenario = e.id_escenario AND FIND_IN_SET(_fs.id_sector, p_sector_csv)
    ));
END $$

DROP PROCEDURE IF EXISTS radar_listEscenarios $$
CREATE PROCEDURE radar_listEscenarios(
  IN p_q          VARCHAR(300),
  IN p_estado     INT,
  IN p_excl_arch  TINYINT,
  IN p_pestel_csv VARCHAR(1000),
  IN p_sector_csv VARCHAR(1000),
  IN p_limit      INT,
  IN p_offset     INT
)
BEGIN
  SELECT
    e.id_escenario, e.titulo_escenario, e.desc_corta_escenario, e.fuente_escenario, e.url_fuente,
    e.id_estado, e.fecha_publicacion, e.fecha_creacion, e.fecha_actualizacion,
    e.fecha_archivado,
    TIMESTAMPDIFF(DAY, e.fecha_archivado, NOW()) AS dias_archivado,
    e.horizonte_escenario,
    GROUP_CONCAT(DISTINCT p.nombre_pestel  ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
    MIN(p.slug_pestel)                                                              AS pestel_slug,
    GROUP_CONCAT(DISTINCT p.color          ORDER BY p.orden_display SEPARATOR ',') AS pestel_colores,
    GROUP_CONCAT(DISTINCT p.letra_codigo   ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
    GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector  SEPARATOR '|') AS sector_nombres,
    tpe.nombre AS topico_nombre
  FROM escenario e
  LEFT JOIN escenario_pestel ep  ON e.id_escenario = ep.id_escenario
  LEFT JOIN pestel p             ON ep.id_pestel   = p.id_pestel  AND p.activo = 1
  LEFT JOIN escenario_sector esc ON e.id_escenario = esc.id_escenario
  LEFT JOIN sector sec           ON esc.id_sector  = sec.id_sector AND sec.activo = 1
  LEFT JOIN topico tpe           ON e.id_topico    = tpe.id_topico
  WHERE
    (p_q IS NULL OR p_q = '' OR e.titulo_escenario LIKE CONCAT('%',p_q,'%') OR e.desc_corta_escenario LIKE CONCAT('%',p_q,'%'))
    AND (p_estado IS NULL OR e.id_estado = p_estado)
    AND (p_estado IS NOT NULL OR p_excl_arch = 0 OR e.id_estado <> 4)
    AND (p_pestel_csv IS NULL OR p_pestel_csv = '' OR EXISTS (
      SELECT 1 FROM escenario_pestel _fp WHERE _fp.id_escenario = e.id_escenario AND FIND_IN_SET(_fp.id_pestel, p_pestel_csv)
    ))
    AND (p_sector_csv IS NULL OR p_sector_csv = '' OR EXISTS (
      SELECT 1 FROM escenario_sector _fs WHERE _fs.id_escenario = e.id_escenario AND FIND_IN_SET(_fs.id_sector, p_sector_csv)
    ))
  GROUP BY e.id_escenario
  ORDER BY e.fecha_creacion DESC
  LIMIT p_limit OFFSET p_offset;
END $$

DROP PROCEDURE IF EXISTS radar_getEscenarioDetalle $$
CREATE PROCEDURE radar_getEscenarioDetalle(IN p_uuid CHAR(36))
BEGIN
  SELECT e.id_escenario, e.titulo_escenario, e.nombre_escenario,
         e.desc_corta_escenario, e.desc_larga_escenario, e.razon_cambio,
         e.fuente_escenario, e.url_fuente,
         e.url_imagen_escenario, e.url_video_escenario,
         e.horizonte_escenario, e.probabilidad, e.id_estado,
         e.autor, e.fecha_creacion, e.fecha_publicacion, e.fecha_actualizacion,
         tp.nombre AS topico_nombre
  FROM escenario e
  LEFT JOIN topico tp ON e.id_topico = tp.id_topico
  WHERE e.id_escenario = p_uuid;

  SELECT id_pestel FROM escenario_pestel WHERE id_escenario = p_uuid;
  SELECT id_sector FROM escenario_sector  WHERE id_escenario = p_uuid;

  SELECT s.id_senal AS uuid, s.nombre_senal AS nombre
  FROM senal_escenario se JOIN senal s ON se.id_senal = s.id_senal
  WHERE se.id_escenario = p_uuid;

  SELECT t.id_tendencia AS uuid, t.nombre_tendencia AS nombre
  FROM tendencia_escenario te JOIN tendencia t ON te.id_tendencia = t.id_tendencia
  WHERE te.id_escenario = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_updateEscenarioEstado $$
CREATE PROCEDURE radar_updateEscenarioEstado(IN p_uuid CHAR(36), IN p_estado INT)
BEGIN
  UPDATE escenario
  SET id_estado          = p_estado,
      fecha_archivado    = NULL,
      fecha_actualizacion = NOW(),
      fecha_publicacion  = IF(p_estado = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion)
  WHERE id_escenario = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_archiveEscenario $$
CREATE PROCEDURE radar_archiveEscenario(IN p_uuid CHAR(36), IN p_usuario_id INT)
BEGIN
  UPDATE escenario
  SET id_estado              = 4,
      fecha_archivado        = NOW(),
      fecha_actualizacion    = NOW(),
      id_usuario_actualizador = p_usuario_id
  WHERE id_escenario = p_uuid;
END $$

DROP PROCEDURE IF EXISTS radar_ensureUniqueEscenario $$
CREATE PROCEDURE radar_ensureUniqueEscenario(
  IN p_titulo     VARCHAR(500),
  IN p_nombre     VARCHAR(500),
  IN p_exclude_id CHAR(36)
)
BEGIN
  SELECT id_escenario AS id, titulo_escenario AS titulo, nombre_escenario AS nombre
  FROM escenario
  WHERE (LOWER(TRIM(titulo_escenario)) IN (LOWER(TRIM(p_titulo)), LOWER(TRIM(p_nombre)))
      OR LOWER(TRIM(nombre_escenario)) IN (LOWER(TRIM(p_titulo)), LOWER(TRIM(p_nombre))))
    AND (p_exclude_id IS NULL OR id_escenario <> p_exclude_id)
  LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS radar_createEscenario $$
CREATE PROCEDURE radar_createEscenario(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(500),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_horizonte   VARCHAR(100),
  IN p_autor       VARCHAR(300),
  IN p_estado      INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON,
  IN p_senal_json  JSON,
  IN p_tend_json   JSON
)
BEGIN
  INSERT INTO escenario
    (id_escenario, titulo_escenario, nombre_escenario,
     desc_corta_escenario, desc_larga_escenario, razon_cambio,
     fuente_escenario, url_fuente,
     url_imagen_escenario, url_video_escenario,
     horizonte_escenario,
     autor, id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga, p_razon,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_horizonte,
     p_autor, p_estado, p_usuario_id,
     IF(p_estado = 1, NOW(), NULL));

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO escenario_sector (id_escenario, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_senal_json) > 0 THEN
    INSERT IGNORE INTO senal_escenario (id_senal, id_escenario)
    SELECT jt.v, p_id FROM JSON_TABLE(p_senal_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_tend_json) > 0 THEN
    INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario)
    SELECT jt.v, p_id FROM JSON_TABLE(p_tend_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_updateEscenario $$
CREATE PROCEDURE radar_updateEscenario(
  IN p_uuid        CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(500),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_horizonte   VARCHAR(100),
  IN p_autor       VARCHAR(300),
  IN p_estado      INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON,
  IN p_senal_json  JSON,
  IN p_tend_json   JSON
)
BEGIN
  UPDATE escenario
  SET titulo_escenario        = p_titulo,
      nombre_escenario        = p_nombre,
      desc_corta_escenario    = p_desc_corta,
      desc_larga_escenario    = p_desc_larga,
      razon_cambio            = p_razon,
      fuente_escenario        = p_fuente,
      url_fuente              = p_url_fuente,
      url_imagen_escenario    = p_imagen,
      url_video_escenario     = p_video,
      horizonte_escenario     = p_horizonte,
      autor                   = p_autor,
      id_estado               = p_estado,
      id_usuario_actualizador = p_usuario_id,
      fecha_publicacion       = IF(p_estado = 1 AND fecha_publicacion IS NULL, NOW(), fecha_publicacion),
      fecha_actualizacion     = NOW()
  WHERE id_escenario = p_uuid;

  DELETE FROM escenario_pestel    WHERE id_escenario = p_uuid;
  DELETE FROM escenario_sector    WHERE id_escenario = p_uuid;
  DELETE FROM senal_escenario     WHERE id_escenario = p_uuid;
  DELETE FROM tendencia_escenario WHERE id_escenario = p_uuid;

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO escenario_sector (id_escenario, id_sector)
    SELECT p_uuid, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_senal_json) > 0 THEN
    INSERT IGNORE INTO senal_escenario (id_senal, id_escenario)
    SELECT jt.v, p_uuid FROM JSON_TABLE(p_senal_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_tend_json) > 0 THEN
    INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario)
    SELECT jt.v, p_uuid FROM JSON_TABLE(p_tend_json, '$[*]' COLUMNS(v CHAR(36) PATH '$')) AS jt;
  END IF;
END $$

-- ────────────────────────────────────────────────────────────
-- IMPORT / IMPORTAR — OPERACIONES
-- ────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS radar_insertSenalImport $$
CREATE PROCEDURE radar_insertSenalImport(
  IN p_id           CHAR(36),
  IN p_titulo       VARCHAR(500),
  IN p_nombre       VARCHAR(300),
  IN p_desc_corta   TEXT,
  IN p_desc_larga   TEXT,
  IN p_fuente       VARCHAR(500),
  IN p_url_fuente   TEXT,
  IN p_imagen       TEXT,
  IN p_video        TEXT,
  IN p_pais_origen  VARCHAR(100),
  IN p_id_topico    INT,
  IN p_fecha_art    DATE,
  IN p_estado       INT,
  IN p_usuario_id   INT,
  IN p_fecha_pub    DATETIME
)
BEGIN
  INSERT INTO senal
    (id_senal, titulo_senal, nombre_senal,
     desc_corta_senal, desc_larga_senal,
     fuente_senal, url_fuente,
     url_imagen_senal, url_video_senal,
     pais_origen, id_topico, fecha_senal_articulo,
     id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_pais_origen, p_id_topico, p_fecha_art,
     p_estado, p_usuario_id, p_fecha_pub);
END $$

DROP PROCEDURE IF EXISTS radar_insertTendenciaImport $$
CREATE PROCEDURE radar_insertTendenciaImport(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_pais_origen VARCHAR(100),
  IN p_logica      TEXT,
  IN p_id_topico   INT,
  IN p_estado      INT,
  IN p_usuario_id  INT,
  IN p_fecha_pub   DATETIME
)
BEGIN
  INSERT INTO tendencia
    (id_tendencia, titulo_tendencia, nombre_tendencia,
     desc_corta_tendencia, desc_larga_tendencia, razon_cambio,
     fuente_tendencia, url_fuente,
     url_imagen_tendencia, url_video_tendencia,
     pais_origen, logica, id_topico,
     id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga,
     NULL, p_fuente, p_url_fuente, p_imagen, p_video,
     p_pais_origen, p_logica, p_id_topico,
     p_estado, p_usuario_id, p_fecha_pub);
END $$

DROP PROCEDURE IF EXISTS radar_insertEscenarioImport $$
CREATE PROCEDURE radar_insertEscenarioImport(
  IN p_id         CHAR(36),
  IN p_titulo     VARCHAR(500),
  IN p_nombre     VARCHAR(300),
  IN p_desc_corta TEXT,
  IN p_desc_larga TEXT,
  IN p_fuente     VARCHAR(500),
  IN p_url_fuente TEXT,
  IN p_imagen     TEXT,
  IN p_video      TEXT,
  IN p_horizonte  VARCHAR(100),
  IN p_prob       DECIMAL(5,2),
  IN p_id_topico  INT,
  IN p_estado     INT,
  IN p_usuario_id INT,
  IN p_fecha_pub  DATETIME
)
BEGIN
  INSERT INTO escenario
    (id_escenario, titulo_escenario, nombre_escenario,
     desc_corta_escenario, desc_larga_escenario, razon_cambio,
     fuente_escenario, url_fuente,
     url_imagen_escenario, url_video_escenario,
     horizonte_escenario, probabilidad, id_topico,
     id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga,
     NULL, p_fuente, p_url_fuente, p_imagen, p_video,
     p_horizonte, p_prob, p_id_topico,
     p_estado, p_usuario_id, p_fecha_pub);
END $$

DROP PROCEDURE IF EXISTS radar_insertSenalRelaciones $$
CREATE PROCEDURE radar_insertSenalRelaciones(
  IN p_senal_id    CHAR(36),
  IN p_pestel_id   INT,
  IN p_sector_id   INT,
  IN p_tend_id     CHAR(36),
  IN p_esc_id      CHAR(36)
)
BEGIN
  IF p_pestel_id IS NOT NULL THEN
    INSERT IGNORE INTO senal_pestel (id_senal, id_pestel) VALUES (p_senal_id, p_pestel_id);
  END IF;
  IF p_sector_id IS NOT NULL THEN
    INSERT IGNORE INTO senal_sector (id_senal, id_sector) VALUES (p_senal_id, p_sector_id);
  END IF;
  IF p_tend_id IS NOT NULL THEN
    INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (p_senal_id, p_tend_id);
  END IF;
  IF p_esc_id IS NOT NULL THEN
    INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (p_senal_id, p_esc_id);
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_insertTendenciaRelaciones $$
CREATE PROCEDURE radar_insertTendenciaRelaciones(
  IN p_tend_id   CHAR(36),
  IN p_pestel_id INT,
  IN p_sector_id INT,
  IN p_topico_id INT
)
BEGIN
  IF p_pestel_id IS NOT NULL THEN
    INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel) VALUES (p_tend_id, p_pestel_id);
  END IF;
  IF p_sector_id IS NOT NULL THEN
    INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector) VALUES (p_tend_id, p_sector_id);
  END IF;
  IF p_topico_id IS NOT NULL THEN
    INSERT IGNORE INTO topico_relac_tendencia (id_topico, id_tendencia) VALUES (p_topico_id, p_tend_id);
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_insertEscenarioRelaciones $$
CREATE PROCEDURE radar_insertEscenarioRelaciones(
  IN p_esc_id    CHAR(36),
  IN p_pestel_id INT,
  IN p_sector_id INT
)
BEGIN
  IF p_pestel_id IS NOT NULL THEN
    INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel) VALUES (p_esc_id, p_pestel_id);
  END IF;
  IF p_sector_id IS NOT NULL THEN
    INSERT IGNORE INTO escenario_sector (id_escenario, id_sector) VALUES (p_esc_id, p_sector_id);
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_insertRelacionSenalTendencia $$
CREATE PROCEDURE radar_insertRelacionSenalTendencia(IN p_senal_id CHAR(36), IN p_tend_id CHAR(36))
BEGIN
  INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (p_senal_id, p_tend_id);
END $$

DROP PROCEDURE IF EXISTS radar_insertRelacionSenalEscenario $$
CREATE PROCEDURE radar_insertRelacionSenalEscenario(IN p_senal_id CHAR(36), IN p_esc_id CHAR(36))
BEGIN
  INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (p_senal_id, p_esc_id);
END $$

DROP PROCEDURE IF EXISTS radar_insertRelacionTendenciaEscenario $$
CREATE PROCEDURE radar_insertRelacionTendenciaEscenario(IN p_tend_id CHAR(36), IN p_esc_id CHAR(36))
BEGIN
  INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (p_tend_id, p_esc_id);
END $$

DROP PROCEDURE IF EXISTS radar_resolveItem $$
CREATE PROCEDURE radar_resolveItem(IN p_tipo VARCHAR(20), IN p_nombre VARCHAR(300))
proc_exit: BEGIN
  SET p_nombre = TRIM(p_nombre);
  IF p_nombre IS NULL OR p_nombre = '' THEN
    SELECT NULL AS id; LEAVE proc_exit;
  END IF;

  CASE p_tipo
    WHEN 'senal' THEN
      SELECT id_senal AS id FROM senal WHERE nombre_senal = p_nombre
      UNION
      SELECT id_senal FROM senal WHERE nombre_senal = LEFT(p_nombre, 180)
      UNION
      SELECT id_senal FROM senal WHERE nombre_senal LIKE CONCAT(LEFT(p_nombre, 170), '%')
      LIMIT 1;
    WHEN 'tendencia' THEN
      SELECT id_tendencia AS id FROM tendencia WHERE nombre_tendencia = p_nombre
      UNION
      SELECT id_tendencia FROM tendencia WHERE nombre_tendencia = LEFT(p_nombre, 180)
      UNION
      SELECT id_tendencia FROM tendencia WHERE nombre_tendencia LIKE CONCAT(LEFT(p_nombre, 170), '%')
      LIMIT 1;
    WHEN 'escenario' THEN
      SELECT id_escenario AS id FROM escenario WHERE nombre_escenario = p_nombre
      UNION
      SELECT id_escenario FROM escenario WHERE nombre_escenario = LEFT(p_nombre, 180)
      UNION
      SELECT id_escenario FROM escenario WHERE nombre_escenario LIKE CONCAT(LEFT(p_nombre, 170), '%')
      LIMIT 1;
    ELSE
      SELECT NULL AS id;
  END CASE;
END $$

-- Procedimientos para importarRepository (señales/tendencias/escenarios con relaciones completas)
DROP PROCEDURE IF EXISTS radar_updateSenalImportar $$
CREATE PROCEDURE radar_updateSenalImportar(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_pais_origen VARCHAR(100),
  IN p_fecha_art   DATE,
  IN p_id_topico   INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON
)
BEGIN
  UPDATE senal
  SET titulo_senal        = p_titulo,
      nombre_senal        = p_nombre,
      desc_corta_senal    = p_desc_corta,
      desc_larga_senal    = p_desc_larga,
      razon_cambio        = p_razon,
      fuente_senal        = p_fuente,
      url_fuente          = p_url_fuente,
      url_imagen_senal    = p_imagen,
      url_video_senal     = p_video,
      pais_origen         = p_pais_origen,
      fecha_senal_articulo = p_fecha_art,
      id_topico           = p_id_topico,
      id_estado           = 1,
      fecha_publicacion   = IF(fecha_publicacion IS NULL, NOW(), fecha_publicacion),
      fecha_actualizacion = NOW()
  WHERE id_senal = p_id;

  DELETE FROM senal_pestel WHERE id_senal = p_id;
  DELETE FROM senal_sector  WHERE id_senal = p_id;

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO senal_pestel (id_senal, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO senal_sector (id_senal, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_updateTendenciaImportar $$
CREATE PROCEDURE radar_updateTendenciaImportar(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_autor       VARCHAR(300),
  IN p_id_topico   INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON
)
BEGIN
  UPDATE tendencia
  SET titulo_tendencia      = p_titulo,
      nombre_tendencia      = p_nombre,
      desc_corta_tendencia  = p_desc_corta,
      desc_larga_tendencia  = p_desc_larga,
      razon_cambio          = p_razon,
      fuente_tendencia      = p_fuente,
      url_fuente            = p_url_fuente,
      url_imagen_tendencia  = p_imagen,
      url_video_tendencia   = p_video,
      autor                 = p_autor,
      id_topico             = p_id_topico,
      id_estado             = 1,
      fecha_publicacion     = IF(fecha_publicacion IS NULL, NOW(), fecha_publicacion),
      fecha_actualizacion   = NOW()
  WHERE id_tendencia = p_id;

  DELETE FROM tendencia_pestel WHERE id_tendencia = p_id;
  DELETE FROM tendencia_sector  WHERE id_tendencia = p_id;

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_updateEscenarioImportar $$
CREATE PROCEDURE radar_updateEscenarioImportar(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_referencias TEXT,
  IN p_horizonte   VARCHAR(100),
  IN p_prob        INT,
  IN p_autor       VARCHAR(300),
  IN p_id_topico   INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON
)
BEGIN
  UPDATE escenario
  SET titulo_escenario      = p_titulo,
      nombre_escenario      = p_nombre,
      desc_corta_escenario  = p_desc_corta,
      desc_larga_escenario  = p_desc_larga,
      razon_cambio          = p_razon,
      fuente_escenario      = p_fuente,
      url_fuente            = p_url_fuente,
      url_imagen_escenario  = p_imagen,
      url_video_escenario   = p_video,
      referencias_escenario = p_referencias,
      horizonte_escenario   = p_horizonte,
      probabilidad          = p_prob,
      autor                 = p_autor,
      id_topico             = p_id_topico,
      id_estado             = 1,
      fecha_publicacion     = IF(fecha_publicacion IS NULL, NOW(), fecha_publicacion),
      fecha_actualizacion   = NOW()
  WHERE id_escenario = p_id;

  DELETE FROM escenario_pestel WHERE id_escenario = p_id;
  DELETE FROM escenario_sector  WHERE id_escenario = p_id;

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO escenario_sector (id_escenario, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_insertSenalImportar $$
CREATE PROCEDURE radar_insertSenalImportar(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_pais_origen VARCHAR(100),
  IN p_fecha_art   DATE,
  IN p_id_topico   INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON
)
BEGIN
  INSERT INTO senal
    (id_senal, titulo_senal, nombre_senal,
     desc_corta_senal, desc_larga_senal, razon_cambio,
     fuente_senal, url_fuente,
     url_imagen_senal, url_video_senal,
     pais_origen, fecha_senal_articulo,
     id_topico, id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga, p_razon,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_pais_origen, p_fecha_art,
     p_id_topico, 1, p_usuario_id, NOW());

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO senal_pestel (id_senal, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO senal_sector (id_senal, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_insertTendenciaImportar $$
CREATE PROCEDURE radar_insertTendenciaImportar(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_autor       VARCHAR(300),
  IN p_id_topico   INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON
)
BEGIN
  INSERT INTO tendencia
    (id_tendencia, titulo_tendencia, nombre_tendencia,
     desc_corta_tendencia, desc_larga_tendencia, razon_cambio,
     fuente_tendencia, url_fuente,
     url_imagen_tendencia, url_video_tendencia,
     autor, id_topico, id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga, p_razon,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_autor, p_id_topico, 1, p_usuario_id, NOW());

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS radar_insertEscenarioImportar $$
CREATE PROCEDURE radar_insertEscenarioImportar(
  IN p_id          CHAR(36),
  IN p_titulo      VARCHAR(500),
  IN p_nombre      VARCHAR(300),
  IN p_desc_corta  TEXT,
  IN p_desc_larga  TEXT,
  IN p_razon       TEXT,
  IN p_fuente      VARCHAR(500),
  IN p_url_fuente  TEXT,
  IN p_imagen      TEXT,
  IN p_video       TEXT,
  IN p_referencias TEXT,
  IN p_horizonte   VARCHAR(100),
  IN p_prob        INT,
  IN p_autor       VARCHAR(300),
  IN p_id_topico   INT,
  IN p_usuario_id  INT,
  IN p_pestel_json JSON,
  IN p_sector_json JSON
)
BEGIN
  INSERT INTO escenario
    (id_escenario, titulo_escenario, nombre_escenario,
     desc_corta_escenario, desc_larga_escenario, razon_cambio,
     fuente_escenario, url_fuente,
     url_imagen_escenario, url_video_escenario,
     referencias_escenario,
     horizonte_escenario, probabilidad,
     autor, id_topico, id_estado, id_usuario_creador, fecha_publicacion)
  VALUES
    (p_id, p_titulo, p_nombre, p_desc_corta, p_desc_larga, p_razon,
     p_fuente, p_url_fuente, p_imagen, p_video,
     p_referencias,
     p_horizonte, p_prob,
     p_autor, p_id_topico, 1, p_usuario_id, NOW());

  IF JSON_LENGTH(p_pestel_json) > 0 THEN
    INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel)
    SELECT p_id, jt.v FROM JSON_TABLE(p_pestel_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;

  IF JSON_LENGTH(p_sector_json) > 0 THEN
    INSERT IGNORE INTO escenario_sector (id_escenario, id_sector)
    SELECT p_id, jt.v FROM JSON_TABLE(p_sector_json, '$[*]' COLUMNS(v INT PATH '$')) AS jt;
  END IF;
END $$

DELIMITER ;
