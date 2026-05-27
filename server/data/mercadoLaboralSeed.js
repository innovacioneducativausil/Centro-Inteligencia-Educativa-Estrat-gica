const commonStudent = [
  'Fortalecer portafolio profesional con evidencias, certificaciones y proyectos reales.',
  'Dominar herramientas digitales, analitica aplicada y comunicacion profesional.',
  'Practicar entrevistas y adaptar CV/LinkedIn al perfil laboral objetivo.',
  'Participar en retos, practicas, voluntariados o proyectos con empresas del sector.',
];

const commonCurricular = [
  'Integrar casos reales del mercado laboral en cursos troncales y electivos.',
  'Actualizar resultados de aprendizaje segun habilidades tecnicas, digitales y blandas demandadas.',
  'Incorporar proyectos aplicados con uso de datos, IA y herramientas sectoriales.',
  'Promover experiencias practicas interdisciplinarias con evaluacion por evidencias.',
];

const templates = {
  hoteleria: {
    puestos: [
      ['Alimentos y Bebidas (Mesero, Barista, Anfitrion)', 'Servicio de mesas, montaje, comunicacion con cocina y atencion en banquetes.', '300'],
      ['Recepcionista / Front Desk', 'Check-in/out, atencion al huesped, facturacion y coordinacion con otras areas.', '180'],
      ['Housekeeping / Camarero(a)', 'Limpieza de habitaciones y areas publicas, reposicion de suministros e inventarios.', '100'],
      ['Agente o Coordinador de Reservas', 'Gestion de solicitudes de alojamiento, confirmacion de disponibilidades y canales.', '80'],
      ['Coordinador de Eventos y Banquetes', 'Organizacion de eventos, coordinacion de catering y supervision de servicios.', '70'],
    ],
    habilidades: [
      ['Habilidades de Servicio y Hospitalidad', ['Atencion al cliente proactiva', 'Comunicacion efectiva', 'Empatia y trato amable', 'Resolucion de problemas y manejo de quejas']],
      ['Habilidades Operativas', ['Procesos de check-in/out', 'Gestion de reservas', 'Manejo de caja y facturacion', 'Tecnicas de limpieza y servicio de alimentos']],
      ['Habilidades Comerciales y de Revenue', ['Upselling', 'Analisis de ocupacion', 'Negociacion con proveedores', 'Gestion basica de presupuestos']],
      ['Habilidades Blandas Transversales', ['Liderazgo y coordinacion de equipos', 'Adaptabilidad a turnos rotativos', 'Trabajo en equipo', 'Organizacion y atencion al detalle']],
    ],
    herramientas: [
      ['Idiomas', 'Ingles intermedio o avanzado indispensable; portugues o frances altamente valorados.'],
      ['Sistemas de Gestion Hotelera (PMS)', 'Opera, Workday, eZee y plataformas de reservas.'],
      ['Herramientas Digitales y de Oficina', 'Excel avanzado, POS, ERP y reportes operativos.'],
      ['Gestion de Canales (OTAs)', 'Booking, Expedia, Airbnb y tableros de business intelligence.'],
      ['Protocolos Especializados', 'Sanitizacion, seguridad ocupacional y sostenibilidad ambiental.'],
    ],
    tendencias: [
      ['Crecimiento del Revenue Management', 'Mayor demanda de analistas que ajustan tarifas con datos y RevPAR.'],
      ['Hiper-personalizacion', 'Experiencias memorables y personalizadas ganan terreno frente a roles operativos tradicionales.'],
      ['Digitalizacion y Marketing Online', 'Canales digitales y e-commerce hotelero crecen rapidamente.'],
      ['Sostenibilidad', 'Roles vinculados a gestion ambiental y turismo responsable aumentan su valor.'],
      ['Estructuras Multifuncionales', 'Perfiles hibridos rotan entre F&B, eventos y recepcion para optimizar costos.'],
    ],
    objetivo: 'Formar profesionales hibridos, digitales y estrategicos, capaces de pasar de roles operativos a posiciones de supervision y gestion estrategica en 2 a 5 anos.',
  },
  cocina: {
    puestos: [
      ['Ayudante de cocina / Commis', 'Mise en place, limpieza, cortes, porcionado y soporte operativo.', '20%'],
      ['Cocinero de linea / Cocinero junior', 'Ejecucion en estaciones frias, calientes, plancha o fritura.', '16%'],
      ['Pastelero/a o Panadero/a', 'Elaboracion de masas, postres, panes y control de fermentacion.', '10%'],
      ['Steward / Lavador', 'Limpieza, reposicion de utensilios y apoyo al flujo de servicio.', '8%'],
      ['Cocinero / Chef de produccion', 'Planificacion de produccion, control de costos y estandarizacion.', '7%'],
    ],
    habilidades: [
      ['Habilidades Operativas y de Calidad', ['Buenas practicas de manufactura', 'Manejo de sistemas HACCP', 'Control de insumos e inventarios', 'Estandarizacion de procesos']],
      ['Habilidades Blandas', ['Trabajo bajo presion', 'Rapidez y compromiso', 'Disciplina y responsabilidad', 'Comunicacion en brigada']],
      ['Gestion y Liderazgo', ['Planificacion de menus', 'Liderazgo de brigadas', 'Control de costos', 'Vision de negocio']],
      ['Adaptacion e Innovacion', ['Creatividad culinaria', 'Aprendizaje de tendencias', 'Curiosidad y mejora continua', 'Cocina saludable y sostenible']],
    ],
    herramientas: [
      ['Tecnicas Culinarias', 'Cortes clasicos, salsas, fondos, mise en place, coccion y emplatado.'],
      ['Tecnologia y Sistemas', 'POS, gestion de pedidos, plataformas delivery y analitica operacional.'],
      ['Idiomas', 'Ingles enfocado en terminologia culinaria y atencion a turistas.'],
      ['Certificaciones', 'HACCP, food design, sostenibilidad alimentaria y conservacion.'],
      ['Costeo y Estandarizacion', 'Recetas, fichas tecnicas, merma, inventarios y rentabilidad.'],
    ],
    tendencias: [
      ['Dark Kitchens', 'Crecimiento del modelo delivery y cocinas de produccion estandarizada.'],
      ['Cocina Saludable y Sostenible', 'Aumenta la demanda por menus plant-based, trazables y nutritivos.'],
      ['Tecnologia Inmersiva y Datos', 'Analitica, realidad aumentada y sensores optimizan operaciones.'],
      ['Crecimiento del Sector Hotelero', 'Mayor demanda en hoteles, restaurantes y catering especializado.'],
      ['Experiencias Gastronomicas', 'El mercado valora propuestas memorables, locales e innovadoras.'],
    ],
    objetivo: 'Formar profesionales culinarios integrales, innovadores y sostenibles, capaces de liderar cocinas tradicionales, dark kitchens y emprendimientos gastronomicos.',
  },
  negocio: {
    puestos: [
      ['Analista / Asistente de Gestion', 'Seguimiento de indicadores, reportes, procesos y soporte a decisiones.', 'alta'],
      ['Coordinador Comercial o Administrativo', 'Gestion de clientes, proveedores, ventas y operaciones internas.', 'alta'],
      ['Ejecutivo de Cuentas / Ventas', 'Prospeccion, negociacion y fidelizacion de clientes.', 'media'],
      ['Analista de Datos o Planeamiento', 'Modelamiento de informacion, dashboards y control presupuestal.', 'media'],
      ['Asistente de Proyectos', 'Documentacion, coordinacion y ejecucion de iniciativas transversales.', 'media'],
    ],
    habilidades: [
      ['Gestion y Analisis', ['Analisis de datos', 'Planeamiento', 'Control de indicadores', 'Toma de decisiones']],
      ['Comerciales', ['Negociacion', 'Prospeccion', 'Relacionamiento con clientes', 'Gestion de canales']],
      ['Digitales', ['Excel avanzado', 'Power BI', 'CRM', 'Automatizacion con IA']],
      ['Blandas', ['Comunicacion ejecutiva', 'Trabajo colaborativo', 'Adaptabilidad', 'Pensamiento critico']],
    ],
    herramientas: [
      ['Excel y Power BI', 'Analisis de datos, tableros e indicadores de gestion.'],
      ['CRM y ERP', 'Salesforce, HubSpot, SAP u otros sistemas de gestion empresarial.'],
      ['IA Generativa', 'Automatizacion de reportes, investigacion y productividad.'],
      ['Gestion de Proyectos', 'Trello, Jira, Asana, metodologias agiles y OKR.'],
      ['Analitica de Mercado', 'Benchmark, investigacion, pricing y seguimiento competitivo.'],
    ],
    tendencias: [
      ['Perfiles Hibridos', 'Crecen roles que combinan negocio, datos, tecnologia y comunicacion.'],
      ['Automatizacion e IA', 'La productividad aumenta con asistentes digitales y analitica predictiva.'],
      ['Decisiones Basadas en Datos', 'Empresas demandan profesionales capaces de traducir datos en accion.'],
      ['Experiencia del Cliente', 'La personalizacion y fidelizacion guian la estrategia comercial.'],
      ['Sostenibilidad y Gobierno', 'ESG y cumplimiento influyen en decisiones de gestion.'],
    ],
    objetivo: 'Formar profesionales capaces de gestionar negocios con vision analitica, digital, comercial y estrategica.',
  },
  salud: {
    puestos: [
      ['Asistente / Tecnologo de Servicios de Salud', 'Soporte en atencion, procedimientos y registro de informacion clinica.', 'alta'],
      ['Coordinador de Programas o Bienestar', 'Seguimiento de pacientes, educacion y actividades preventivas.', 'media'],
      ['Analista de Calidad o Gestion Clinica', 'Indicadores, protocolos, auditorias y mejora continua.', 'media'],
      ['Especialista de Rehabilitacion o Cuidado', 'Intervenciones tecnicas y acompanamiento segun especialidad.', 'media'],
      ['Promotor de Salud Digital', 'Uso de herramientas virtuales y teleorientacion.', 'emergente'],
    ],
    habilidades: [
      ['Atencion y Seguridad', ['Bioseguridad', 'Empatia', 'Comunicacion con pacientes', 'Registro responsable']],
      ['Tecnicas', ['Protocolos de intervencion', 'Evaluacion funcional', 'Educacion preventiva', 'Manejo de casos']],
      ['Gestion Clinica', ['Calidad', 'Indicadores', 'Trabajo interdisciplinario', 'Continuidad del cuidado']],
      ['Digitales', ['Telemedicina', 'Historia clinica digital', 'Analitica basica', 'Herramientas colaborativas']],
    ],
    herramientas: [
      ['Historia Clinica Digital', 'Registro, trazabilidad y seguimiento de pacientes.'],
      ['Protocolos Clinicos', 'Guias, normativas, seguridad y calidad asistencial.'],
      ['Telemedicina', 'Canales digitales para orientacion y monitoreo remoto.'],
      ['Analitica en Salud', 'Indicadores, reportes y tableros para gestion de servicios.'],
      ['Equipamiento Especializado', 'Herramientas tecnicas propias de cada disciplina.'],
    ],
    tendencias: [
      ['Salud Digital', 'Mayor adopcion de teleatencion, monitoreo remoto y registros interoperables.'],
      ['Prevencion y Bienestar', 'El mercado demanda perfiles orientados a promocion de salud.'],
      ['Atencion Centrada en el Paciente', 'Experiencia, continuidad y trato humano son diferenciales clave.'],
      ['Gestion de Calidad', 'Protocolos, auditorias y seguridad del paciente ganan relevancia.'],
      ['Equipos Interdisciplinarios', 'La colaboracion entre especialidades define mejores resultados.'],
    ],
    objetivo: 'Formar profesionales de salud con dominio tecnico, criterio etico, competencias digitales y enfoque humano.',
  },
  educacion: {
    puestos: [
      ['Docente de Especialidad', 'Planificacion, ensenanza, evaluacion y acompanamiento de estudiantes.', 'alta'],
      ['Auxiliar / Asistente Pedagogico', 'Apoyo en aula, seguimiento y recursos educativos.', 'media'],
      ['Coordinador Academico', 'Gestion curricular, acompanamiento docente e indicadores.', 'media'],
      ['Disenador de Recursos Educativos', 'Materiales, experiencias y contenidos digitales.', 'emergente'],
      ['Tutor / Orientador', 'Acompanamiento socioemocional y academico.', 'media'],
    ],
    habilidades: [
      ['Pedagogicas', ['Planificacion didactica', 'Evaluacion formativa', 'Gestion de aula', 'Inclusividad']],
      ['Comunicacion', ['Claridad oral', 'Escucha activa', 'Retroalimentacion', 'Relacion con familias']],
      ['Digitales', ['Herramientas LMS', 'Recursos interactivos', 'IA aplicada', 'Analitica educativa']],
      ['Gestion Educativa', ['Trabajo colaborativo', 'Innovacion', 'Acompanamiento', 'Mejora continua']],
    ],
    herramientas: [
      ['LMS y Plataformas Educativas', 'Moodle, Classroom, Canvas y sistemas de seguimiento.'],
      ['Recursos Digitales', 'Herramientas interactivas, evaluaciones online y repositorios.'],
      ['IA Educativa', 'Apoyo a planificacion, retroalimentacion y personalizacion.'],
      ['Evaluacion y Rubricas', 'Instrumentos para medir desempeno y progreso.'],
      ['Ingles y Competencias Globales', 'Recursos bilingues y enfoque intercultural cuando aplica.'],
    ],
    tendencias: [
      ['Aprendizaje Personalizado', 'Aumenta la demanda por estrategias adaptativas y datos educativos.'],
      ['IA en Educacion', 'La IA se integra a planificacion, tutoria y creacion de recursos.'],
      ['Bienestar Socioemocional', 'Las instituciones priorizan acompanamiento integral.'],
      ['Educacion Inclusiva', 'Crecen perfiles con dominio de diversidad y ajustes razonables.'],
      ['Competencias Digitales', 'La docencia requiere manejo de plataformas y contenidos interactivos.'],
    ],
    objetivo: 'Formar educadores innovadores, inclusivos y digitales, capaces de mejorar aprendizajes con evidencia.',
  },
  ingenieria: {
    puestos: [
      ['Analista / Ingeniero Junior', 'Soporte tecnico, mejora de procesos, documentacion y analisis operativo.', 'alta'],
      ['Especialista de Datos o Automatizacion', 'Dashboards, scripts, integraciones y optimizacion.', 'alta'],
      ['Coordinador de Proyectos', 'Planificacion, control de avances y coordinacion tecnica.', 'media'],
      ['Consultor Tecnico', 'Diagnostico, implementacion y soporte a soluciones especializadas.', 'media'],
      ['Asistente de Calidad / Operaciones', 'Control de estandares, indicadores y mejora continua.', 'media'],
    ],
    habilidades: [
      ['Tecnicas', ['Modelamiento', 'Analisis cuantitativo', 'Resolucion de problemas', 'Documentacion tecnica']],
      ['Digitales', ['Programacion basica', 'Power BI', 'Cloud o automatizacion', 'IA aplicada']],
      ['Gestion', ['Gestion de proyectos', 'Calidad', 'Indicadores', 'Mejora continua']],
      ['Blandas', ['Comunicacion tecnica', 'Trabajo interdisciplinario', 'Adaptabilidad', 'Pensamiento sistemico']],
    ],
    herramientas: [
      ['Software Especializado', 'Herramientas propias de la disciplina, simuladores y plataformas tecnicas.'],
      ['Analitica y BI', 'Excel avanzado, Power BI, SQL y tableros de indicadores.'],
      ['Gestion de Proyectos', 'Jira, MS Project, metodologias agiles y control de riesgos.'],
      ['Automatizacion e IA', 'Scripts, flujos automatizados, modelos predictivos y asistentes IA.'],
      ['Normas y Calidad', 'Estandares, seguridad, documentacion y cumplimiento regulatorio.'],
    ],
    tendencias: [
      ['Industria 4.0 e IA', 'Automatizacion, datos e inteligencia artificial redefinen los procesos.'],
      ['Sostenibilidad y Eficiencia', 'Crece la demanda por soluciones con menor impacto y mayor productividad.'],
      ['Ciberseguridad y Datos', 'La proteccion de informacion y calidad de datos se vuelve transversal.'],
      ['Perfiles Multidisciplinarios', 'El mercado busca ingenieros que conecten tecnologia, negocio y usuarios.'],
      ['Gestion por Evidencia', 'La toma de decisiones se apoya en metricas, simulacion y analitica.'],
    ],
    objetivo: 'Formar ingenieros con dominio tecnico, pensamiento analitico, uso de datos e impacto sostenible.',
  },
  derecho: {
    puestos: [
      ['Asistente Legal / Practicante', 'Revision documental, escritos, seguimiento de expedientes y soporte legal.', 'alta'],
      ['Analista de Cumplimiento', 'Control normativo, riesgos, prevencion y reportes.', 'media'],
      ['Consultor Corporativo', 'Contratos, gobierno corporativo y asesoria empresarial.', 'media'],
      ['Gestor de Relaciones Institucionales', 'Seguimiento regulatorio y coordinacion con actores publicos.','emergente'],
      ['Especialista Legal Digital', 'Proteccion de datos, tecnologia, contratos digitales y compliance.', 'emergente'],
    ],
    habilidades: [
      ['Juridicas', ['Analisis normativo', 'Redaccion legal', 'Argumentacion', 'Investigacion juridica']],
      ['Gestion', ['Organizacion documental', 'Seguimiento de casos', 'Cumplimiento', 'Gestion de riesgos']],
      ['Digitales', ['Legaltech', 'Bases de datos juridicas', 'Proteccion de datos', 'IA aplicada']],
      ['Blandas', ['Negociacion', 'Comunicacion ejecutiva', 'Etica', 'Pensamiento critico']],
    ],
    herramientas: [
      ['Bases Legales', 'Repositorios normativos, jurisprudencia y seguimiento de expedientes.'],
      ['Legaltech', 'Gestion documental, automatizacion de contratos y firmas digitales.'],
      ['Compliance', 'Matrices de riesgo, controles y reportes regulatorios.'],
      ['Proteccion de Datos', 'Herramientas y criterios para privacidad y seguridad de informacion.'],
      ['Ofimatica Avanzada', 'Word, Excel y plataformas colaborativas para gestion legal.'],
    ],
    tendencias: [
      ['Compliance y Riesgos', 'Las empresas requieren perfiles que prevengan sanciones y fortalezcan gobierno.'],
      ['Legaltech e IA', 'Automatizacion de documentos y busqueda juridica transforman la practica.'],
      ['Proteccion de Datos', 'Privacidad, ciberseguridad y regulacion digital ganan peso.'],
      ['Derecho Corporativo Agil', 'Contratos y asesoria deben responder a negocios dinamicos.'],
      ['Enfoque Interdisciplinario', 'Se valora combinar derecho, negocio, tecnologia y comunicacion.'],
    ],
    objetivo: 'Formar profesionales legales con criterio juridico, etica, manejo digital y vision empresarial.',
  },
};

