function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const URLS_BY_CAREER = {
  PSICOLOGIA: [
    ['UPC', 'malla_curricular', 'Malla curricular Psicologia UPC', 'https://pregrado.upc.edu.pe/carrera-de-psicologia/malla-curricular/'],
    ['ULIMA', 'malla_curricular', 'Malla curricular Psicologia ULIMA 2025', 'https://www.ulima.edu.pe/sites/default/files/2025-01/malla-psicologia-2025.pdf'],
    ['USMP', 'malla_curricular', 'Malla curricular Psicologia USMP', 'https://fcctp.usmp.edu.pe/site/programas-academicos/pregrado/psicologia/malla-curricular/'],
    ['UTP', 'malla_curricular', 'Malla curricular Psicologia UTP', 'https://utp.edu.pe/pregrado/facultad-de-psicologia/psicologia/malla-curricular'],
  ],
  ADMINISTRACION: [
    ['PUCP', 'malla_curricular', 'Malla 2022 Gestion PUCP', 'https://facultad.pucp.edu.pe/gestion-direccion/pregrado-en-gestion/plan-de-estudios/malla-2022/'],
    ['PUCP', 'plan_estudios', 'Plan de estudios Gestion PUCP', 'https://facultad.pucp.edu.pe/gestion-direccion/pregrado-en-gestion/plan-de-estudios/'],
    ['UPC', 'malla_curricular', 'Malla curricular Administracion UPC', 'https://pregrado.upc.edu.pe/carrera-de-administracion/malla-curricular/'],
    ['USMP', 'plan_estudios', 'Plan de estudios Administracion USMP', 'https://www.administracion.usmp.edu.pe/administracion/plan-de-estudios/'],
    ['USMP', 'malla_curricular', 'Malla curricular Administracion USMP', 'https://www.administracion.usmp.edu.pe/negocios/wp-content/uploads/sites/18/2023/02/MALLA-CURRICULAR-ADMINISTRACION.pdf'],
    ['UNMSM', 'malla_curricular', 'Malla curricular Administracion UNMSM', 'https://administracion.unmsm.edu.pe/1web2022/wp-content/uploads/2022/02/MALLA-CURRICULAR-2018-ADMINISTRACION.pdf'],
  ],
  'ADMINISTRACION Y EMPRENDIMIENTO': 'ADMINISTRACION',
  'ADMINISTRACION Y FINANZAS CORPORATIVAS': [
    ['UP', 'plan_estudios', 'Plan de estudios Economia UP', 'https://www.up.edu.pe/carreras-postgrado-idiomas/carreras-pregrado/economia/paginas/plan-estudios.aspx'],
    ['UP', 'malla_curricular', 'Malla curricular Economia UP', 'https://www.up.edu.pe/en/degrees-graduate-studies-languages/undergraduates-degrees/economics/PublishingImages/Paginas/plan-estudios/malla_curricular_economia.pdf'],
    ['ULIMA', 'malla_curricular', 'Malla curricular Economia ULIMA 2025', 'https://www.ulima.edu.pe/sites/default/files/2025-01/malla-economia-2025.pdf'],
    ['ULIMA', 'plan_estudios', 'Plan de estudios Economia ULIMA 2026', 'https://www.ulima.edu.pe/sites/default/files/career/files/2_plan_de_estudios_formato_web_v6_16.12.25.pdf'],
  ],
  'DIGITAL BUSINESS MANAGEMENT': [
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Marketing UPC', 'https://pregrado.upc.edu.pe/carrera-de-administracion-y-marketing/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Marketing UPC PDF', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/documentos/pregrado/ADMINISTRACION%20Y%20MARKETING%20PREGRADO%20FDM%20P.pdf'],
  ],
  'ECONOMIA Y FINANZAS': [
    ['UP', 'plan_estudios', 'Plan de estudios Economia UP', 'https://www.up.edu.pe/carreras-postgrado-idiomas/carreras-pregrado/economia/paginas/plan-estudios.aspx'],
    ['UP', 'malla_curricular', 'Malla curricular Economia UP', 'https://www.up.edu.pe/en/degrees-graduate-studies-languages/undergraduates-degrees/economics/PublishingImages/Paginas/plan-estudios/malla_curricular_economia.pdf'],
    ['ULIMA', 'malla_curricular', 'Malla curricular Economia ULIMA 2025', 'https://www.ulima.edu.pe/sites/default/files/2025-01/malla-economia-2025.pdf'],
    ['UPC', 'malla_curricular', 'Malla curricular Economia y Negocios Internacionales UPC', 'https://pregrado.upc.edu.pe/carrera-de-economia-y-negocios-internacionales/malla-curricular'],
    ['ESAN', 'pagina_programa', 'Economia ESAN', 'https://www.ue.edu.pe/pregrado/carreras/economia'],
    ['UDEP', 'pagina_programa', 'Economia UDEP', 'https://www.udep.edu.pe/admision/lima/economia/'],
  ],
  'ECONOMIA Y NEGOCIOS INTERNACIONALES': [
    ['UPC', 'malla_curricular', 'Malla curricular Economia y Negocios Internacionales UPC', 'https://pregrado.upc.edu.pe/carrera-de-economia-y-negocios-internacionales/malla-curricular'],
    ['ULIMA', 'malla_curricular', 'Malla curricular Negocios Internacionales ULIMA', 'https://www.ulima.edu.pe/sites/default/files/2025-01/malla-negocios-int-2025.pdf'],
    ['UP', 'plan_estudios', 'Plan de estudios Economia UP', 'https://www.up.edu.pe/carreras-postgrado-idiomas/carreras-pregrado/economia/paginas/plan-estudios.aspx'],
  ],
  'INTERNATIONAL BUSINESS': [
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Negocios Internacionales UPC', 'https://pregrado.upc.edu.pe/carrera-de-administracion-y-negocios-internacionales/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Negocios Internacionales UPC PDF', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/documentos/pregrado/ADMINISTRACION%20Y%20NEGOCIOS%20INTERNACIONALES%20PREGRADO%20FDM%20PRESENCIAL.pdf'],
    ['ULIMA', 'malla_curricular', 'Malla curricular Negocios Internacionales ULIMA', 'https://www.ulima.edu.pe/sites/default/files/2025-01/malla-negocios-int-2025.pdf'],
  ],
  MARKETING: [
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Marketing UPC', 'https://pregrado.upc.edu.pe/carrera-de-administracion-y-marketing/malla-curricular/'],
    ['UP', 'plan_estudios', 'Plan de estudios Marketing UP', 'https://www.up.edu.pe/carreras-postgrado-idiomas/carreras-pregrado/marketing/Paginas/plan-estudios.aspx'],
    ['USMP', 'plan_estudios', 'Plan de estudios Marketing USMP', 'https://www.administracion.usmp.edu.pe/marketing/plan-de-estudios/'],
    ['UPN', 'malla_curricular', 'Malla curricular Administracion y Marketing UPN', 'https://www.upn.edu.pe/sites/default/files/malla-curricular/carrera-ug-administracion-marketing.pdf'],
  ],
  'ADMINISTRACION EN TURISMO': [
    ['UPC', 'pagina_programa', 'Turismo y Administracion UPC', 'https://pregrado.upc.edu.pe/facultad-de-administracion-en-hoteleria-y-turismo/turismo-y-administracion/'],
    ['UPC', 'brochure_pdf', 'Malla curricular Turismo y Administracion UPC PDF (malla 2024)', 'https://upc-cdn.b-cdn.net/mallas/minerva/ADMINISTRACION-EN-HOTELERIA-Y-TURISMO/TURISMO%20Y%20ADMINISTRACION%20PREGRADO%20FDM.pdf'],
    ['USMP', 'malla_curricular', 'Malla curricular Turismo USMP', 'https://fcctp.usmp.edu.pe/site/programas-academicos/pregrado/turismo/malla-curricular/'],
    ['USMP', 'malla_curricular', 'Malla curricular Turismo USMP 2022-2', 'https://fcctp.usmp.edu.pe/site/programas-academicos/pregrado/turismo/malla-curricular-2022-2/'],
    ['UNMSM', 'malla_curricular', 'Malla curricular Administracion de Turismo UNMSM PDF', 'https://administracion.unmsm.edu.pe/1web2022/wp-content/uploads/2022/02/Malla-Curricular-2018-EP-Turismo.pdf'],
    ['UNMSM', 'pagina_programa', 'Administracion de Turismo UNMSM', 'https://administracion.unmsm.edu.pe/e-p-administracion-de-turismo/'],
    ['UPN', 'malla_curricular', 'Malla curricular Administracion y Servicios Turisticos UPN', 'https://www.upn.edu.pe/carrera/administracion-y-servicios-turisticos'],
    ['UCV', 'pagina_programa', 'Administracion Turismo y Hoteleria UCV', 'https://www.ucv.edu.pe/sube-semipresencial/administracion-turismo-y-hoteleria'],
  ],
  'ADMINISTRACION HOTELERA': [
    ['UPC', 'pagina_programa', 'Hoteleria y Administracion UPC', 'https://pregrado.upc.edu.pe/facultad-de-administracion-en-hoteleria-y-turismo/hoteleria-y-administracion/'],
    ['UPC', 'malla_curricular', 'Malla curricular Administracion de Hoteleria y Turismo UPC EPE', 'https://epe.upc.edu.pe/carrera/administracion-de-hoteleria-y-turismo/malla-curricular/'],
    ['UTP', 'malla_curricular', 'Malla curricular Administracion Hotelera y de Turismo UTP PDF', 'https://utp.edu.pe/sites/default/files/mallas/MALLA_Administracion_Hotelera_y_de_Turismo.pdf'],
    ['UTP', 'malla_curricular', 'Malla curricular Administracion Hotelera y de Turismo UTP PDF alternativo', 'https://utp.edu.pe/sites/default/files/mallas/Administraci%C3%B3n%20Hotelera%20y%20de%20Turismo%20%28malla%29.pdf'],
  ],
  'ARTE CULINARIO': [
    ['UPC', 'malla_curricular', 'Malla curricular Gastronomia y Gestion Culinaria UPC', 'https://pregrado.upc.edu.pe/carrera-de-gastronomia-y-gestion-culinaria/malla-curricular/'],
  ],
  'GESTION E INNOVACION EN GASTRONOMIA': [
    ['UPC', 'malla_curricular', 'Malla curricular Gastronomia y Gestion Culinaria UPC', 'https://pregrado.upc.edu.pe/carrera-de-gastronomia-y-gestion-culinaria/malla-curricular/'],
  ],
  COMUNICACIONES: [
    ['USMP', 'malla_curricular', 'Malla curricular Comunicaciones USMP', 'https://fcctp.usmp.edu.pe/site/programas-academicos/pregrado/comunicaciones/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Comunicacion y Periodismo UPC', 'https://pregrado.upc.edu.pe/carrera-de-comunicacion-y-periodismo/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Comunicacion Audiovisual UPC', 'https://pregrado.upc.edu.pe/carrera-de-comunicacion-audiovisual-y-medios-interactivos/malla-curricular/'],
    ['ULIMA', 'pagina_programa', 'Communication ULIMA', 'https://www.ulima.edu.pe/en/undergraduate/communication'],
    ['UTP', 'malla_curricular', 'Malla curricular Ciencias de la Comunicacion UTP', 'https://utp.edu.pe/pregrado/facultad-de-comunicaciones/ciencias-de-la-comunicacion/malla-curricular'],
  ],
  'RELACIONES INTERNACIONALES': [
    ['PUCP', 'plan_estudios', 'Plan de estudios Relaciones Internacionales PUCP', 'https://facultad-ciencias-sociales.pucp.edu.pe/carreras/relaciones-internacionales/planes-de-estudio/'],
    ['PUCP', 'plan_estudios', 'Plan de estudios Relaciones Internacionales PUCP PDF', 'https://facultad-ciencias-sociales.pucp.edu.pe/wp-content/uploads/2024/09/Plan-de-Estudios-de-Relaciones-Internacionales-PUCP-2024-050924.pdf'],
    ['UPC', 'malla_curricular', 'Malla curricular Relaciones Internacionales UPC', 'https://pregrado.upc.edu.pe/carrera-de-relaciones-internacionales/malla-curricular'],
    ['UTP', 'malla_curricular', 'Malla curricular Relaciones Internacionales UTP', 'https://www.utp.edu.pe/web/sites/default/files/transparencia/P16%20-%20Relaciones%20Internacionales_0.pdf'],
  ],
  DERECHO: [
    ['PUCP', 'malla_curricular', 'Malla curricular Derecho PUCP', 'https://facultad-derecho.pucp.edu.pe/wp-content/uploads/2022/11/malla-curricular-2022.pdf'],
    ['PUCP', 'plan_estudios', 'Planes de estudio Derecho PUCP', 'https://facultad-derecho.pucp.edu.pe/estudiantes/planes-de-estudio/'],
    ['ULIMA', 'plan_estudios', 'Plan de estudios Derecho ULIMA', 'https://www.ulima.edu.pe/pregrado/derecho/plan-de-estudios'],
    ['USMP', 'plan_estudios', 'Plan de estudios Derecho USMP', 'https://derecho.usmp.edu.pe/plan_de_estudios/'],
    ['UTP', 'malla_curricular', 'Malla curricular Derecho UTP', 'https://www.utp.edu.pe/pregrado/facultad-de-derecho/derecho/malla-curricular'],
    ['UPN', 'malla_curricular', 'Malla curricular Derecho UPN', 'https://www.upn.edu.pe/sites/default/files/malla-curricular/carrera-ug-derecho.pdf'],
  ],
  'EDUCACION INICIAL': [
    ['PUCP', 'plan_estudios', 'Plan de estudios Educacion PUCP', 'https://files.pucp.education/estudiante/2023/03/07110543/plan_de_estudios_educacion.pdf'],
    ['UPC', 'malla_curricular', 'Malla curricular Educacion y Gestion del Aprendizaje UPC', 'https://pregrado.upc.edu.pe/carrera-de-educacion-y-gestion-del-aprendizaje/malla-curricular/'],
    ['UTP', 'malla_curricular', 'Malla curricular Educacion Primaria UTP', 'https://www.utp.edu.pe/pregrado/facultad-de-educacion/educacion-primaria/malla-curricular'],
  ],
  'EDUCACION SECUNDARIA CON ESPECIALIDAD EN INGLES': [
    ['PUCP', 'plan_estudios', 'Plan de estudios Educacion PUCP', 'https://files.pucp.education/estudiante/2023/03/07110543/plan_de_estudios_educacion.pdf'],
    ['UNMSM', 'pagina_programa', 'Educacion secundaria UNMSM', 'https://educacion.unmsm.edu.pe/formacion-academica/pregrado/educacion-con-especialidad-en-secundaria'],
  ],
  'CIENCIA DE DATOS': [
    ['UTEC', 'malla_curricular', 'Malla curricular Ciencia de Datos UTEC', 'https://www1.utec.edu.pe/carreras/ciencia-de-datos/malla-curricular'],
    ['UTEC', 'malla_curricular', 'Malla curricular Ciencia de la Computacion UTEC', 'https://www1.utec.edu.pe/carreras/ciencia-de-la-computacion/malla-curricular'],
  ],
  'INGENIERIA AGROINDUSTRIAL': [
    ['UPN', 'pagina_programa', 'Ingenieria Agroindustrial UPN', 'https://www.upn.edu.pe/carrera/ingenieria-agroindustrial'],
    ['UPN', 'malla_curricular', 'Malla curricular Ingenieria Agroindustrial UPN', 'https://www.upn.edu.pe/sites/default/files/malla-curricular/carrera-ug-ingenieria-agroindustrial.pdf'],
    ['UNMSM', 'pagina_programa', 'Ingenieria Agroindustrial UNMSM', 'https://quimica.unmsm.edu.pe/formacion-academica/pregrado/ingenieria-agroindustrial'],
    ['UCV', 'pagina_programa', 'Agroindustrial Engineering UCV', 'https://www.ucv.edu.pe/en/presential-undergraduate/agroindustrial-engineering'],
  ],
  'INGENIERIA AMBIENTAL': [
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria Ambiental UPC', 'https://pregrado.upc.edu.pe/carrera-de-ingenieria-ambiental/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria Ambiental UPC PDF', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/documentos/pregrado/INGENIERIA%20AMBIENTAL%20PREGRADO%20MW%20FDM%20A%20DISTANCIA.pdf'],
    ['UTEC', 'malla_curricular', 'Malla curricular Ingenieria Ambiental UTEC', 'https://www1.utec.edu.pe/carreras/ingenieria-ambiental/malla-curricular'],
    ['UNI', 'malla_curricular', 'Curriculum Environmental Engineering UNI', 'https://acreditacion.uni.edu.pe/environmental/curriculum/'],
  ],
  'INGENIERIA BIOMEDICA': [
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria Biomedica UPC', 'https://pregrado.upc.edu.pe/carrera-de-ingenieria-biomedica/malla-curricular/'],
    ['PUCP', 'plan_estudios', 'Plan de estudios Ingenieria Biomedica PUCP', 'https://facultad-ciencias-ingenieria.pucp.edu.pe/carreras/ingenieria-biomedica/plan-de-estudios/'],
    ['UTEC', 'malla_curricular', 'Malla curricular Bioingenieria UTEC', 'https://www1.utec.edu.pe/carreras/bioingenieria/malla-curricular'],
  ],
  'INGENIERIA CIVIL': [
    ['PUCP', 'plan_estudios', 'Plan de estudios Ingenieria Civil PUCP', 'https://facultad-ciencias-ingenieria.pucp.edu.pe/carreras/ingenieria-civil/plan-de-estudios/'],
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria Civil UPC', 'https://pregrado.upc.edu.pe/carrera-de-ingenieria-civil/malla-curricular/'],
    ['UNI', 'malla_curricular', 'Curriculum Ingenieria Civil UNI', 'https://acreditacion.uni.edu.pe/civil/curriculum/'],
    ['UTP', 'malla_curricular', 'Malla curricular Ingenieria Civil UTP', 'https://www.utp.edu.pe/pregrado/facultad-de-ingenieria/ingenieria-civil/malla-curricular'],
  ],
  'INGENIERIA DE SISTEMAS DE INFORMACION': [
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria de Sistemas de Informacion UPC', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/documentos/pregrado/INGENIERIA%20DE%20SISTEMAS%20DE%20INFORMACION%20PREGRADO%20MW%20FDM%20P.pdf'],
    ['UNI', 'malla_curricular', 'Curriculum Ingenieria de Sistemas UNI', 'https://acreditacion.uni.edu.pe/systems/curriculum/'],
    ['UTP', 'malla_curricular', 'Malla curricular Ingenieria de Sistemas UTP', 'https://www.utp.edu.pe/pregrado/facultad-de-ingenieria/ingenieria-de-sistemas-e-informatica/malla-curricular'],
    ['UTEC', 'pagina_programa', 'Sistemas de Informacion UTEC', 'https://utec.edu.pe/carreras/sistemas-de-informacion'],
  ],
  'INGENIERIA DE SOFTWARE': [
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria de Software UPC', 'https://pregrado.upc.edu.pe/carrera-de-ingenieria-de-software/malla-curricular/'],
  ],
  'INGENIERIA EN CIBERSEGURIDAD': [
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria de Ciberseguridad UPC', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/documentos/pregrado/INGENIERIA%20DE%20CIBERSEGURIDAD%20PREGRADO%20FDM%20SP.pdf'],
  ],
  'INGENIERIA EN INDUSTRIAS ALIMENTARIAS': 'INGENIERIA AGROINDUSTRIAL',
  'INGENIERIA INDUSTRIAL Y COMERCIAL': [
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria Industrial UPC', 'https://pregrado.upc.edu.pe/carrera-de-ingenieria-industrial/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Ingenieria Industrial UPC PDF', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/documentos/pregrado/INGENIERIA%20INDUSTRIAL%20PREGRADO%20MW%20FDM%20PRESENCIAL.pdf'],
    ['UNI', 'malla_curricular', 'Plan Ingenieria Industrial UNI', 'https://www.fiis.uni.edu.pe/images/contenidos/esc-ingenieria-industrial/documentos/PLAN_INGENIERIA_INDUSTRIAL_2018_version1_-_VERSION_1.pdf'],
    ['UTEC', 'malla_curricular', 'Malla curricular Ingenieria Industrial UTEC', 'https://www1.utec.edu.pe/carreras/ingenieria-industrial/malla-curricular'],
    ['UTP', 'malla_curricular', 'Malla curricular Ingenieria Industrial UTP', 'https://www.utp.edu.pe/pregrado/facultad-de-ingenieria/ingenieria-industrial/malla-curricular'],
  ],
  'INGENIERIA MECATRONICA': [
    ['PUCP', 'plan_estudios', 'Plan de estudios Ingenieria Mecatronica PUCP', 'https://facultad-ciencias-ingenieria.pucp.edu.pe/carreras/ingenieria-mecatronica/plan-de-estudios/'],
    ['UPN', 'pagina_programa', 'Ingenieria Mecatronica UPN', 'https://www.upn.edu.pe/carrera/ingenieria-mecatronica'],
    ['UTEC', 'malla_curricular', 'Malla curricular Ingenieria Mecatronica UTEC', 'https://www1.utec.edu.pe/carreras/ingenieria-mecatronica/malla-curricular'],
  ],
};

