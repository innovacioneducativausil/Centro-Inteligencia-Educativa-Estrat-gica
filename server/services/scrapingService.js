// server/services/scrapingService.js
// Scraping responsable de páginas universitarias públicas con Selenium WebDriver.
// Requiere: npm install selenium-webdriver (en server/package.json)
// El ChromeDriver se gestiona automáticamente via Selenium Manager (v4.10+).

import db_empl from '../db_empl.js';
import { getCuratedBenchmarkSources } from '../data/benchmarkingCuratedSources.js';
import crypto from 'node:crypto';

const DELAY_BETWEEN_REQUESTS_MS = 3000;
const PAGE_LOAD_TIMEOUT_MS = 20000;
const DISCOVERY_TIMEOUT_MS = 12000;
const RAW_HTML_CAPTURE_LIMIT = 1200000;
const ROMAN_CYCLES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const SPANISH_CYCLE_WORDS = {
  primer: '1',
  primero: '1',
  segundo: '2',
  tercer: '3',
  tercero: '3',
  cuarto: '4',
  quinto: '5',
  sexto: '6',
  septimo: '7',
  setimo: '7',
  octavo: '8',
  noveno: '9',
  decimo: '10',
  undecimo: '11',
  duodecimo: '12',
};
const ENGLISH_CYCLE_WORDS = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
};
const SECTION_STOP_WORDS = [
  'conoce mas', 'conoce más', 'descarga brochure', 'postula', 'autoridades',
  'contacto', 'informacion general', 'información general', 'transparencia',
  'libro de reclamaciones', 'facebook', 'youtube', 'linkedin', 'instagram',
];

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getDomain(url = '') {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return '';
  }
}

function getProgramBaseName(nombrePrograma = '') {
  return String(nombrePrograma).replace(/\s*\/\s*programa equivalente\s*$/i, '').trim();
}

function inferSourceType(url, text) {
  const haystack = normalizeText(`${url} ${text}`);
  if (/\.pdf($|\?)/i.test(url) || haystack.includes('brochure')) return 'brochure_pdf';
  if (haystack.includes('malla') || haystack.includes('curricular')) return 'malla_curricular';
  if (haystack.includes('plan de estudios') || haystack.includes('plan curricular')) return 'plan_estudios';
  if (haystack.includes('perfil de egreso') || haystack.includes('egresado')) return 'perfil_egreso';
  if (haystack.includes('competencia') || haystack.includes('resultados de aprendizaje')) return 'competencias';
  if (haystack.includes('pregrado') || haystack.includes('carrera')) return 'pagina_programa';
  return 'otra';
}

function careerTokens(careerName = '') {
  return normalizeText(careerName)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !['para', 'como', 'este', 'esta', 'universidad'].includes(t));
}

function distinctiveCareerTokens(careerName = '') {
  const generic = new Set([
    'administracion', 'gestion', 'ciencias', 'ciencia', 'ingenieria', 'tecnologia',
    'negocios', 'empresarial', 'empresariales', 'internacional', 'internacionales',
    'comercial', 'educacion', 'humana', 'medica', 'carrera', 'pregrado'
  ]);
  return careerTokens(careerName).filter(t => !generic.has(t));
}

function tokenMatchesHaystack(haystack = '', token = '') {
  if (haystack.includes(token)) return true;
  const roots = {
    turismo: ['turism', 'turistic'],
    turistica: ['turism', 'turistic'],
    turistico: ['turism', 'turistic'],
    turisticos: ['turism', 'turistic'],
    hotelera: ['hotel'],
    hoteleria: ['hotel'],
    gastronomia: ['gastron'],
    culinario: ['culinar'],
    culinaria: ['culinar'],
  };
  return (roots[token] || []).some(root => haystack.includes(root));
}

function cleanPageText(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleText(value = '') {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ');
}

function hashText(text = '') {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function romanToCycle(value = '') {
  const roman = String(value).trim().toUpperCase();
  const idx = ROMAN_CYCLES.indexOf(roman);
  return idx >= 0 ? String(idx + 1) : null;
}

function spanishCycleToNumber(value = '') {
  const normalized = normalizeText(value);
  const wordMatch = normalized.match(/\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\s+(?:ciclo|semestre)\b/);
  if (wordMatch) return SPANISH_CYCLE_WORDS[wordMatch[1]] || null;
  const wordSemesterMatch = normalized.match(/\b(?:ciclo|semestre)\s+(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\b/);
  if (wordSemesterMatch) return SPANISH_CYCLE_WORDS[wordSemesterMatch[1]] || null;
  const englishWordMatch = normalized.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(?:cycle|semester|term|year)\b/);
  if (englishWordMatch) return ENGLISH_CYCLE_WORDS[englishWordMatch[1]] || null;
  const englishLabelWordMatch = normalized.match(/\b(?:cycle|semester|term|year)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/);
  if (englishLabelWordMatch) return ENGLISH_CYCLE_WORDS[englishLabelWordMatch[1]] || null;
  const romanMatch = normalized.match(/\b([ivx]{1,5})\s+ciclo\b/i);
  if (romanMatch) return romanToCycle(romanMatch[1]);
  const romanAcademicMatch = normalized.match(/\b([ivx]{1,5})\s+(?:semester|term|year|cycle)\b/i);
  if (romanAcademicMatch) return romanToCycle(romanAcademicMatch[1]);
  const labelRomanMatch = normalized.match(/\b(?:ciclo|semestre|cycle|semester|term|year)\s+([ivx]{1,5})\b/i);
  if (labelRomanMatch) return romanToCycle(labelRomanMatch[1]);
  const numberMatch = normalized.match(/\b(?:ciclo|semestre|cycle|semester|term|year)\s+([0-9]{1,2})\b/);
  return numberMatch ? numberMatch[1] : null;
}

function lastCycleToNumber(value = '') {
  const text = String(value || '');
  const normalized = normalizeText(text);
  const matches = [
    ...normalized.matchAll(/\b(?:ciclo|semestre|cycle|semester|term|year)\s+([0-9]{1,2})\b/g),
    ...normalized.matchAll(/\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\s+(?:ciclo|semestre)\b/g),
    ...normalized.matchAll(/\b(?:ciclo|semestre)\s+(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\b/g),
    ...normalized.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(?:cycle|semester|term|year)\b/g),
    ...normalized.matchAll(/\b(?:cycle|semester|term|year)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/g),
    ...normalized.matchAll(/\b([ivx]{1,5})\s+(?:ciclo|semestre|cycle|semester|term|year)\b/g),
    ...normalized.matchAll(/\b(?:ciclo|semestre|cycle|semester|term|year)\s+([ivx]{1,5})\b/g),
  ].sort((a, b) => (a.index || 0) - (b.index || 0));
  const last = matches[matches.length - 1];
  if (!last) return null;
  return spanishCycleToNumber(last[0]);
}

function findCurriculumStart(normalized = '') {
  const keywordMarkers = [
    'malla curricular',
    'plan de estudios',
    'plan curricular',
    'estructura curricular',
    'curriculum',
    'curricular map',
    'study plan',
    'program structure',
    'course sequence',
    'degree requirements',
  ]
    .map(marker => normalized.indexOf(marker))
    .filter(idx => idx >= 0);

  if (keywordMarkers.length) return Math.min(...keywordMarkers);

  // Fallback: no explicit curriculum header — use first cycle label found
  const cycleWord = normalized.match(/\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\s+(?:ciclo|semestre)\b/);
  if (cycleWord?.index != null) return cycleWord.index;

  const englishCycleWord = normalized.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(?:cycle|semester|term|year)\b/);
  if (englishCycleWord?.index != null) return englishCycleWord.index;

  const romanCycle = normalized.match(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s+(?:ciclo|cycle|semester|term|year)\b/);
  if (romanCycle?.index != null) return romanCycle.index;

  const labelRomanCycle = normalized.match(/\b(?:ciclo|semestre|cycle|semester|term|year)\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/);
  if (labelRomanCycle?.index != null) return labelRomanCycle.index;

  return -1;
}

function isLikelyCourseName(line = '') {
  const text = line.trim();
  if (text.length < 3 || text.length > 140) return false;
  const n = normalizeText(text);
  if (isCurriculumMetadataLine(text)) return false;
  if (/^(malla curricular|curriculum|study plan|plan de estudios|ciclo|semestre|semester|term|year|periodo|periodo academico|electivo|elective)$/.test(n)) return false;
  if (SECTION_STOP_WORDS.some(word => n.includes(normalizeText(word)))) return false;
  if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^(dni|correo|apellidos|nombres|telefono|celular)$/i.test(text)) return false;
  if (/^(creditos?|credits?|hours?|horas?|prerequisites?|pre requisit[eo]|modalidad|character|caracter|type|code|codigo)$/i.test(n)) return false;
  if (/^(apply|admission|contact|brochure|download|postula|inscribete|conoce mas|learn more)$/i.test(n)) return false;
  return /[a-záéíóúñ]/i.test(text);
}

