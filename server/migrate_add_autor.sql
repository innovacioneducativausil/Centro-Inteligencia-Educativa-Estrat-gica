-- Agrega columna "autor" a las tres tablas principales
-- Ejecutar una sola vez contra la base de datos radar_db

ALTER TABLE senal
  ADD COLUMN autor VARCHAR(255) NULL DEFAULT NULL
  AFTER pais_origen;

ALTER TABLE tendencia
  ADD COLUMN autor VARCHAR(255) NULL DEFAULT NULL
  AFTER razon_cambio;

ALTER TABLE escenario
  ADD COLUMN autor VARCHAR(255) NULL DEFAULT NULL
  AFTER razon_cambio;