const INTERNATIONAL_URLS_BY_CAREER = {
  'ADMINISTRACION EN TURISMO': [
    ['USFQ', 'malla_curricular', 'USFQ - Malla Hospitalidad y Hoteleria', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1HSP&out=1'],
    ['USFQ', 'brochure_pdf', 'USFQ - PDF Hospitalidad y Hoteleria', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_hospitalidad_hoteleria.pdf'],
  ],
  'ADMINISTRACION HOTELERA': [
    ['USFQ', 'malla_curricular', 'USFQ - Malla Hospitalidad', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1HSP&out=1'],
    ['USFQ', 'brochure_pdf', 'USFQ - PDF Hospitalidad y Hoteleria', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_hospitalidad_hoteleria.pdf'],
    ['USFQ', 'pagina_programa', 'USFQ - College of Hospitality, Culinary Arts and Tourism', 'https://www.usfq.edu.ec/en/academic-colleges/college-hospitality-culinary-arts-and-tourism'],
  ],
  'ARTE CULINARIO': [
    ['USFQ', 'brochure_pdf', 'USFQ - Malla Gastronomia PDF', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_gastronomia.pdf'],
    ['USFQ', 'pagina_programa', 'USFQ - College of Hospitality, Culinary Arts and Tourism', 'https://www.usfq.edu.ec/en/academic-colleges/college-hospitality-culinary-arts-and-tourism'],
  ],
  'GESTION E INNOVACION EN GASTRONOMIA': [
    ['USFQ', 'brochure_pdf', 'USFQ - Malla Gastronomia PDF', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_gastronomia.pdf'],
  ],
  'ARQUITECTURA, URBANISMO Y TERRITORIO': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Arquitectura', 'https://tec.mx/en/architecture-art-and-design/ba-in-architecture'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Urbanismo', 'https://tec.mx/en/architecture-art-and-design/ba-in-urbanism'],
    ['USFQ', 'malla_curricular', 'USFQ - Arquitectura portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ARQ&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Degree Chart Architecture Course 4', 'https://catalog.mit.edu/degree-charts/architecture-course-4/'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  'ARTE Y DISENO EMPRESARIAL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Design', 'https://tec.mx/en/architecture-art-and-design/ba-in-design'],
    ['USFQ', 'malla_curricular', 'USFQ - Artes Visuales / Diseno', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ARV&out=1'],
    ['STANFORD', 'plan_estudios', 'Stanford - Design BS', 'https://bulletin.stanford.edu/programs/DESIGN-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  MUSICA: [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Music Technology and Production', 'https://tec.mx/en/creative-studies/ba-in-music-technology-and-production'],
    ['STANFORD', 'plan_estudios', 'Stanford - Music BA', 'https://bulletin.stanford.edu/programs/MUSIC-BA'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration Music', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  'CIENCIAS DE LA ACTIVIDAD FISICA Y DEL DEPORTE': [
  ],
  ENFERMERIA: [
  ],
  'MEDICINA HUMANA': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Physician and Surgeon', 'https://tec.mx/en/health-sciences/physician-and-surgeon'],
    ['USFQ', 'malla_curricular', 'USFQ - Medicina portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1MED&out=1'],
    ['USFQ', 'brochure_pdf', 'USFQ - Malla Medicina 2024 PDF', 'https://www.usfq.edu.ec/sites/default/files/2024-05/malla-curricular-medicina.pdf'],
    ['USFQ', 'brochure_pdf', 'USFQ - Malla Medicina anterior PDF', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_medicina.pdf'],
    ['MIT', 'plan_estudios', 'MIT - Biological Engineering Course 20', 'https://catalog.mit.edu/degree-charts/biological-engineering-course-20/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Human Biology BS', 'https://bulletin.stanford.edu/programs/HUMBI-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Biology Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/biology-option-bi/'],
  ],
  'NUTRICION Y DIETETICA': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Nutrition and Wellness', 'https://tec.mx/en/health-sciences/ba-in-nutrition-and-wellness'],
    ['USFQ', 'malla_curricular', 'USFQ - Nutricion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1NUD&out=1'],
  ],
  PSICOLOGIA: [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Clinical Psychology and Health', 'https://tec.mx/en/health-sciences/bs-in-clinical-psychology-and-health'],
    ['MIT', 'plan_estudios', 'MIT - Brain and Cognitive Sciences Course 9', 'https://catalog.mit.edu/degree-charts/brain-cognitive-sciences-course-9/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Psychology BA', 'https://bulletin.stanford.edu/programs/PSYCH-BA'],
    ['HARVARD', 'plan_estudios', 'Harvard - Psychology Undergraduate', 'https://undergrad.psychology.fas.harvard.edu/'],
  ],
  'TECNOLOGIA MEDICA EN TERAPIA FISICA Y REHABILITACION': [
  ],
  ADMINISTRACION: [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Strategy and Business Transformation', 'https://tec.mx/en/business/bachelor-in-strategy-and-business-transformation'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Management Course 15-1', 'https://catalog.mit.edu/degree-charts/management-course-15-1/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Business Economics and Management', 'https://www.catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/business-economics-and-management-option-bem/'],
  ],
  'ADMINISTRACION Y EMPRENDIMIENTO': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Entrepreneurship', 'https://tec.mx/en/business/ba-in-entrepreneurship'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Management Course 15-1', 'https://catalog.mit.edu/degree-charts/management-course-15-1/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['CALTECH', 'plan_estudios', 'Caltech - Business Economics and Management', 'https://www.catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/business-economics-and-management-option-bem/'],
  ],
  'ADMINISTRACION Y FINANZAS CORPORATIVAS': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Finance', 'https://tec.mx/en/business/ba-in-financial-management'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Finance and Accounting', 'https://tec.mx/en/business/ba-in-finance-and-accounting'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Management Course 15-1', 'https://catalog.mit.edu/degree-charts/management-course-15-1/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Economics Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/economics-option-ec/'],
  ],
  'DIGITAL BUSINESS MANAGEMENT': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Business Intelligence', 'https://tec.mx/en/business/ba-in-business-intelligence'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Marketing', 'https://tec.mx/en/business/ba-in-marketing'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
  ],
  'ECONOMIA Y FINANZAS': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Finance', 'https://tec.mx/en/business/ba-in-financial-management'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Finance and Accounting', 'https://tec.mx/en/business/ba-in-finance-and-accounting'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Law, Economics and IR', 'https://tec.mx/en/law-economics-international-relations'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Economics Course 14', 'https://catalog.mit.edu/degree-charts/economics-course-14/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Economics BA', 'https://bulletin.stanford.edu/programs/ECON-BA'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Economics Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/economics-option-ec/'],
  ],
  'ECONOMIA Y NEGOCIOS INTERNACIONALES': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - International Business', 'https://tec.mx/en/business/ba-in-international-business'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Management Course 15-1', 'https://catalog.mit.edu/degree-charts/management-course-15-1/'],
    ['STANFORD', 'plan_estudios', 'Stanford - International Relations BA', 'https://bulletin.stanford.edu/programs/INTLR-BA'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  'INGENIERIA EMPRESARIAL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Industrial Engineering', 'https://tec.mx/en/engineering-and-sciences/bs-in-industrial-engineering'],
    ['MIT', 'plan_estudios', 'MIT - Management Course 15-1', 'https://catalog.mit.edu/degree-charts/management-course-15-1/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['CALTECH', 'plan_estudios', 'Caltech - Engineering and Applied Science', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/engineering-and-applied-science-option-eas/'],
  ],
  'INTERNATIONAL BUSINESS': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Global Business', 'https://tec.mx/en/business/ba-in-international-business'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  MARKETING: [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Marketing BA', 'https://tec.mx/en/business/ba-in-marketing'],
    ['USFQ', 'malla_curricular', 'USFQ - Administracion portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ADM&out=1'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  COMUNICACIONES: [
    ['USFQ', 'malla_curricular', 'USFQ - Cine/Comunicacion Audiovisual portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1CIN&out=1'],
    ['STANFORD', 'plan_estudios', 'Stanford - Communication BA', 'https://bulletin.stanford.edu/programs/COMMU-BA'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  'RELACIONES INTERNACIONALES': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Law, Economics and IR', 'https://tec.mx/en/law-economics-international-relations'],
    ['USFQ', 'brochure_pdf', 'USFQ - Relaciones Internacionales PDF', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_relaciones_internacionales.pdf'],
    ['USFQ', 'brochure_pdf', 'USFQ - Relaciones Internacionales PDF v2', 'https://www.usfq.edu.ec/sites/default/files/2020-10/malla-relaciones-internacionales.pdf'],
    ['STANFORD', 'plan_estudios', 'Stanford - International Relations BA', 'https://bulletin.stanford.edu/programs/INTLR-BA'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['MIT', 'plan_estudios', 'MIT - Political Science Course 17', 'https://catalog.mit.edu/degree-charts/political-science-course-17/'],
  ],
  DERECHO: [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Law, Economics and IR', 'https://tec.mx/en/law-economics-international-relations'],
    ['USFQ', 'malla_curricular', 'USFQ - Derecho/Jurisprudencia portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1JUR&out=1'],
  ],
  'EDUCACION INICIAL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Education', 'https://tec.mx/en/education'],
    ['USFQ', 'pagina_programa', 'USFQ - Education', 'https://www.usfq.edu.ec/en/undergraduate-programs/education'],
    ['STANFORD', 'plan_estudios', 'Stanford - Education MA', 'https://bulletin.stanford.edu/programs/ED-MA'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  'EDUCACION SECUNDARIA CON ESPECIALIDAD EN INGLES': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Education', 'https://tec.mx/en/education'],
    ['USFQ', 'pagina_programa', 'USFQ - Education', 'https://www.usfq.edu.ec/en/undergraduate-programs/education'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
  ],
  'CIENCIA DE DATOS': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Data Science and AI', 'https://tec.mx/en/Engineering-and-Sciences/bs-in-data-science-and-artificial-intelligence'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - CS and Technology', 'https://tec.mx/en/computer-science-and-information-technologies/bs-in-computer-science-and-technology'],
    ['USFQ', 'pagina_programa', 'USFQ - Computer Science', 'https://www.usfq.edu.ec/en/undergraduate-programs/computer-science'],
    ['MIT', 'plan_estudios', 'MIT - CS Engineering Course 6-3', 'https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/'],
    ['MIT', 'plan_estudios', 'MIT - CS Economics and Data Science 6-14', 'https://catalog.mit.edu/degree-charts/master-computer-science-economics-data-science-course-6-14-p/'],
    ['STANFORD', 'plan_estudios', 'Stanford - CS BS', 'https://bulletin.stanford.edu/programs/CS-BS'],
    ['HARVARD', 'plan_estudios', 'Harvard - CS Concentration Requirements', 'https://csadvising.seas.harvard.edu/concentration/requirements/'],
    ['CALTECH', 'plan_estudios', 'Caltech - CS Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/computer-science-option-and-minor-cs/'],
  ],
  'INGENIERIA AGROINDUSTRIAL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Food Engineering', 'https://tec.mx/en/bioengineering-and-chemical-processes/bs-in-food-engineering'],
    ['MIT', 'plan_estudios', 'MIT - Biological Engineering Course 20', 'https://catalog.mit.edu/degree-charts/biological-engineering-course-20/'],
    ['CALTECH', 'plan_estudios', 'Caltech - Chemical Engineering Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/chemical-engineering-option-and-minor-che/'],
  ],
  'INGENIERIA AMBIENTAL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Sustainable Development Engineering', 'https://tec.mx/en/engineering-and-sciences/bs-in-sustainable-development-engineering'],
    ['USFQ', 'malla_curricular', 'USFQ - Ingenieria Ambiental portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1INA&out=1'],
    ['MIT', 'plan_estudios', 'MIT - Civil and Environmental Engineering 1-ENG', 'https://catalog.mit.edu/degree-charts/engineering-civil-environmental-engineering-course-1-eng/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Earth Systems BS', 'https://bulletin.stanford.edu/programs/EASYS-BS'],
    ['STANFORD', 'plan_estudios', 'Stanford - Civil Engineering BS', 'https://bulletin.stanford.edu/programs/CE-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration Environmental Science', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Environmental Science and Engineering', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/environmental-science-and-engineering-option-ease/'],
  ],
  'INGENIERIA BIOMEDICA': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Biomedical Engineering', 'https://tec.mx/en/innovation-and-transformation/bs-in-biomedical-engineering'],
    ['MIT', 'plan_estudios', 'MIT - Biological Engineering Course 20', 'https://catalog.mit.edu/degree-charts/biological-engineering-course-20/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Bioengineering BS', 'https://bulletin.stanford.edu/programs/BIOE-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Biology Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/biology-option-bi/'],
  ],
  'INGENIERIA CIVIL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Civil Engineering', 'https://tec.mx/en/Engineering-and-Sciences/bs-in-civil-engineering'],
    ['USFQ', 'malla_curricular', 'USFQ - Ingenieria Civil portal malla', 'https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera=1ICV&out=1'],
    ['USFQ', 'brochure_pdf', 'USFQ - Ingenieria Civil PDF', 'https://www.usfq.edu.ec/sites/default/files/2020-07/malla_ing_civil.pdf'],
    ['MIT', 'plan_estudios', 'MIT - Civil and Environmental Engineering', 'https://catalog.mit.edu/degree-charts/engineering-civil-environmental-engineering-course-1-eng/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Civil Engineering BS', 'https://bulletin.stanford.edu/programs/CE-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Engineering and Applied Science Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/engineering-and-applied-science-option-eas/'],
  ],
  'INGENIERIA DE SISTEMAS DE INFORMACION': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - CS and Technology', 'https://tec.mx/en/computer-science-and-information-technologies/bs-in-computer-science-and-technology'],
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Data Science and AI', 'https://tec.mx/en/Engineering-and-Sciences/bs-in-data-science-and-artificial-intelligence'],
    ['USFQ', 'pagina_programa', 'USFQ - Computer Science', 'https://www.usfq.edu.ec/en/undergraduate-programs/computer-science'],
    ['MIT', 'plan_estudios', 'MIT - CS Engineering Course 6-3', 'https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/'],
    ['STANFORD', 'plan_estudios', 'Stanford - CS BS', 'https://bulletin.stanford.edu/programs/CS-BS'],
    ['HARVARD', 'plan_estudios', 'Harvard - CS Concentration', 'https://csadvising.seas.harvard.edu/concentration/requirements/'],
    ['CALTECH', 'plan_estudios', 'Caltech - CS Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/computer-science-option-and-minor-cs/'],
  ],
  'INGENIERIA DE SOFTWARE': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - CS and Technology', 'https://tec.mx/en/computer-science-and-information-technologies/bs-in-computer-science-and-technology'],
    ['USFQ', 'pagina_programa', 'USFQ - Computer Science', 'https://www.usfq.edu.ec/en/undergraduate-programs/computer-science'],
    ['MIT', 'plan_estudios', 'MIT - CS Engineering Course 6-3', 'https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/'],
    ['STANFORD', 'plan_estudios', 'Stanford - CS BS', 'https://bulletin.stanford.edu/programs/CS-BS'],
    ['HARVARD', 'plan_estudios', 'Harvard - CS Concentration', 'https://csadvising.seas.harvard.edu/concentration/requirements/'],
    ['CALTECH', 'plan_estudios', 'Caltech - CS Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/computer-science-option-and-minor-cs/'],
  ],
  'INGENIERIA EN CIBERSEGURIDAD': 'INGENIERIA DE SISTEMAS DE INFORMACION',
  'INGENIERIA EN INDUSTRIAS ALIMENTARIAS': 'INGENIERIA AGROINDUSTRIAL',
  'INGENIERIA INDUSTRIAL Y COMERCIAL': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Industrial Engineering', 'https://tec.mx/en/engineering-and-sciences/bs-in-industrial-engineering'],
    ['MIT', 'plan_estudios', 'MIT - Mechanical/Industrial Degree Chart', 'https://catalog.mit.edu/degree-charts/mechanical-engineering-course-2/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Management Science and Engineering BS', 'https://bulletin.stanford.edu/programs/MGTSC-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Engineering and Applied Science', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/engineering-and-applied-science-option-eas/'],
  ],
  'INGENIERIA MECATRONICA': [
    ['TEC', 'pagina_programa', 'Tec de Monterrey - Mechatronics Engineering', 'https://tec.mx/en/innovation-and-transformation/bs-in-mechatronics-engineering'],
    ['MIT', 'plan_estudios', 'MIT - Mechanical Engineering Course 2', 'https://catalog.mit.edu/degree-charts/mechanical-engineering-course-2/'],
    ['STANFORD', 'plan_estudios', 'Stanford - Engineering BS', 'https://bulletin.stanford.edu/programs/ENGR-BS'],
    ['HARVARD', 'brochure_pdf', 'Harvard - Fields of Concentration 2026-27', 'https://handbook.college.harvard.edu/sites/g/files/omnuum5551/files/2026-03/Fields%20of%20Concentration_0.pdf'],
    ['CALTECH', 'plan_estudios', 'Caltech - Mechanical Engineering Option', 'https://catalog.caltech.edu/current/information-for-undergraduate-students/graduation-requirements-all-options/mechanical-engineering-option-me/'],
  ],
};