function iconless(items) {
  return items.map(([nombre, descripcion, vacantes], index) => ({ id: index + 1, nombre, descripcion, vacantes }));
}

function mapPairs(items, key1, key2) {
  return items.map(([a, b]) => ({ [key1]: a, [key2]: b }));
}

function makeReport({ facultad, carrera, slide, perfil, titulo, descripcion, insight }) {
  const t = templates[perfil];
  return {
    nombre: carrera,
    periodo: 'Peru 2025 - 2026',
    documentoInformeUrl: `/mercado-laboral/informes/slide-${slide}.png`,
    tituloHeader: (titulo || carrera).toUpperCase(),
    descripcionHeader: descripcion || `Panorama actual y proyecciones estrategicas para la formacion y desarrollo profesional en ${carrera}.`,
    insightHeader: insight || 'Mercado laboral en transformacion: mayor demanda de perfiles digitales, analiticos, sostenibles y orientados a resultados.',
    descripcion: descripcion || `Informe tecnico del mercado laboral para ${carrera}.`,
    puestos: iconless(t.puestos),
    habilidades: t.habilidades.map(([categoria, habilidades]) => ({ categoria, habilidades })),
    herramientas: mapPairs(t.herramientas, 'nombre', 'descripcion'),
    tendencias: mapPairs(t.tendencias, 'titulo', 'descripcion'),
    recomendacionesDocentes: commonStudent,
    recomendacionesCurriculares: commonCurricular,
    objetivoFinal: t.objetivo,
    facultad,
  };
}

