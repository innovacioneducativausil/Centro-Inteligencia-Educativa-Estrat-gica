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
    ['USMP', 'malla_curricular', 'Malla curricular Turismo USMP', 'https://fcctp.usmp.edu.pe/site/programas-academicos/pregrado/turismo/malla-curricular/'],
    ['USMP', 'malla_curricular', 'Malla curricular Turismo USMP 2022-2', 'https://fcctp.usmp.edu.pe/site/programas-academicos/pregrado/turismo/malla-curricular-2022-2/'],
    ['UNMSM', 'pagina_programa', 'Administracion de Turismo UNMSM', 'https://www.unmsm.edu.pe/formacion-academica/carreras-de-pregrado/carrera-detalle/administracion-de-turismo'],
    ['UPN', 'pagina_programa', 'Administracion y Servicios Turisticos UPN', 'https://www.upn.edu.pe/carrera/administracion-y-servicios-turisticos'],
    ['UCV', 'pagina_programa', 'Administracion Turismo y Hoteleria UCV', 'https://www.ucv.edu.pe/sube-semipresencial/administracion-turismo-y-hoteleria'],
  ],
  'ADMINISTRACION HOTELERA': [
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Hoteleria UPC', 'https://pregrado.upc.edu.pe/carrera-de-administracion-y-hoteleria/malla-curricular/'],
    ['UPC', 'malla_curricular', 'Malla curricular Administracion y Hoteleria UPC PDF', 'https://www.upc.edu.pe/transparencia-upc/mallas-curriculares/'],
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
};

function resolveCareerSources(careerName) {
  const key = normalize(careerName);
  const value = URLS_BY_CAREER[key];
  if (typeof value === 'string') return URLS_BY_CAREER[value] || [];
  return value || [];
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
