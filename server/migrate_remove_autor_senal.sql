-- Elimina el campo autor de la tabla senal
-- El autor solo aplica a tendencias y escenarios, no a señales
-- Ejecutar en Railway MySQL: Data > Query

ALTER TABLE senal DROP COLUMN IF EXISTS autor;