const careers = [
  ['Facultad de Administracion Hotelera, Turismo y Gastronomia', 'Administracion Hotelera', 4, 'hoteleria', 'Administracion Hotelera', 'Panorama actual y proyecciones estrategicas para la formacion y desarrollo profesional en el sector hotelero peruano.', 'Sector en recuperacion y transformacion: mas digital, sostenible y orientado a la experiencia del huesped.'],
  ['Facultad de Administracion Hotelera, Turismo y Gastronomia', 'Arte Culinario', 5, 'cocina', 'Arte Culinario', 'Panorama actual y proyecciones estrategicas para la formacion profesional en el sector gastronomico peruano.', 'Sector dinamico e innovador impulsado por sostenibilidad, digitalizacion y experiencias gastronomicas de calidad.'],
  ['Facultad de Administracion Hotelera, Turismo y Gastronomia', 'Gestion e Innovacion en Gastronomia', 6, 'cocina'],
  ['Facultad de Arquitectura', 'Arquitectura, Urbanismo y Territorio', 8, 'ingenieria'],
  ['Facultad de Artes y Humanidades', 'Arte y Diseno Empresarial', 10, 'negocio'],
  ['Facultad de Artes y Humanidades', 'Musica', 11, 'negocio'],
  ['Facultad de Ciencias de la Salud', 'Ciencias de la Actividad Fisica y del Deporte', 13, 'salud'],
  ['Facultad de Ciencias de la Salud', 'Enfermeria', 14, 'salud'],
  ['Facultad de Ciencias de la Salud', 'Tecnologia Medica en Terapia Fisica y Rehabilitacion', 15, 'salud'],
  ['Facultad de Ciencias Empresariales', 'Administracion y Emprendimiento', 17, 'negocio'],
  ['Facultad de Ciencias Empresariales', 'Administracion y Finanzas Corporativas', 18, 'negocio'],
  ['Facultad de Ciencias Empresariales', 'Digital Business Management', 19, 'negocio'],
  ['Facultad de Ciencias Empresariales', 'Economia y Finanzas', 20, 'negocio'],
  ['Facultad de Ciencias Empresariales', 'Economia y Negocios Internacionales', 21, 'negocio'],
  ['Facultad de Ciencias Empresariales', 'International Business', 22, 'negocio'],
  ['Facultad de Ciencias Empresariales', 'Marketing', 23, 'negocio'],
  ['Facultad de Derecho', 'Derecho', 25, 'derecho'],
  ['Facultad de Derecho', 'Relaciones Internacionales', 26, 'derecho'],
  ['Facultad de Educacion', 'Educacion Secundaria con Especialidad en Ingles', 28, 'educacion'],
  ['Facultad de Educacion', 'Educacion Inicial', 29, 'educacion'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ciencia de Datos', 31, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Agroindustrial', 32, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Ambiental', 33, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Biomedica', 34, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Civil', 35, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Empresarial', 36, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria en Ciberseguridad', 37, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria en Industrias Alimentarias', 38, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Industrial y Comercial', 39, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria Mecatronica', 40, 'ingenieria'],
  ['Facultad de Ingenieria e Inteligencia Artificial', 'Ingenieria de Sistemas de Informacion', 41, 'ingenieria'],
];

const grouped = new Map();
for (const [facultad, carrera, slide, perfil, titulo, descripcion, insight] of careers) {
  if (!grouped.has(facultad)) grouped.set(facultad, { nombre: facultad, carreras: [] });
  grouped.get(facultad).carreras.push(makeReport({ facultad, carrera, slide, perfil, titulo, descripcion, insight }));
}

export const mercadoLaboralSeed = Array.from(grouped.values());

export const metodologiaMercadoLaboralSeed = [
  {
    titulo: 'Busqueda y consolidacion',
    descripcion: 'Revision de ofertas laborales y tendencias sectoriales asociadas a las carreras USIL.',
  },
  {
    titulo: 'Estructuracion por carrera',
    descripcion: 'Organizacion de puestos frecuentes, habilidades, herramientas, tendencias y recomendaciones.',
  },
  {
    titulo: 'Curaduria academica',
    descripcion: 'Traduccion de hallazgos a sugerencias de empleabilidad y diseno curricular.',
  },
];