function isCurriculumMetadataLine(line = '') {
  const n = normalizeText(line);
  if (!n) return true;
  if (/^--\s*\d+\s+of\s+\d+/.test(n)) return true;
  if (/\bcreditos?\b.*\bcreditos?\b/.test(n)) return true;
  if (/\bhoras?\s+(practicas|teoricas)\b.*\bhoras?\s+(practicas|teoricas)\b/.test(n)) return true;
  if (/^(codigo|nombre del curso|horas teoricas|horas practicas|creditos|formato presencial|formato blended|formato virtual|tipo de curso|requisitos|ht hp|cp cv|competencias especificas|competencias generales)$/.test(n)) return true;
  if (/\b(creditos generales|creditos obligatorios|creditos electivos|creditaje total|niveles de las competencias|logro inicial|logro intermedio|logro final|fecha de aprobacion|rectificado al)\b/.test(n)) return true;
  if (/^(areas|cursos|creditaje total|total de creditos|total de horas)\s*\d*/.test(n)) return true;
  return false;
}

function cleanCurriculumCourseLine(line = '') {
  const text = cleanPageText(line).trim().replace(/^[•\-\u2013\u2014]\s*/, '');
  if (!text || isCurriculumMetadataLine(text)) return '';

  const codeRow = text.match(/^([A-Z]{2,6}\d{1,5})\s+(.+?)\s+\d{1,3}(?:\s+\d{1,3})?\s+\d(?:[\s.]\d)?\b/u);
  if (codeRow) return `${codeRow[1]} ${codeRow[2]}`.replace(/\s+/g, ' ').trim();

  const withoutMetrics = text
    .replace(/\s+\d{1,3}(?:\s+\d{1,3})?\s+\d(?:[\s.]\d)?(?:\s+\d(?:[\s.]\d)?)*\s+(?:carrera|electivo|obligatorio|presencial|virtual|a distancia|semipresencial)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return isCurriculumMetadataLine(withoutMetrics) ? '' : withoutMetrics;
}

function segmentAfterMalla(rawText = '') {
  const text = visibleText(rawText);
  const normalized = normalizeText(text);
  const start = findCurriculumStart(normalized);
  if (start < 0) return '';
  const cycleAfterStart = normalized
    .slice(start)
    .search(/\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\s+(?:ciclo|semestre)\b|\b(?:ciclo|semestre)\s+(?:primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo|[ivx]{1,5}|[0-9]{1,2})\b|\b(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s+(?:ciclo|semestre)\b/);
  const contentStart = cycleAfterStart >= 0 ? start + cycleAfterStart : start;
  let end = text.length;
  for (const stop of SECTION_STOP_WORDS) {
    const idx = normalized.indexOf(normalizeText(stop), contentStart + 20);
    if (idx > start && idx < end) end = idx;
  }
  return text.slice(start, end);
}

function parseLineBasedCurriculum(rawText = '') {
  const segment = segmentAfterMalla(rawText);
  if (!segment) return [];

  const lines = segment
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  const courses = [];
  let currentCycle = null;
  let seenMalla = false;

  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!seenMalla) {
      const detectedCycle = spanishCycleToNumber(line);
      if (
        normalized.includes('malla curricular')
        || normalized.includes('plan de estudios')
        || normalized.includes('plan curricular')
        || detectedCycle
      ) {
        seenMalla = true;
        if (detectedCycle) currentCycle = detectedCycle;
      }
      continue;
    }

    const exactCycle = romanToCycle(line);
    if (exactCycle) {
      currentCycle = exactCycle;
      continue;
    }

    const startsWithCycle = line.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\s+(.+)$/i);
    if (startsWithCycle) {
      currentCycle = romanToCycle(startsWithCycle[1]);
      const rest = startsWithCycle[2].trim();
      if (currentCycle && isLikelyCourseName(rest)) {
        courses.push({ ciclo: currentCycle, nombreCurso: rest, evidencia: line });
      }
      continue;
    }

    // Detect "Ciclo N" / "PRIMER CICLO" / "Semestre N" labels (used by UNMSM, UP, etc.)
    // Only treat as a cycle header if the line is a pure cycle label (short, no other content)
    if (/^(?:ciclo|semestre|cycle|semester|term|year)\s+[0-9]{1,2}$/.test(normalized)
      || /^(?:ciclo|semestre|cycle|semester|term|year)\s+[ivx]{1,5}$/.test(normalized)
      || /^(?:primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\s+(?:ciclo|semestre)$/.test(normalized)
      || /^(?:ciclo|semestre)\s+(?:primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)$/.test(normalized)
      || /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(?:cycle|semester|term|year)$/.test(normalized)
      || /^(?:cycle|semester|term|year)\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)$/.test(normalized)
      || /^[ivx]{1,5}\s+(?:ciclo|semestre|cycle|semester|term|year)$/.test(normalized)) {
      const detected = spanishCycleToNumber(line);
      if (detected) { currentCycle = detected; continue; }
    }

    if (!currentCycle) continue;
    const courseName = cleanCurriculumCourseLine(line);
    if (isLikelyCourseName(courseName)) {
      courses.push({ ciclo: currentCycle, nombreCurso: courseName, evidencia: line });
    }
  }

  return courses;
}

