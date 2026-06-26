
CREATE TABLE IF NOT EXISTS informe_empleabilidad (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(255)  NOT NULL,
  anio           INT           NOT NULL,
  unidad         VARCHAR(100)  NOT NULL,
  facultad       VARCHAR(150)  NOT NULL DEFAULT 'No aplica',
  url_descarga   TEXT,
  tipo_acceso    ENUM('descarga','sharepoint') DEFAULT 'descarga',
  activo         TINYINT(1)   DEFAULT 1,
  fecha_creacion TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO informe_empleabilidad (nombre, anio, unidad, facultad, url_descarga, tipo_acceso) VALUES
('Estudio de Empleabilidad Pregrado 2024',          2024, 'Pregrado',          'Ciencias Empresariales', NULL, 'descarga'),
('Estudio de Empleabilidad Pregrado 2024',          2024, 'Pregrado',          'Ingeniería',             NULL, 'descarga'),
('Estudio de Empleabilidad Pregrado 2024',          2024, 'Pregrado',          'Derecho',                NULL, 'descarga'),
('Estudio de Empleabilidad Pregrado Ejecutivo 2024',2024, 'Pregrado Ejecutivo','Ciencias Empresariales', NULL, 'descarga'),
('Estudio de Empleabilidad Posgrado 2024',          2024, 'Posgrado',          'No aplica',              NULL, 'sharepoint'),
('Estudio de Empleabilidad Doble Grado 2024',       2024, 'Doble Grado',       'No aplica',              NULL, 'descarga');