const UNIVERSITY_ALIASES = {
  UPC: ['UNIVERSIDAD PERUANA DE CIENCIAS APLICADAS', 'UPC'],
  PUCP: ['PONTIFICIA UNIVERSIDAD CATOLICA DEL PERU', 'PUCP', 'CATOLICA'],
  ULIMA: ['UNIVERSIDAD DE LIMA', 'ULIMA'],
  UP: ['UNIVERSIDAD DEL PACIFICO'],
  ESAN: ['UNIVERSIDAD ESAN', 'ESAN'],
  UDEP: ['UNIVERSIDAD DE PIURA', 'UDEP'],
  UTEC: ['UNIVERSIDAD DE INGENIERIA Y TECNOLOGIA', 'UTEC'],
  UPN: ['UNIVERSIDAD PRIVADA DEL NORTE', 'UPN'],
  UTP: ['UNIVERSIDAD TECNOLOGICA DEL PERU', 'UTP'],
  UCSUR: ['UNIVERSIDAD CIENTIFICA DEL SUR', 'CIENTIFICA'],
  UPCH: ['UNIVERSIDAD PERUANA CAYETANO HEREDIA', 'CAYETANO'],
  USMP: ['UNIVERSIDAD DE SAN MARTIN DE PORRES', 'USMP'],
  UNMSM: ['UNIVERSIDAD NACIONAL MAYOR DE SAN MARCOS', 'UNMSM', 'SAN MARCOS'],
  UNI: ['UNIVERSIDAD NACIONAL DE INGENIERIA', 'UNI'],
  UCV: ['UNIVERSIDAD CESAR VALLEJO', 'UCV'],
  USFQ: ['UNIVERSIDAD SAN FRANCISCO DE QUITO', 'USFQ'],
  TEC: ['TECNOLOGICO DE MONTERREY', 'TEC DE MONTERREY', 'TEC'],
  MIT: ['MASSACHUSETTS INSTITUTE OF TECHNOLOGY', 'MIT'],
  STANFORD: ['STANFORD UNIVERSITY', 'STANFORD'],
  HARVARD: ['HARVARD UNIVERSITY', 'HARVARD'],
  CALTECH: ['CALIFORNIA INSTITUTE OF TECHNOLOGY', 'CALTECH'],
};