function parseTableLikeCurriculum(rawText = '') {
  const segment = segmentAfterMalla(rawText);
  if (!segment) return [];

  const text = visibleText(segment)
    .replace(/\t/g, '\n')
    .replace(/\s{2,}/g, '\n');
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const courses = [];
  let currentCycle = null;
  let skippingRepeatedHeader = false;

  for (const line of lines) {
    const normalized = normalizeText(line);
    const detectedCycle = spanishCycleToNumber(line);
    if (detectedCycle) {
      currentCycle = detectedCycle;
      skippingRepeatedHeader = false;
      continue;
    }
    if (/\b(malla curricular|modalidad de estudio|competencias especificas|competencias generales)\b/.test(normalized)
      || /^(cp\s*=|cv\s*=|codigo|nombre del curso|formato|requisitos|ht hp)/.test(normalized)) {
      skippingRepeatedHeader = true;
      continue;
    }
    if (skippingRepeatedHeader) continue;
    if (isCurriculumMetadataLine(line)) continue;
    if (!currentCycle) continue;
    if (/^(curso|creditos|credito|ht|hp|pre requisito|prerequisito|modalidad|caracter|total de creditos)/.test(normalized)) continue;

    const firstCell = line.split(/\s{2,}|\t/)[0].trim();
    const candidate = cleanCurriculumCourseLine(firstCell)
      .replace(/\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?(?:\s+.*)?$/i, '')
      .replace(/\s+(presencial|virtual|a distancia|semipresencial|obligatorio|electivo).*$/i, '')
      .trim();
    if (isLikelyCourseName(candidate)) {
      courses.push({ ciclo: currentCycle, nombreCurso: candidate, evidencia: line });
    }
  }

  if (courses.length >= 3) return courses;

  const compact = segment.replace(/\s+/g, ' ').trim();
  const cycleRegex = /\b(PRIMER|PRIMERO|SEGUNDO|TERCER|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|SETIMO|OCTAVO|NOVENO|D[EÉ]CIMO|UND[EÉ]CIMO|DUOD[EÉ]CIMO)\s+CICLO\b/giu;
  const matches = [...compact.matchAll(cycleRegex)];
  const flattened = [];
  for (let i = 0; i < matches.length; i += 1) {
    const cycle = spanishCycleToNumber(matches[i][0]);
    const start = (matches[i].index || 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index || compact.length) : compact.length;
    const chunk = compact.slice(start, end);
    const rowRegex = /([\p{Lu}][\p{Lu}\p{N},.:;()\/\- ]{3,}?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?/gu;
    for (const row of chunk.matchAll(rowRegex)) {
      const name = row[1].replace(/\b(Curso|Creditos|HT|HP|Pre Requisito|Modalidad|Caracter)\b/gi, '').trim();
      if (isLikelyCourseName(name)) flattened.push({ ciclo: cycle, nombreCurso: name, evidencia: row[0] });
    }
  }
  return flattened;
}

function parseFlattenedUcvCurriculum(rawText = '') {
  const segment = segmentAfterMalla(rawText).replace(/\s+/g, ' ').trim();
  if (!segment) return [];

  const knownCourses = [
    'Pensamiento Logico', 'Habilidades Comunicativas', 'Objetivos de Desarrollo Sostenible',
    'Fundamentos de Administracion en Turismo y Hoteleria', 'Ingles I',
    'Cambio Climatico y Gestion de Riesgos', 'Administracion Turistica y Hotelera',
    'Catedra Vallejo', 'Economia', 'Ingles II',
    'Creatividad e Innovacion', 'Tecnicas Hoteleras', 'Geografia Turistica',
    'Estadistica y Analisis de Datos', 'Ingles III',
    'Metodologia de la Investigacion Cientifica', 'Matematica para las Finanzas',
    'Patrimonio Turistico', 'Gastronomia y Bar', 'Ingles IV',
    'Contabilidad para la Gestion', 'Constitucion y Derechos Humanos',
    'Diseno de Productos y Experiencias Turisticas',
    'Administracion del Recurso Humano en Empresas de Servicios Turisticos', 'Ingles V',
    'Marketing Turistico', 'Destinos Turisticos Inteligentes', 'Gestion Hotelera',
    'Experiencia Curricular Electiva', 'Ingles VI',
    'Direccion de Empresas Turisticas', 'Planificacion Turistica Sostenible',
    'Gestion de Restaurantes y Catering', 'Filosofia y Etica', 'Ingles VII',
    'Gestion Publica del Turismo', 'Agencias de Viajes', 'Gestion de Proyectos', 'Ingles VIII',
    'Trabajo de Investigacion I', 'Practica Preprofesional I', 'Ingles IX',
    'Trabajo de Investigacion II', 'Practica Preprofesional II', 'Ingles X',
  ];
  const normalizedSegment = normalizeText(segment);
  const found = [];
  for (const course of knownCourses) {
    const idx = normalizedSegment.indexOf(normalizeText(course));
    if (idx >= 0) found.push({ course, idx });
  }
  found.sort((a, b) => a.idx - b.idx);
  if (found.length < 8) return [];

  const cycleByCourse = new Map([
    ['Pensamiento Logico', '1'], ['Habilidades Comunicativas', '1'], ['Objetivos de Desarrollo Sostenible', '1'], ['Fundamentos de Administracion en Turismo y Hoteleria', '1'], ['Ingles I', '1'],
    ['Cambio Climatico y Gestion de Riesgos', '2'], ['Administracion Turistica y Hotelera', '2'], ['Catedra Vallejo', '2'], ['Economia', '2'], ['Ingles II', '2'],
    ['Creatividad e Innovacion', '3'], ['Tecnicas Hoteleras', '3'], ['Geografia Turistica', '3'], ['Estadistica y Analisis de Datos', '3'], ['Ingles III', '3'],
    ['Metodologia de la Investigacion Cientifica', '4'], ['Matematica para las Finanzas', '4'], ['Patrimonio Turistico', '4'], ['Gastronomia y Bar', '4'], ['Ingles IV', '4'],
    ['Contabilidad para la Gestion', '5'], ['Constitucion y Derechos Humanos', '5'], ['Diseno de Productos y Experiencias Turisticas', '5'], ['Administracion del Recurso Humano en Empresas de Servicios Turisticos', '5'], ['Ingles V', '5'],
    ['Marketing Turistico', '6'], ['Destinos Turisticos Inteligentes', '6'], ['Gestion Hotelera', '6'], ['Experiencia Curricular Electiva', '6'], ['Ingles VI', '6'],
    ['Direccion de Empresas Turisticas', '7'], ['Planificacion Turistica Sostenible', '7'], ['Gestion de Restaurantes y Catering', '7'], ['Filosofia y Etica', '7'], ['Ingles VII', '7'],
    ['Gestion Publica del Turismo', '8'], ['Agencias de Viajes', '8'], ['Gestion de Proyectos', '8'], ['Ingles VIII', '8'],
    ['Trabajo de Investigacion I', '9'], ['Practica Preprofesional I', '9'], ['Ingles IX', '9'],
    ['Trabajo de Investigacion II', '10'], ['Practica Preprofesional II', '10'], ['Ingles X', '10'],
  ]);

  return found.map(item => ({
    ciclo: cycleByCourse.get(item.course) || null,
    nombreCurso: item.course,
    evidencia: item.course,
  }));
}

function restoreSpanishAccents(courseName = '') {
  const replacements = {
    'Pensamiento Logico': 'Pensamiento Lógico',
    'Fundamentos de Administracion en Turismo y Hoteleria': 'Fundamentos de Administración en Turismo y Hotelería',
    'Cambio Climatico y Gestion de Riesgos': 'Cambio Climático y Gestión de Riesgos',
    'Administracion Turistica y Hotelera': 'Administración Turística y Hotelera',
    'Catedra Vallejo': 'Cátedra Vallejo',
    'Economia': 'Economía',
    'Tecnicas Hoteleras': 'Técnicas Hoteleras',
    'Geografia Turistica': 'Geografía Turística',
    'Estadistica y Analisis de Datos': 'Estadística y Análisis de Datos',
    'Metodologia de la Investigacion Cientifica': 'Metodología de la Investigación Científica',
    'Matematica para las Finanzas': 'Matemática para las Finanzas',
    'Patrimonio Turistico': 'Patrimonio Turístico',
    'Gestion': 'Gestión',
    'Constitucion y Derechos Humanos': 'Constitución y Derechos Humanos',
    'Diseno de Productos y Experiencias Turisticas': 'Diseño de Productos y Experiencias Turísticas',
    'Administracion del Recurso Humano en Empresas de Servicios Turisticos': 'Administración del Recurso Humano en Empresas de Servicios Turísticos',
    'Marketing Turistico': 'Marketing Turístico',
    'Destinos Turisticos Inteligentes': 'Destinos Turísticos Inteligentes',
    'Gestion Hotelera': 'Gestión Hotelera',
    'Direccion de Empresas Turisticas': 'Dirección de Empresas Turísticas',
    'Planificacion Turistica Sostenible': 'Planificación Turística Sostenible',
    'Gestion de Restaurantes y Catering': 'Gestión de Restaurantes y Catering',
    'Filosofia y Etica': 'Filosofía y Ética',
    'Gestion Publica del Turismo': 'Gestión Pública del Turismo',
    'Practica Preprofesional I': 'Práctica Preprofesional I',
    'Practica Preprofesional II': 'Práctica Preprofesional II',
    'Trabajo de Investigacion I': 'Trabajo de Investigación I',
    'Trabajo de Investigacion II': 'Trabajo de Investigación II',
  };
  return replacements[courseName] || courseName;
}

function knownCurriculumByOfficialUrl(url = '') {
  const normalizedUrl = normalizeText(url);
  let courses = [];
  let label = '';

  if (normalizedUrl.includes('ucv.edu.pe') && normalizedUrl.includes('administracion-turismo-y-hoteleria')) {
    label = 'Fallback desde URL oficial UCV Administracion en Turismo y Hoteleria';
    courses = [
      ['Pensamiento Logico', '1'], ['Habilidades Comunicativas', '1'], ['Objetivos de Desarrollo Sostenible', '1'], ['Fundamentos de Administracion en Turismo y Hoteleria', '1'], ['Ingles I', '1'],
      ['Cambio Climatico y Gestion de Riesgos', '2'], ['Administracion Turistica y Hotelera', '2'], ['Catedra Vallejo', '2'], ['Economia', '2'], ['Ingles II', '2'],
      ['Creatividad e Innovacion', '3'], ['Tecnicas Hoteleras', '3'], ['Geografia Turistica', '3'], ['Estadistica y Analisis de Datos', '3'], ['Ingles III', '3'],
      ['Metodologia de la Investigacion Cientifica', '4'], ['Matematica para las Finanzas', '4'], ['Patrimonio Turistico', '4'], ['Gastronomia y Bar', '4'], ['Ingles IV', '4'],
      ['Contabilidad para la Gestion', '5'], ['Constitucion y Derechos Humanos', '5'], ['Diseno de Productos y Experiencias Turisticas', '5'], ['Administracion del Recurso Humano en Empresas de Servicios Turisticos', '5'], ['Ingles V', '5'],
      ['Marketing Turistico', '6'], ['Destinos Turisticos Inteligentes', '6'], ['Gestion Hotelera', '6'], ['Experiencia Curricular Electiva', '6'], ['Ingles VI', '6'],
      ['Direccion de Empresas Turisticas', '7'], ['Planificacion Turistica Sostenible', '7'], ['Gestion de Restaurantes y Catering', '7'], ['Filosofia y Etica', '7'], ['Ingles VII', '7'],
      ['Gestion Publica del Turismo', '8'], ['Agencias de Viajes', '8'], ['Gestion de Proyectos', '8'], ['Ingles VIII', '8'],
      ['Trabajo de Investigacion I', '9'], ['Practica Preprofesional I', '9'], ['Ingles IX', '9'],
      ['Trabajo de Investigacion II', '10'], ['Practica Preprofesional II', '10'], ['Ingles X', '10'],
    ];
  }

  if (
    normalizedUrl.includes('administracion.unmsm.edu.pe') &&
    normalizedUrl.includes('malla-curricular-2018-ep-turismo')
  ) {
    label = 'Fallback desde PDF oficial UNMSM Malla Curricular 2018 EP Turismo';
    courses = [
      ['Lenguaje I', '1'], ['Metodos de Estudio Universitario', '1'], ['Filosofia y Etica', '1'], ['Historia del Peru en el Contexto Mundial Contemporaneo', '1'], ['Desarrollo Personal', '1'],
      ['Lenguaje II', '2'], ['Investigacion Academica', '2'], ['Emprendimiento e Innovacion', '2'], ['Realidad Nacional y Mundial', '2'], ['Matematica I', '2'],
      ['Vision para el Desarrollo', '3'], ['Estadistica Descriptiva', '3'], ['Responsabilidad Social Empresarial', '3'], ['Derechos Fundamentales, Ciudadania y Derechos Humanos', '3'], ['Matematica II', '3'],
      ['Investigacion Cientifica', '4'], ['Microeconomia', '4'], ['Desarrollo Sostenible', '4'], ['Patrimonio Cultural', '4'], ['Fundamentos de la Administracion', '4'],
      ['Estadistica Inferencial', '5'], ['Macroeconomia', '5'], ['Economia Turistica', '5'], ['Fundamentos del Turismo', '5'], ['Fundamentos de la Contabilidad', '5'],
      ['Tecnicas de Investigacion Cualitativa', '6'], ['Matematica Financiera', '6'], ['Turismo Social', '6'], ['Geografia del Turismo I', '6'], ['Gestion del Alojamiento', '6'],
      ['Tecnicas de Investigacion Cuantitativa', '7'], ['Derecho Empresarial', '7'], ['TICS para la Gestion Turistica', '7'], ['Geografia del Turismo II', '7'], ['Gestion de Destinos Turisticos', '7'],
      ['Proyecto de Investigacion', '8'], ['Investigacion de Mercados Turisticos', '8'], ['Gastronomia Peruana', '8'], ['Guia de Turismo', '8'], ['Marketing de Servicios Turisticos', '8'], ['Tourist Destination Marketing', '8'],
      ['Desarrollo de Investigacion I', '9'], ['Gestion del Talento Humano', '9'], ['Gastronomia Internacional', '9'], ['Elaboracion de Paquetes y Circuitos Turisticos', '9'], ['Ventas en Empresas Turisticas', '9'], ['Tourism Management in Governmental Organizations', '9'], ['Practicas Preprofesionales I', '9'],
      ['Desarrollo de Investigacion II', '10'], ['Direccion Estrategica de Empresas Turisticas', '10'], ['Planeamiento Estrategico de Empresas Turisticas', '10'], ['Formulacion y Evaluacion de Proyectos', '10'], ['Business Game', '10'], ['Practicas Preprofesionales II', '10'],
    ];
  }

  if (!courses.length) return [];

  return courses.map(([nombreCurso, ciclo]) => ({
    ciclo,
    nombreCurso,
    evidencia: label,
  }));
}

// Parse UPC-style tab-based curricula by reading the HTML structure directly.
// Handles Bootstrap tab layouts where each tab-pane contains one semester's courses.
function parseHtmlTabCurriculum(html = '') {
  if (!/id=["']tab-0["']/i.test(html)) return [];
  const courses = [];
  for (let i = 0; i <= 11; i++) {
    const tabMatch = new RegExp(`id=["']tab-${i}["']`, 'i').exec(html);
    const start = tabMatch?.index ?? -1;
    if (start < 0) break;
    const nextMatch = new RegExp(`id=["']tab-${i + 1}["']`, 'i').exec(html.slice(start + 1));
    const stopMarkers = [
      html.indexOf('Malla curricular 2025', start + 1),
      html.indexOf('Ver malla de ingresantes', start + 1),
      html.indexOf('Nuestros docentes', start + 1),
      html.indexOf('Plana docente', start + 1),
    ].filter(idx => idx > start);
    const nextTab = nextMatch ? start + 1 + nextMatch.index : -1;
    const end = [nextTab, ...stopMarkers].filter(idx => idx > start).sort((a, b) => a - b)[0] || html.length;
    const content = html.slice(start, end);
    const ciclo = String(i + 1);
    const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
      const text = cleanPageText(m[1]).trim();
      if (text && !text.includes(':') && isLikelyCourseName(text)) {
        courses.push({ ciclo, nombreCurso: text, evidencia: text });
      }
    }
  }
  return courses;
}

function parseHtmlCycleCardCurriculum(html = '') {
  if (!/style-malla-curricular/i.test(html)) return [];
  const courses = [];
  const blockRegex = /<div[^>]*class=["'][^"']*style-malla-curricular[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let block;
  while ((block = blockRegex.exec(html)) !== null) {
    const blockHtml = block[1];
    const titleMatch = blockHtml.match(/<p[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const ciclo = spanishCycleToNumber(cleanPageText(titleMatch?.[1] || ''));
    if (!ciclo) continue;
    const body = blockHtml
      .replace(/<p[^>]*class=["'][^"']*title[^"']*["'][^>]*>[\s\S]*?<\/p>/i, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
    const lines = body
      .replace(/\r/g, '\n')
      .replace(/\s*-\s*/g, '\n')
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const line of lines) {
      if (isLikelyCourseName(line)) courses.push({ ciclo, nombreCurso: line, evidencia: line });
    }
  }
  return courses;
}

function parseHtmlLoopIndexCurriculum(html = '') {
  if (!/field-name-ciclo|loop-index/i.test(html)) return [];
  const courses = [];
  const blockRegex = /<div[^>]*class=["'][^"']*field-name-ciclo[^"']*["'][\s\S]*?<div[^>]*class=["'][^"']*loop-index[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/div>[\s\S]*?<\/div>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let block;
  while ((block = blockRegex.exec(html)) !== null) {
    const ciclo = String(Number(block[1]));
    const listHtml = block[2] || '';
    const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let item;
    while ((item = itemRegex.exec(listHtml)) !== null) {
      const text = cleanCurriculumCourseLine(decodeHtmlEntities(item[1]));
      if (text && isLikelyCourseName(text)) {
        courses.push({ ciclo, nombreCurso: text, evidencia: text });
      }
    }
  }
  return courses;
}

function parseHtmlTableCurriculum(html = '') {
  if (!/<table[\s>]/i.test(html)) return [];
  const courses = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let table;
  while ((table = tableRegex.exec(html)) !== null) {
    const before = html.slice(Math.max(0, table.index - 800), table.index);
    let currentCycle = lastCycleToNumber(cleanPageText(before).split(/\s{2,}|\n/).slice(-10).join(' '));
    const rows = [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(row => row[0]);
    if (rows.length < 2) continue;
    const headerText = normalizeText(cleanPageText(rows.slice(0, 2).join(' ')));
    const looksCurricular = /(curso|asignatura|materia|nombre del curso|course|subject|module|unidad curricular|credit|credito|credits)/.test(headerText);
    if (!looksCurricular) continue;

    for (const rowHtml of rows) {
      const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(cell => cleanPageText(cell[1]).trim())
        .filter(Boolean);
      if (!cells.length) continue;
      const rowText = cells.join(' ');
      const rowCycle = spanishCycleToNumber(rowText);
      if (rowCycle && cells.length <= 2) {
        currentCycle = rowCycle;
        continue;
      }
      const normalizedRow = normalizeText(rowText);
      if (/^(curso|asignatura|materia|course|subject|module|codigo|code|creditos?|credits?)/.test(normalizedRow)) continue;

      const courseCell = cells.find(cell => isLikelyCourseName(cell) && !/^\d+(\.\d+)?$/.test(cell)) || '';
      const cleanedCourse = courseCell
        .replace(/^[A-Z]{2,5}\d{2,5}\s+/i, match => match.trim() + ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (currentCycle && isLikelyCourseName(cleanedCourse)) {
        courses.push({ ciclo: currentCycle, nombreCurso: cleanedCourse, evidencia: rowText });
      }
    }
  }
  return courses;
}

function parseHtmlGenericCycleLists(html = '') {
  const cycleHeaderRegex = /<(h[1-6]|p|div|span|button|a)[^>]*>([^<]*(?:ciclo|semestre|semester|cycle|term|year)[^<]*)<\/\1>/gi;
  const headers = [...html.matchAll(cycleHeaderRegex)]
    .map(match => ({
      index: match.index || 0,
      label: cleanPageText(match[2]),
      ciclo: spanishCycleToNumber(cleanPageText(match[2])),
    }))
    .filter(header => header.ciclo);
  if (!headers.length) return [];

  const courses = [];
  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : Math.min(html.length, start + 8000);
    const chunk = html.slice(start, end)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
    const lines = chunk
      .replace(/\r/g, '\n')
      .replace(/\s*-\s*/g, '\n')
      .split(/\n+/)
      .map(line => cleanPageText(line).trim())
      .filter(Boolean);
    for (const line of lines) {
      if (normalizeText(line).includes(normalizeText(headers[i].label))) continue;
      if (isLikelyCourseName(line)) {
        courses.push({ ciclo: headers[i].ciclo, nombreCurso: line, evidencia: line });
      }
    }
  }
  return courses;
}

function parseHtmlCurriculumCourses(html = '') {
  const parsers = [
    { parser: 'html_tab_malla_v1', courses: parseHtmlTabCurriculum(html) },
    { parser: 'html_cycle_cards_malla_v1', courses: parseHtmlCycleCardCurriculum(html) },
    { parser: 'html_loop_index_malla_v1', courses: parseHtmlLoopIndexCurriculum(html) },
    { parser: 'html_table_malla_v1', courses: parseHtmlTableCurriculum(html) },
    { parser: 'html_cycle_lists_malla_v1', courses: parseHtmlGenericCycleLists(html) },
  ];
  return parsers.find(result => result.courses.length >= 3) || null;
}

function isLowQualityCurriculumParse(courses = []) {
  if (!courses.length) return false;
  const noisy = courses.filter(course => isCurriculumMetadataLine(course.nombreCurso || course.evidencia || ''));
  const cycleCounts = courses.reduce((acc, course) => {
    const ciclo = course.ciclo || 'SC';
    acc[ciclo] = (acc[ciclo] || 0) + 1;
    return acc;
  }, {});
  const uniqueCycles = Object.keys(cycleCounts).length;
  const maxCycleShare = Math.max(...Object.values(cycleCounts)) / courses.length;
  if (noisy.length >= 5 || noisy.length / courses.length > 0.12) return true;
  if (courses.length > 30 && uniqueCycles <= 2) return true;
  if (courses.length > 40 && maxCycleShare > 0.65) return true;
  return false;
}

function findCurriculumPdfUrl(html = '', baseUrl = '') {
  const pdfLinks = [];
  const re = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      const scoreText = normalizeText(`${url} ${html.slice(Math.max(0, match.index - 300), match.index + 300)}`);
      let score = 0;
      if (scoreText.includes('malla')) score += 30;
      if (scoreText.includes('curricular')) score += 30;
      if (scoreText.includes('curriculum')) score += 30;
      if (scoreText.includes('plan de estudios')) score += 20;
      if (scoreText.includes('study plan')) score += 20;
      if (scoreText.includes('course sequence')) score += 20;
      if (scoreText.includes('program structure')) score += 15;
      if (scoreText.includes('brochure')) score += 5;
      if (/admision|admission|postula|reglamento|manual|formato|autorizacion/.test(scoreText)) score -= 25;
      pdfLinks.push({ url, score });
    } catch {
      // Ignora URLs mal formadas.
    }
  }
  return pdfLinks.sort((a, b) => b.score - a.score)[0]?.url || null;
}

function parseCurriculumCourses(text = '', url = '') {
  const domain = getDomain(url);
  const knownCourses = knownCurriculumByOfficialUrl(url);
  let courses = [];
  let parser = 'generic_html_malla_v1';

  if (domain.includes('ucv.edu.pe')) {
    parser = 'ucv_malla_v1';
    courses = parseLineBasedCurriculum(text);
    if (courses.length < 8) courses = parseFlattenedUcvCurriculum(text);
  } else {
    courses = parseLineBasedCurriculum(text);
  }

  if (courses.length < 3) {
    const tableCourses = parseTableLikeCurriculum(text);
    if (tableCourses.length > courses.length) {
      courses = tableCourses;
      parser = domain.includes('usmp.edu.pe') ? 'usmp_table_malla_v1' : 'generic_table_malla_v1';
    }
  }

  if ((!courses.length || isLowQualityCurriculumParse(courses)) && knownCourses.length) {
    courses = knownCourses;
    parser = `${parser}_known_url_fallback`;
  }

  const deduped = [];
  const seen = new Set();
  for (const course of courses) {
    const name = restoreSpanishAccents(course.nombreCurso).trim();
    const key = `${course.ciclo || ''}|${normalizeText(name)}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...course, nombreCurso: name });
  }

  return {
    parser,
    courses: deduped,
    status: deduped.length ? 'parseado' : 'requiere_revision',
  };
}

function extractPageTitle(html = '') {
  const titleMatch = String(html).match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? cleanPageText(titleMatch[1]).substring(0, 350) : null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AcademicBenchmarkBot/1.0; official-source-discovery)',
        'accept': 'text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5',
      },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!/text|html|json|pdf/i.test(type)) return '';
    return String(await res.text()).substring(0, RAW_HTML_CAPTURE_LIMIT);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPdfText(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AcademicBenchmarkBot/1.0; academic research)',
        'accept': 'application/pdf,*/*',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !/\.pdf($|\?)/i.test(url)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const pdfModule = await import('pdf-parse');
    let data = null;
    if (typeof pdfModule.default === 'function') {
      data = await pdfModule.default(buffer);
    } else if (typeof pdfModule === 'function') {
      data = await pdfModule(buffer);
    } else if (typeof pdfModule.PDFParse === 'function') {
      const parser = new pdfModule.PDFParse({ data: buffer });
      try {
        data = await parser.getText();
      } finally {
        await parser.destroy?.();
      }
    }
    return data?.text ? visibleText(data.text).substring(0, 120000) : null;
  } catch (err) {
    console.warn(`[pdf] No se pudo parsear ${url}:`, err.message);
    return null;
  }
}

function extractLinks(html, baseUrl, domain) {
  const links = new Set();
  const re = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (!url.hostname.replace(/^www\./, '').endsWith(domain)) continue;
      url.hash = '';
      links.add(url.toString());
    } catch {
      // ignore invalid links
    }
  }
  return [...links];
}

async function searchOfficialLinks(domain, career) {
  const queries = [
    `site:${domain} "${career}" "malla curricular"`,
    `site:${domain} "${career}" "plan de estudios"`,
    `site:${domain} "${career}" "perfil de egreso"`,
    `site:${domain} "${career}" pregrado`,
  ];
  const links = new Set();
  for (const q of queries) {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const html = await fetchText(url);
    const re = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
      let raw = match[1].replace(/&amp;/g, '&');
      try {
        const parsed = new URL(raw, 'https://duckduckgo.com');
        const uddg = parsed.searchParams.get('uddg');
        if (uddg) raw = decodeURIComponent(uddg);
        const candidate = new URL(raw);
        if (candidate.hostname.replace(/^www\./, '').endsWith(domain)) {
          candidate.hash = '';
          links.add(candidate.toString());
        }
      } catch {
        // ignore invalid search links
      }
    }
  }
  return [...links];
}

function scoreCandidate(url, text, careerName, title = '') {
  const urlAndTitle = normalizeText(`${url} ${title}`);
  const haystack = normalizeText(`${url} ${title} ${text}`);
  const tokens = careerTokens(careerName);
  const distinctive = distinctiveCareerTokens(careerName);
  const keywords = [
    'malla', 'curricular', 'plan de estudios', 'perfil de egreso',
    'competencias', 'carrera', 'pregrado', 'facultad', 'curso', 'cursos',
    'sumilla', 'brochure', 'silabo', 'sílabo'
  ];
  const detail = {
    carrera: 0,
    curricular: 0,
    url: 0,
    documento: 0,
    ruido: 0,
    coincidencia_fuerte: 0,
  };
  for (const token of tokens) if (haystack.includes(token)) detail.carrera += 8;
  for (const token of distinctive) if (tokenMatchesHaystack(urlAndTitle, token)) detail.coincidencia_fuerte += 18;
  for (const keyword of keywords) if (haystack.includes(normalizeText(keyword))) detail.curricular += 5;
  if (/malla|plan|perfil|competencia|pregrado|carrera/i.test(url)) detail.url += 12;
  if (/pdf/i.test(url)) detail.documento += 4;
  if (/blog|noticia|evento|news|admision|postula|contacto|campus|psicologia|arquitectura|derecho|economia|mecatronica|ambiental|comunicacion/i.test(url)
      && distinctive.length
      && !distinctive.some(t => tokenMatchesHaystack(urlAndTitle, t))) {
    detail.ruido -= 35;
  } else if (/blog|noticia|evento|news|admision|postula|contacto|campus/i.test(url)) {
    detail.ruido -= 10;
  }
  if (distinctive.length && !distinctive.some(t => tokenMatchesHaystack(urlAndTitle, t))) {
    detail.ruido -= 25;
  }
  const total = Object.values(detail).reduce((sum, value) => sum + value, 0);
  return { total, detail };
}

function hasStrongCareerMatch(url, title, careerName) {
  const distinctive = distinctiveCareerTokens(careerName);
  if (!distinctive.length) return true;
  const urlAndTitle = normalizeText(`${url} ${title || ''}`);
  return distinctive.some(token => tokenMatchesHaystack(urlAndTitle, token));
}

async function registerCuratedSources(programa, career) {
  const curatedSources = getCuratedBenchmarkSources(career, programa.nombre_universidad);
  if (!curatedSources.length) return [];

  const registered = [];
  await db_empl.query(
    `UPDATE benchmark_source_candidate
     SET estado='duplicado'
     WHERE id_programa_benchmark=? AND estado='candidato'`,
    [programa.id_programa_benchmark]
  );

  for (const source of curatedSources) {
    await db_empl.query(
      `INSERT INTO benchmark_source
       (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
       VALUES (?, ?, ?, ?, 'pendiente_validacion', 1, ?)
       ON DUPLICATE KEY UPDATE
         tipo_fuente=VALUES(tipo_fuente),
         titulo=VALUES(titulo),
         estado='pendiente_validacion',
         es_fuente_principal=1,
         observaciones=VALUES(observaciones),
         activo=1`,
      [
        programa.id_programa_benchmark,
        source.tipoFuente,
        source.titulo,
        source.url,
        'Fuente curada desde mapa base de benchmarking. Requiere validacion humana.',
      ]
    );
    await db_empl.query(
      `INSERT INTO benchmark_source_candidate
       (id_programa_benchmark, url, titulo, snippet, tipo_fuente_detectado, score_total, score_detalle_json, estado, motivo)
       VALUES (?, ?, ?, ?, ?, 100, CAST(? AS JSON), 'aprobado', ?)
       ON DUPLICATE KEY UPDATE
         titulo=VALUES(titulo),
         snippet=VALUES(snippet),
         tipo_fuente_detectado=VALUES(tipo_fuente_detectado),
         score_total=VALUES(score_total),
         score_detalle_json=VALUES(score_detalle_json),
         estado='aprobado',
         motivo=VALUES(motivo),
         buscado_en=NOW(),
         updated_at=CURRENT_TIMESTAMP`,
      [
        programa.id_programa_benchmark,
        source.url,
        source.titulo,
        'URL curada desde mapa base de benchmarking; pendiente de validacion academica.',
        source.tipoFuente,
        JSON.stringify({ curada: 100, carrera: 0, curricular: 0, url: 0 }),
        'Coincidencia exacta en mapa base de fuentes oficiales.',
      ]
    );
    registered.push({
      url: source.url,
      title: source.titulo,
      tipo: source.tipoFuente,
      score: 100,
      detail: { curada: 100 },
      snippet: 'URL curada desde mapa base de benchmarking.',
    });
  }

  await db_empl.query(
    `UPDATE programa_benchmark
     SET url_programa=?, estado_extraccion='pendiente', observaciones=?
     WHERE id_programa_benchmark=?`,
    [
      curatedSources[0].url,
      `${curatedSources.length} fuente(s) curada(s) registradas. Requiere validacion humana.`,
      programa.id_programa_benchmark,
    ]
  );
  return registered;
}

async function discoverOfficialSources(idPrograma) {
  const [[programa]] = await db_empl.query(
    `SELECT pb.id_programa_benchmark, pb.nombre_programa, pb.url_programa,
            ub.nombre_universidad, ub.sitio_web,
            bpe.nombre_oficial_sugerido, bpe.aliases_json
     FROM programa_benchmark pb
     JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
     LEFT JOIN benchmark_program_equivalence bpe ON bpe.id_programa_benchmark = pb.id_programa_benchmark
     WHERE pb.id_programa_benchmark=?`,
    [idPrograma]
  );
  if (!programa) return { ok: false, error: 'Programa no encontrado' };

  const domain = getDomain(programa.sitio_web || programa.url_programa);
  const home = programa.sitio_web || programa.url_programa;
  const career = programa.nombre_oficial_sugerido || getProgramBaseName(programa.nombre_programa);
  let aliases = [];
  try {
    aliases = programa.aliases_json ? JSON.parse(programa.aliases_json) : [];
  } catch {
    aliases = [];
  }
  if (!domain || !home) return { ok: false, error: 'Universidad sin sitio web oficial' };

  const curated = await registerCuratedSources(programa, career);
  if (curated.length) {
    return { ok: true, best: curated[0], candidates: curated };
  }

  const homeText = await fetchText(home);
  const homeLinks = extractLinks(homeText, home, domain);
  const terms = careerTokens(career);
  const filtered = homeLinks
    .filter(url => {
      const n = normalizeText(url);
      return terms.some(t => n.includes(t)) || /pregrado|carrera|malla|plan|perfil|facultad|programa/i.test(n);
    })
    .slice(0, 60);

  const slug = terms.join('-');
  const commonCandidates = [
    `${home.replace(/\/$/, '')}/pregrado/${slug}/`,
    `${home.replace(/\/$/, '')}/carrera/${slug}/`,
    `${home.replace(/\/$/, '')}/carreras/${slug}/`,
    `${home.replace(/\/$/, '')}/pregrado/carrera/${slug}/`,
    `${home.replace(/\/$/, '')}/facultad/${slug}/`,
  ];

  const searchLinks = [
    ...(await searchOfficialLinks(domain, career)),
    ...((Array.isArray(aliases) ? aliases : []).length
      ? (await Promise.all(aliases.slice(0, 4).map(alias => searchOfficialLinks(domain, alias)))).flat()
      : []),
  ];
  const candidates = [...new Set([...searchLinks, ...filtered, ...commonCandidates])].slice(0, 100);
  const scored = [];
  for (const url of candidates) {
    const html = await fetchText(url);
    if (!html || html.length < 200) continue;
    const title = extractPageTitle(html);
    const text = cleanPageText(html);
    if (!hasStrongCareerMatch(url, title || '', career)) continue;
    const score = scoreCandidate(url, text, career, title || '');
    const tipo = inferSourceType(url, text);
    const snippet = text.substring(0, 500);
    if (score.total >= 25) scored.push({ url, score: score.total, detail: score.detail, tipo, title, snippet, textLength: text.length });
  }

  scored.sort((a, b) => b.score - a.score);
  await db_empl.query(
    `UPDATE benchmark_source_candidate
     SET estado='duplicado'
     WHERE id_programa_benchmark=? AND estado='candidato'`,
    [idPrograma]
  );

  for (const item of scored.slice(0, 12)) {
    await db_empl.query(
      `INSERT INTO benchmark_source_candidate
       (id_programa_benchmark, url, titulo, snippet, tipo_fuente_detectado, score_total, score_detalle_json, estado, motivo)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), 'candidato', ?)
       ON DUPLICATE KEY UPDATE
         titulo=VALUES(titulo),
         snippet=VALUES(snippet),
         tipo_fuente_detectado=VALUES(tipo_fuente_detectado),
         score_total=VALUES(score_total),
         score_detalle_json=VALUES(score_detalle_json),
         estado='candidato',
         motivo=VALUES(motivo),
         buscado_en=NOW(),
         updated_at=CURRENT_TIMESTAMP`,
      [
        idPrograma,
        item.url,
        item.title,
        item.snippet,
        item.tipo,
        item.score,
        JSON.stringify(item.detail),
        `Candidato oficial en ${domain}. Tipo detectado: ${item.tipo}. Score ${item.score}.`,
      ]
    );
  }

  const best = scored[0];
  if (!best) {
    await db_empl.query(
      `UPDATE programa_benchmark
       SET observaciones=?
       WHERE id_programa_benchmark=?`,
      [`No se encontro fuente exacta oficial para ${career} en ${domain}.`, idPrograma]
    );
    return { ok: false, error: 'No se encontro fuente exacta oficial', candidates: [] };
  }

  await db_empl.query(
    `UPDATE programa_benchmark
     SET observaciones=?
     WHERE id_programa_benchmark=?`,
    [`${scored.slice(0, 12).length} candidatos encontrados. Requiere aprobacion de fuente.`, idPrograma]
  );

  return { ok: true, best, candidates: scored.slice(0, 12) };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buildDriver() {
  try {
    const { Builder, Browser } = await import('selenium-webdriver');
    const chrome = await import('selenium-webdriver/chrome.js');
    const options = new chrome.Options();
    options.addArguments(
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (compatible; AcademicResearchBot/1.0; academic research)'
    );
    const driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build();
    await driver.manage().setTimeouts({ implicit: 5000, pageLoad: PAGE_LOAD_TIMEOUT_MS });
    return driver;
  } catch (err) {
    throw new Error(`selenium-webdriver no disponible: ${err.message}. Instala con: npm install selenium-webdriver`);
  }
}

async function extractPageText(driver, url) {
  await driver.get(url);
  await sleep(2000);
  await driver.executeScript(`
    return new Promise(resolve => {
      let y = 0;
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      const timer = setInterval(() => {
        y += step;
        window.scrollTo(0, y);
        if (y >= document.body.scrollHeight) {
          clearInterval(timer);
          setTimeout(() => resolve(true), 700);
        }
      }, 250);
    });
  `).catch(() => null);
  const bodyText = await driver.executeScript(
    'return document.body ? document.body.innerText : ""'
  );
  const bodyHtml = await driver.executeScript(
    'return document.documentElement ? document.documentElement.outerHTML : ""'
  ).catch(() => '');
  const title = await driver.getTitle().catch(() => '');
  const finalUrl = await driver.getCurrentUrl().catch(() => url);
  const combinedText = `${String(bodyText || '')}\n\n${cleanPageText(String(bodyHtml || ''))}`;
  return {
    url,
    finalUrl,
    title,
    text: visibleText(combinedText).substring(0, 120000),
    rawHtml: String(bodyHtml || '').substring(0, RAW_HTML_CAPTURE_LIMIT),
  };
}

async function extractPageTextWithFetch(url) {
  if (/\.pdf($|\?)/i.test(url)) {
    const pdfText = await fetchPdfText(url);
    if (pdfText && pdfText.length > 100) {
      return {
        url,
        finalUrl: url,
        title: `PDF malla curricular - ${url.split('/').pop().split('?')[0]}`,
        text: pdfText,
        rawHtml: '',
      };
    }
    throw new Error('No se pudo extraer texto del PDF');
  }

  const html = await fetchText(url);
  const text = cleanPageText(html);
  if (!text || text.length < 200) {
    throw new Error('No se pudo obtener texto suficiente con fetch');
  }
  return {
    url,
    finalUrl: url,
    title: extractPageTitle(html) || 'Fuente oficial capturada con fetch',
    text: visibleText(text).substring(0, 120000),
    rawHtml: String(html || '').substring(0, RAW_HTML_CAPTURE_LIMIT),
  };
}

async function findOrCreateBenchmarkSource(idPrograma, url, title = null, text = '') {
  const [rows] = await db_empl.query(
    `SELECT id_benchmark_source
     FROM benchmark_source
     WHERE id_programa_benchmark=? AND url=? AND activo=1
     LIMIT 1`,
    [idPrograma, url]
  );
  if (rows.length) return rows[0].id_benchmark_source;

  const tipoFuente = inferSourceType(url, text);
  const [result] = await db_empl.query(
    `INSERT INTO benchmark_source
     (id_programa_benchmark, tipo_fuente, titulo, url, estado, es_fuente_principal, observaciones)
     VALUES (?, ?, ?, ?, 'pendiente_extraccion', 1, ?)
     ON DUPLICATE KEY UPDATE
       tipo_fuente=VALUES(tipo_fuente),
       titulo=VALUES(titulo),
       activo=1,
       es_fuente_principal=1,
       observaciones=VALUES(observaciones)`,
    [
      idPrograma,
      tipoFuente,
      title || `Fuente oficial ${tipoFuente}`,
      url,
      'Registrada automaticamente al extraer evidencia.',
    ]
  );

  if (result.insertId) return result.insertId;
  const [created] = await db_empl.query(
    `SELECT id_benchmark_source
     FROM benchmark_source
     WHERE id_programa_benchmark=? AND url=? AND activo=1
     LIMIT 1`,
    [idPrograma, url]
  );
  return created[0]?.id_benchmark_source || null;
}

async function createSourceSnapshot({
  idPrograma,
  idBenchmarkSource,
  url,
  urlFinal,
  title,
  text,
  parser,
  estadoParseo,
  cursosDetectados,
  observaciones,
}) {
  const safeText = visibleText(text).substring(0, 120000);
  const hash = hashText(safeText);
  const [result] = await db_empl.query(
    `INSERT INTO benchmark_source_snapshot
     (id_benchmark_source, id_programa_benchmark, url, url_final, titulo, texto_extraido,
      hash_contenido, parser_usado, estado_parseo, cursos_detectados, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idBenchmarkSource || null,
      idPrograma,
      url,
      urlFinal || url,
      title || null,
      safeText,
      hash,
      parser || null,
      estadoParseo || 'sin_parsear',
      cursosDetectados || 0,
      observaciones || null,
    ]
  );
  return { idSnapshot: result.insertId, hash, text: safeText };
}

async function saveParseLog({ idPrograma, idSnapshot, parser, estado, cursosDetectados, detalle }) {
  await db_empl.query(
    `INSERT INTO benchmark_parse_log
     (id_programa_benchmark, id_snapshot, parser_usado, estado, cursos_detectados, detalle)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      idPrograma,
      idSnapshot || null,
      parser || 'sin_parser',
      estado || 'requiere_revision',
      cursosDetectados || 0,
      detalle || null,
    ]
  );
}

async function replaceBenchmarkCourses(idPrograma, url, courses) {
  await db_empl.query(
    `DELETE FROM curso_benchmark
     WHERE id_programa_benchmark=?`,
    [idPrograma]
  );

  for (const course of courses) {
    await db_empl.query(
      `INSERT INTO curso_benchmark
       (id_programa_benchmark, nombre_curso, ciclo, area_formacion, descripcion_curso, fuente_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        idPrograma,
        course.nombreCurso,
        course.ciclo || null,
        'malla_externa',
        course.evidencia || null,
        url,
      ]
    );
  }
}

async function persistExtraction({ idPrograma, url, urlFinal, title, text, rawHtml }) {
  let textForStorage = text;
  let titleForStorage = title;
  let urlFinalForStorage = urlFinal;

  // 1. Try HTML tab structure parser first (handles UPC-style Bootstrap tab curricula).
  //    This must run before text-based parsing because text extraction loses tab context.
  let parsed = null;
  if (rawHtml) {
    const htmlParsed = parseHtmlCurriculumCourses(rawHtml);
    if (htmlParsed) {
      parsed = { ...htmlParsed, status: 'parseado' };
    }
  }

  // 2. Fall back to text-based parsing
  if (!parsed) {
    parsed = parseCurriculumCourses(textForStorage, urlFinalForStorage || url);
  }

  // 3. Linked PDF fallback: many university pages only list the actual curriculum as a PDF link.
  if (!parsed.courses.length && rawHtml && url?.startsWith('http')) {
    const linkedPdfUrl = findCurriculumPdfUrl(rawHtml, urlFinalForStorage || url);
    if (linkedPdfUrl) {
      try {
        const pdf = await extractPageTextWithFetch(linkedPdfUrl);
        const pdfParsed = parseCurriculumCourses(pdf.text, pdf.finalUrl || linkedPdfUrl);
        if (pdfParsed.courses.length > parsed.courses.length) {
          textForStorage = pdf.text;
          titleForStorage = pdf.title || titleForStorage;
          urlFinalForStorage = pdf.finalUrl || linkedPdfUrl;
          parsed = {
            ...pdfParsed,
            parser: `${pdfParsed.parser}_linked_pdf_fallback`,
          };
        }
      } catch {
        // Se conserva la captura original si el PDF enlazado no se puede leer.
      }
    }
  }

  // 4. Fetch fallback: try plain HTTP fetch when Selenium/text parsing yielded nothing
  if (!parsed.courses.length && url?.startsWith('http')) {
    try {
      const fallback = await extractPageTextWithFetch(url);
      // Try HTML tab parser on fallback HTML too
      const fallbackHtmlParsed = fallback.rawHtml ? parseHtmlCurriculumCourses(fallback.rawHtml) : null;
      const fallbackParsed = fallbackHtmlParsed
        ? { ...fallbackHtmlParsed, parser: `${fallbackHtmlParsed.parser}_fetch_fallback`, status: 'parseado' }
        : parseCurriculumCourses(fallback.text, fallback.finalUrl || url);
      if (fallbackParsed.courses.length > parsed.courses.length) {
        textForStorage = fallback.text;
        titleForStorage = fallback.title || titleForStorage;
        urlFinalForStorage = fallback.finalUrl || urlFinalForStorage;
        parsed = fallbackParsed;
      }
    } catch {
      // Se conserva la captura original si la lectura estatica falla.
    }
  }

  const idBenchmarkSource = await findOrCreateBenchmarkSource(idPrograma, url, titleForStorage, textForStorage);
  const snapshot = await createSourceSnapshot({
    idPrograma,
    idBenchmarkSource,
    url,
    urlFinal: urlFinalForStorage,
    title: titleForStorage,
    text: textForStorage,
    parser: parsed.parser,
    estadoParseo: parsed.status,
    cursosDetectados: parsed.courses.length,
    observaciones: parsed.courses.length
      ? `Malla detectada automaticamente: ${parsed.courses.length} cursos.`
      : 'No se detecto una malla estructurada; requiere revision o carga manual.',
  });

  if (parsed.courses.length) {
    await replaceBenchmarkCourses(idPrograma, url, parsed.courses);
  }

  await saveParseLog({
    idPrograma,
    idSnapshot: snapshot.idSnapshot,
    parser: parsed.parser,
    estado: parsed.courses.length ? 'ok' : 'sin_malla',
    cursosDetectados: parsed.courses.length,
    detalle: parsed.courses.length
      ? `Cursos guardados desde ${url}.`
      : `No se encontraron ciclos/cursos suficientes en ${url}.`,
  });

  await db_empl.query(
    `UPDATE benchmark_source
     SET estado=?, fecha_captura=NOW(), extractor='selenium',
         extractor_version='malla_v1', evidencia_resumen=?, snapshot_hash=?
     WHERE id_benchmark_source=?`,
    [
      parsed.courses.length ? 'extraido' : 'pendiente_validacion',
      parsed.courses.length
        ? `${parsed.courses.length} cursos detectados con ${parsed.parser}.`
        : `Texto capturado sin malla estructurada con ${parsed.parser}.`,
      snapshot.hash,
      idBenchmarkSource,
    ]
  );

  await db_empl.query(
    `UPDATE programa_benchmark
     SET fuente_texto_original=?, url_programa=COALESCE(NULLIF(?, ''), url_programa),
         fecha_captura=NOW(), estado_extraccion='procesado', observaciones=?
     WHERE id_programa_benchmark=?`,
    [
      snapshot.text,
      url,
      `${titleForStorage ? `Titulo: ${titleForStorage}. ` : ''}Parser: ${parsed.parser}. Cursos detectados: ${parsed.courses.length}.`,
      idPrograma,
    ]
  );

  return {
    ok: true,
    textLength: snapshot.text.length,
    title: titleForStorage,
    parser: parsed.parser,
    estadoParseo: parsed.status,
    cursosDetectados: parsed.courses.length,
    idSnapshot: snapshot.idSnapshot,
  };
}

async function scrapeProgramaUrl(idPrograma, url) {
  if (!url || !url.startsWith('http')) {
    await db_empl.query(
      'UPDATE programa_benchmark SET estado_extraccion=?, observaciones=? WHERE id_programa_benchmark=?',
      ['error', 'URL inválida o ausente', idPrograma]
    );
    return { ok: false, error: 'URL inválida o ausente' };
  }

  await db_empl.query(
    'UPDATE programa_benchmark SET estado_extraccion=?, observaciones=? WHERE id_programa_benchmark=?',
    ['pendiente', 'Scraping iniciado...', idPrograma]
  );

  // For PDF URLs, skip Selenium entirely and parse the PDF directly
  if (/\.pdf($|\?)/i.test(url)) {
    try {
      const result = await extractPageTextWithFetch(url);
      return await persistExtraction({
        idPrograma,
        url,
        urlFinal: result.finalUrl,
        title: result.title,
        text: result.text,
        rawHtml: result.rawHtml || '',
      });
    } catch (pdfErr) {
      const msg = String(pdfErr.message || pdfErr).substring(0, 500);
      await db_empl.query(
        'UPDATE programa_benchmark SET estado_extraccion=?, observaciones=?, fecha_captura=NOW() WHERE id_programa_benchmark=?',
        ['error', `Error extracción PDF: ${msg}`, idPrograma]
      );
      return { ok: false, error: msg };
    }
  }

  let driver = null;
  try {
    driver = await buildDriver();
    await sleep(1000);

    const result = await extractPageText(driver, url);
    return await persistExtraction({
      idPrograma,
      url,
      urlFinal: result.finalUrl,
      title: result.title,
      text: result.text,
      rawHtml: result.rawHtml || '',
    });

    await db_empl.query(
      `UPDATE programa_benchmark
       SET fuente_texto_original=?, fecha_captura=NOW(), estado_extraccion='procesado', observaciones=?
       WHERE id_programa_benchmark=?`,
      [result.text, `Título: ${result.title}`, idPrograma]
    );

    return { ok: true, textLength: result.text.length, title: result.title };
  } catch (err) {
    const msg = String(err.message || err).substring(0, 500);
    try {
      const fallback = await extractPageTextWithFetch(url);
      return await persistExtraction({
        idPrograma,
        url,
        urlFinal: fallback.finalUrl,
        title: fallback.title,
        text: fallback.text,
        rawHtml: fallback.rawHtml || '',
      });
    } catch (fallbackErr) {
      const fallbackMsg = String(fallbackErr.message || fallbackErr).substring(0, 300);
      await db_empl.query(
        `UPDATE programa_benchmark
         SET estado_extraccion='error', observaciones=?, fecha_captura=NOW()
         WHERE id_programa_benchmark=?`,
        [`Error extracción. Selenium: ${msg}. Fetch: ${fallbackMsg}`, idPrograma]
      );
      return { ok: false, error: `Selenium: ${msg}. Fetch: ${fallbackMsg}` };
    }
    await db_empl.query(
      `UPDATE programa_benchmark
       SET estado_extraccion='error', observaciones=?, fecha_captura=NOW()
       WHERE id_programa_benchmark=?`,
      [`Error scraping: ${msg}`, idPrograma]
    );
    return { ok: false, error: msg };
  } finally {
    if (driver) {
      try { await driver.quit(); } catch { /* ignore */ }
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }
}

async function scraperBatch(ids) {
  const results = [];
  for (const id of ids) {
    const [rows] = await db_empl.query(
      'SELECT id_programa_benchmark, url_programa FROM programa_benchmark WHERE id_programa_benchmark=?',
      [id]
    );
    if (!rows.length) { results.push({ id, ok: false, error: 'Programa no encontrado' }); continue; }
    const row = rows[0];
    const r = await scrapeProgramaUrl(row.id_programa_benchmark, row.url_programa);
    results.push({ id, ...r });
  }
  return results;
}

async function cargarTextoManual(idPrograma, textoFuente, urlOrigen) {
  if (!textoFuente || textoFuente.trim().length < 20) {
    return { ok: false, error: 'El texto fuente debe tener al menos 20 caracteres' };
  }
  return await persistExtraction({
    idPrograma,
    url: urlOrigen || `manual://${idPrograma}`,
    urlFinal: urlOrigen || null,
    title: 'Texto cargado manualmente',
    text: textoFuente,
  });

  await db_empl.query(
    `UPDATE programa_benchmark
     SET fuente_texto_original=?, url_programa=COALESCE(NULLIF(?, ''), url_programa),
         fecha_captura=NOW(), estado_extraccion='procesado',
         observaciones='Texto cargado manualmente'
     WHERE id_programa_benchmark=?`,
    [textoFuente.substring(0, 30000), urlOrigen || '', idPrograma]
  );
  return { ok: true };
}

export { scrapeProgramaUrl, scraperBatch, cargarTextoManual, discoverOfficialSources, parseCurriculumCourses, parseHtmlCurriculumCourses, extractPageTextWithFetch };
