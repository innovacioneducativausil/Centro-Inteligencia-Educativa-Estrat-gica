
USE empleabilidad_usil;
ALTER TABLE encuesta_anual
  MODIFY COLUMN es_emprendedor TINYINT(1) NULL DEFAULT NULL;
UPDATE encuesta_anual ea
JOIN egresado eg ON eg.id_egresado = ea.id_egresado
JOIN carrera c ON c.id_carrera = eg.id_carrera
JOIN tipo_programa tp ON tp.id_tipo_programa = c.id_tipo_programa
SET ea.es_emprendedor = NULL
WHERE ea.anio_encuesta = 2022
  AND ea.es_emprendedor = 0
  AND (ea.fuente_carga LIKE '%2022%' OR ea.fuente_carga IS NULL);

UPDATE encuesta_anual ea
JOIN egresado eg ON eg.id_egresado = ea.id_egresado
JOIN carrera c ON c.id_carrera = eg.id_carrera
JOIN tipo_programa tp ON tp.id_tipo_programa = c.id_tipo_programa
SET ea.es_emprendedor = NULL
WHERE ea.anio_encuesta = 2023
  AND tp.descripcion IN ('PREGRADO', 'CPEL')
  AND ea.es_emprendedor = 0
  AND ea.fuente_carga IN ('IMPORT_Q4_PREGRADO_CPEL_2023');
SELECT
  ea.anio_encuesta                                            AS anio,
  tp.descripcion                                             AS programa,
  COUNT(*)                                                   AS total,
  SUM(ea.trabaja)                                            AS trabajan,
  SUM(CASE WHEN ea.es_emprendedor IS NOT NULL THEN 1 END)    AS resp_emprende,
  SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 END)            AS emprendedores,
  ROUND(SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0) * 100, 1)                      AS pct_sobre_total,
  ROUND(SUM(CASE WHEN ea.es_emprendedor = 1 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN ea.es_emprendedor IS NOT NULL THEN 1 END), 0) * 100, 1) AS pct_sobre_respondieron
FROM encuesta_anual ea
JOIN egresado eg ON eg.id_egresado = ea.id_egresado
JOIN carrera c ON c.id_carrera = eg.id_carrera
JOIN tipo_programa tp ON tp.id_tipo_programa = c.id_tipo_programa
WHERE ea.encuestado = 1
GROUP BY ea.anio_encuesta, tp.descripcion
ORDER BY ea.anio_encuesta, tp.descripcion;