function resolveSourcesFromMap(map, careerName, visited = new Set()) {
  const key = normalize(careerName);
  if (visited.has(key)) return [];
  visited.add(key);
  const value = map[key];
  if (typeof value === 'string') return resolveSourcesFromMap(map, value, visited);
  return value || [];
}

function resolveCareerSources(careerName) {
  const national = resolveSourcesFromMap(URLS_BY_CAREER, careerName);
  const international = resolveSourcesFromMap(INTERNATIONAL_URLS_BY_CAREER, careerName);
  return [...national, ...international];
}

function isUniversityMatch(code, universityName) {
  const normalized = normalize(universityName);
  return (UNIVERSITY_ALIASES[code] || [code]).some(alias => normalized.includes(alias));
}

export function getCuratedBenchmarkSources(careerName, universityName) {
  return resolveCareerSources(careerName)
    .filter(([code]) => isUniversityMatch(code, universityName))
    .map(([code, tipoFuente, titulo, url]) => ({
      code,
      tipoFuente,
      titulo,
      url,
    }));
}

export function getCuratedUniversityCodesForCareer(careerName) {
  return [...new Set(resolveCareerSources(careerName).map(([code]) => code))];
}

export function getAllCuratedBenchmarkSources(careerName) {
  return resolveCareerSources(careerName).map(([code, tipoFuente, titulo, url]) => ({
    code,
    tipoFuente,
    titulo,
    url,
  }));
}
