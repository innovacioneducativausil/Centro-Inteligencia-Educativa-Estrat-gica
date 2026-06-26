
USE mallas_usil;
UPDATE carrera SET nombre_carrera = 'Administración en Turismo'
WHERE nombre_carrera = 'Turismo y Negocios';
UPDATE carrera SET nombre_carrera = 'Gestión e Innovación en Gastronomía'
WHERE nombre_carrera = 'Gastronomía y Gestión de Restaurantes';
UPDATE carrera SET nombre_carrera = 'Arquitectura, Urbanismo y Territorio'
WHERE nombre_carrera = 'Arquitectura';
UPDATE carrera SET nombre_carrera = 'Arte y Diseño Empresarial'
WHERE nombre_carrera = 'Diseño Gráfico y Comunicación Visual';
UPDATE carrera SET nombre_carrera = 'Ingeniería de Software'
WHERE nombre_carrera = 'Ingeniería de Software e Inteligencia Artificial';
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos)
VALUES ('Arte Culinario', 1, 10);
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos)
VALUES ('Música', 3, 10);
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos) VALUES
  ('Ciencias de la Actividad Física y del Deporte', 4, 10),
  ('Enfermería',                                    4, 10),
  ('Medicina Humana',                               4, 12),
  ('Nutrición y Dietética',                         4, 10),
  ('Tecnología Médica en Terapia Física y Rehabilitación', 4, 10);
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos)
VALUES ('Ingeniería Empresarial', 5, 10);
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos)
VALUES ('Relaciones Internacionales', 6, 10);
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos)
VALUES ('Educación Secundaria con Especialidad en Inglés', 8, 10);
INSERT IGNORE INTO carrera (nombre_carrera, id_facultad, total_ciclos) VALUES
  ('Ciencia de Datos',                          9, 10),
  ('Ingeniería Agroindustrial',                 9, 10),
  ('Ingeniería Biomédica',                      9, 10),
  ('Ingeniería Civil',                          9, 10),
  ('Ingeniería de Sistemas de Información',     9, 10),
  ('Ingeniería en Ciberseguridad',              9, 10),
  ('Ingeniería en Industrias Alimentarias',     9, 10),
  ('Ingeniería Mecatrónica',                    9, 10);
SELECT f.nombre_facultad, ca.nombre_carrera, ca.total_ciclos
FROM carrera ca
JOIN facultad f ON ca.id_facultad = f.id_facultad
ORDER BY f.nombre_facultad, ca.nombre_carrera;
