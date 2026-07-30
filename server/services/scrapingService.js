


import {
  setCandidatosDuplicado, upsertCuratedSource, upsertCuratedCandidate,
  updateProgramaUrlAndObservaciones, upsertCandidate, updateProgramaObservaciones,
  findExistingBenchmarkSource, insertBenchmarkSource, getCreatedBenchmarkSource,
  insertSourceSnapshot, insertParseLog,
  replaceBenchmarkCourses as dbReplaceBenchmarkCourses,
  updateBenchmarkSourceAfterExtraction, updateProgramaAfterExtraction,
  setScrapingStatus, getProgramaUrl, getProgramaWithEquivalencia,
} from '../repositories/empleabilidad/scrapingRepository.js';
import { getCuratedSourcesByBenchmarkType } from '../data/benchmarkingCuratedSources.js';
import { getKnownCurriculumByUrl, shouldPreferKnownCurriculum } from '../data/benchmarkingKnownCurricula.js';
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

const COURSE_NOISE_WORDS = [
  'admision', 'admission', 'solicita informacion', 'inscribete', 'campus',
  'beneficios', 'por que estudiar', 'porque estudiar', 'campo laboral',
  'perfil del egresado', 'perfil de egreso', 'mision', 'vision',
  'estudia', 'estudiar', 'aprende', 'conoce', 'descubre', 'postula',
  'descarga', 'modalidad', 'duracion', 'grado academico', 'titulo profesional',
  'convenios', 'empleabilidad',
];

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

function isStandaloneCycleHeader(line = '') {
  const normalized = normalizeText(line).replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 70) return false;
  return /^(?:ciclo|semestre|cycle|semester|term|year)\s+[0-9]{1,2}$/.test(normalized)
    || /^(?:ciclo|semestre|cycle|semester|term|year)\s+[ivx]{1,5}$/.test(normalized)
    || /^(?:primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)\s+(?:ciclo|semestre)$/.test(normalized)
    || /^(?:ciclo|semestre)\s+(?:primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|setimo|octavo|noveno|decimo|undecimo|duodecimo)$/.test(normalized)
    || /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(?:cycle|semester|term|year)$/.test(normalized)
    || /^(?:cycle|semester|term|year)\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)$/.test(normalized)
    || /^[ivx]{1,5}\s+(?:ciclo|semestre|cycle|semester|term|year)$/.test(normalized);
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
  if (/https?:\/\/|www\.|@/.test(n)) return false;
  if (/[?Â¿!Â¡]/.test(text)) return false;
  if (/[.;:]$/.test(text)) return false;
  if ((text.match(/[,.;:]/g) || []).length > 3) return false;
  if (/^(malla curricular|curriculum|study plan|plan de estudios|ciclo|semestre|semester|term|year|periodo|periodo academico|electivo|elective)$/.test(n)) return false;
  if (SECTION_STOP_WORDS.some(word => n.includes(normalizeText(word)))) return false;
  if (COURSE_NOISE_WORDS.some(word => n.includes(normalizeText(word)))) return false;
  if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^(dni|correo|apellidos|nombres|telefono|celular)$/i.test(text)) return false;
  if (/^(creditos?|credits?|hours?|horas?|prerequisites?|pre requisit[eo]|modalidad|character|caracter|type|code|codigo)$/i.test(n)) return false;
  if (/^(apply|admission|contact|brochure|download|postula|inscribete|conoce mas|learn more)$/i.test(n)) return false;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 14) return false;
  if (words.length > 10 && !/^(?:[A-Z]{2,6}\d{1,5}\s+)/.test(text)) return false;
  return /[a-záéíóúñ]/i.test(text);
}

function isCurriculumMetadataLine(line = '') {
  const n = normalizeText(line);
  if (!n) return true;
  if (/https?:\/\/|www\.|@/.test(n)) return true;
  if (/^\+?\d[\d\s().-]{6,}$/.test(n)) return true;
  if (/^--\s*\d+\s+of\s+\d+/.test(n)) return true;
  if (/\bcreditos?\b.*\bcreditos?\b/.test(n)) return true;
  if (/\bhoras?\s+(practicas|teoricas)\b.*\bhoras?\s+(practicas|teoricas)\b/.test(n)) return true;
  if (/^(codigo|nombre del curso|horas teoricas|horas practicas|creditos|formato presencial|formato blended|formato virtual|tipo de curso|requisitos|ht hp|cp cv|competencias especificas|competencias generales)$/.test(n)) return true;
  if (/\b(creditos generales|creditos obligatorios|creditos electivos|creditaje total|niveles de las competencias|logro inicial|logro intermedio|logro final|fecha de aprobacion|rectificado al|sumilla|prerrequisito|pre requisito|requisito)\b/.test(n)) return true;
  if (/^(areas|cursos|creditaje total|total de creditos|total de horas|duracion|modalidad|turno|sede|campus)\s*\d*/.test(n)) return true;
  if (/\b(malla curricular|plan de estudios)\b.*\b(descarga|pdf|brochure|ingresantes|vigente)\b/.test(n)) return true;
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

function cleanCatalogCourseTitle(value = '') {
  return cleanPageText(value)
    .replace(/\b(?:Units|Credits|Hours|Quarter|Autumn|Winter|Spring|Summer)\b.*$/i, '')
    .replace(/\s+(?:or|and)\s*$/i, '')
    .replace(/^[;:,.\-\s]+|[;:,.\-\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInternationalCatalogCourses(rawText = '', url = '') {
  const domain = getDomain(url);
  const isSupportedCatalog = /(?:catalog\.mit\.edu|catalog\.caltech\.edu|bulletin\.stanford\.edu)/i.test(domain);
  if (!isSupportedCatalog) return [];

  const text = cleanPageText(rawText);
  if (!text) return [];

  const courses = [];
  const seen = new Set();
  const addCourse = (codigo, nombreCurso, evidencia = '') => {
    const name = cleanCatalogCourseTitle(nombreCurso);
    if (!isLikelyCourseName(name)) return;
    const key = `${normalizeText(codigo)}|${normalizeText(name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    courses.push({
      ciclo: 'S/C',
      nombreCurso: codigo ? `${codigo} ${name}` : name,
      evidencia: evidencia || `${codigo || ''} ${name}`.trim(),
    });
  };

  if (/catalog\.mit\.edu/i.test(domain)) {
    const code = String.raw`\d{1,2}(?:\.[A-Z])?\.\d{2,4}[A-Z]?`;
    const re = new RegExp(String.raw`\b(${code})\s+(.{5,120}?)(?=\s+(?:\d{1,2}(?:-\d{1,2})?|GIR|REST|CI-[A-Z]|HASS|Units|or)\b)`, 'gi');
    let match;
    while ((match = re.exec(text)) !== null) addCourse(match[1], match[2], match[0]);
  } else if (/catalog\.caltech\.edu/i.test(domain)) {
    const code = String.raw`(?:[A-Z]{2,5}(?:\/[A-Z]{2,5}){0,3}\s*\d{1,3}[a-z]{0,3}|[A-Z][a-z]\s*\d{1,3}[a-z]?)`;
    const re = new RegExp(String.raw`\b(${code})\s+([A-Z][A-Za-z0-9 '&,()\-:]{5,100}?)(?=\s+(?:-|[0-9]{1,2}\b|units?|Total|HSS|Other|$))`, 'g');
    let match;
    while ((match = re.exec(text)) !== null) addCourse(match[1].replace(/\s+/g, ' '), match[2], match[0]);
  } else if (/bulletin\.stanford\.edu/i.test(domain)) {
    const courseNameRe = /\bcourse\s+(?!or\b|and\b|units\b)([A-Z][A-Za-z0-9 '&,()\-:]{5,95}?)(?=\s+course\b|\s+or\b|\s+and\b|<\/|\s+units?\b)/gi;
    let match;
    while ((match = courseNameRe.exec(rawText)) !== null) addCourse('', decodeHtmlEntities(match[1]), match[0]);
  }

  if (courses.length < 3 || courses.length > 140) return [];
  return courses;
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


    if (isStandaloneCycleHeader(line)) {
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

function knownCurriculumByOfficialUrl(url = '', context = {}) {
  const normalizedUrl = normalizeText(url);
  const mappedCourses = getKnownCurriculumByUrl(url, context);
  if (mappedCourses.length) return mappedCourses;
  let courses = [];
  let label = '';

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

async function getPreferredKnownCurriculumExtraction(idPrograma, url, title = null) {
  const programa = await getProgramaWithEquivalencia(idPrograma);
  const parseContext = {
    career: programa?.nombre_oficial_sugerido || programa?.nombre_programa,
    programName: programa?.nombre_programa,
    university: programa?.nombre_universidad,
    title,
  };
  const courses = knownCurriculumByOfficialUrl(url, parseContext);
  if (!courses.length || !shouldPreferKnownCurriculum(url, parseContext)) return null;

  const text = courses
    .map(course => `Ciclo ${course.ciclo}: ${course.nombreCurso}`)
    .join('\n');

  return {
    url,
    finalUrl: url,
    title: title || `Malla curricular curada - ${url.split('/').pop().split('?')[0] || 'fuente oficial'}`,
    text,
    rawHtml: '',
  };
}


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
    .filter(header => header.ciclo && isStandaloneCycleHeader(header.label));
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

function parseInlineOrdinalCycleCurriculum(text = '') {
  if (!/\d{1,2}\.\s*°\s*CICLO\s*:/i.test(text)) return [];
  const courses = [];
  const cycleMatches = [...String(text).matchAll(/(\d{1,2})\.\s*°\s*CICLO\s*:/gi)];
  for (let i = 0; i < cycleMatches.length; i += 1) {
    const match = cycleMatches[i];
    const ciclo = String(Number(match[1]));
    const start = (match.index || 0) + match[0].length;
    const end = i + 1 < cycleMatches.length ? cycleMatches[i + 1].index : String(text).length;
    const chunk = String(text).slice(start, end);
    const courseMatches = [...chunk.matchAll(/([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s,./:&-]{3,140}?)\s*\((?:P|NP|SP)\)/g)];
    for (const courseMatch of courseMatches) {
      const nombreCurso = cleanCurriculumCourseLine(courseMatch[1]);
      if (isLikelyCourseName(nombreCurso)) {
        courses.push({ ciclo, nombreCurso, evidencia: courseMatch[0] });
      }
    }
  }
  return courses;
}

function parsePlainTextPlanRows(text = '') {
  if (!/\bNivel\s+\d{1,2}\b/i.test(text) || !/\bCOD\s+Asignatura\b/i.test(text)) return [];
  const courses = [];
  let ciclo = null;
  let pending = '';
  const lines = String(text)
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const line of lines) {
    const levelMatch = line.match(/^Nivel\s+(\d{1,2})$/i);
    if (levelMatch) {
      ciclo = String(Number(levelMatch[1]));
      pending = '';
      continue;
    }
    if (!ciclo || /^COD\s+Asignatura\b/i.test(line) || /^TEO\s+PRA\s+TOT$/i.test(line) || /^TOTAL DE CR/i.test(line) || /^--\s*\d+\s+of\s+\d+/i.test(line)) {
      continue;
    }

    const candidate = pending ? `${pending} ${line}` : line;
    const rowMatch = candidate.match(/^\d{3,6}\s+(.+?)\s+[OE]\s+\d+\s+(?:TEO|TEO-PRA|SEM|PRA|---|-)\b/i);
    if (rowMatch) {
      const nombreCurso = cleanCurriculumCourseLine(rowMatch[1]);
      if (isLikelyCourseName(nombreCurso)) {
        courses.push({ ciclo, nombreCurso, evidencia: candidate });
      }
      pending = '';
      continue;
    }

    pending = /^\d{3,6}\s+/.test(line) || pending ? candidate : '';
  }
  return courses;
}

function parseMultilineCodeCreditRows(text = '') {
  if (!/\bCODIGO\s+ASIGNATURA\b/i.test(text) || !/\bCiclo\s+\d{1,2}\b/i.test(text)) return [];
  const courses = [];
  let ciclo = null;
  let current = null;
  const lines = String(text)
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const flush = evidencia => {
    if (!current || !ciclo) return;
    const nombreCurso = cleanCurriculumCourseLine(current.parts.join(' '));
    if (isLikelyCourseName(nombreCurso)) {
      courses.push({ ciclo, nombreCurso, evidencia: evidencia || `${current.code} ${nombreCurso}` });
    }
    current = null;
  };

  for (const line of lines) {
    const cycleMatch = line.match(/^Ciclo\s+(\d{1,2})$/i);
    if (cycleMatch) {
      flush();
      ciclo = String(Number(cycleMatch[1]));
      continue;
    }
    if (!ciclo || /^--\s*\d+\s+of\s+\d+/i.test(line) || /^(ASIGNATURA|PRE-REQUISITO|CODIGO ASIGNATURA|Cr[eé]ditos Tipo)$/i.test(line)) {
      continue;
    }

    const sameLine = line.match(/^([A-Z]*\d[A-Z0-9]{6,})\s+(.+?)\s+\d+(?:\.\d+)?\s+[OE]\s+\d+\b/i);
    if (sameLine) {
      flush();
      const nombreCurso = cleanCurriculumCourseLine(sameLine[2]);
      if (isLikelyCourseName(nombreCurso)) {
        courses.push({ ciclo, nombreCurso, evidencia: line });
      }
      continue;
    }

    const codeOnly = line.match(/^([A-Z]*\d[A-Z0-9]{6,})\s*(.*)$/i);
    if (codeOnly) {
      flush();
      current = { code: codeOnly[1], parts: [] };
      if (codeOnly[2] && !/^\d+(?:\.\d+)?\s+[OE]\b/i.test(codeOnly[2])) current.parts.push(codeOnly[2]);
      continue;
    }

    if (current && /^\d+(?:\.\d+)?\s+[OE]\s+\d+\b/i.test(line)) {
      flush(line);
      continue;
    }

    if (current) {
      current.parts.push(line);
    }
  }

  flush();
  return courses;
}

function parseNumberedCodeSemesterRows(text = '') {
  if (!/\b(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV)\s+Semestre\b/i.test(text)) return [];
  const courses = [];
  let ciclo = null;
  let current = null;
  const lines = String(text)
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const semesterToNumber = value => {
    const roman = String(value || '').toUpperCase();
    const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14 };
    return map[roman] ? String(map[roman]) : null;
  };

  const cleanRowName = value => cleanCurriculumCourseLine(String(value || '')
    .replace(/\s+(Generales|Espec[ií]ficos|Especialidad)\s+Presencial\s+(Obligatorio|Electivo)\b.*$/i, '')
    .replace(/\s+\d+(?:\.\d+)?\s+\d{1,3}(?:\s+\d{1,3}){1,5}(?:\s+(?:---|\d+(?:\s*(?:al|y)\s*\d+)*))?$/i, '')
    .replace(/\s+(?:Cred|H\.?\s*T\.?|H\.?\s*P\.?|Total horas|Pre requisitos).*$/i, ''));

  const flush = evidencia => {
    if (!current || !ciclo) return;
    const nombreCurso = cleanRowName(current.parts.join(' '));
    if (isLikelyCourseName(nombreCurso)) {
      courses.push({ ciclo, nombreCurso, evidencia: evidencia || current.raw });
    }
    current = null;
  };

  for (const line of lines) {
    const semesterMatch = line.match(/^([IVX]{1,5})\s+(?:[-–]\s*)?Semestre\b/i);
    if (semesterMatch) {
      flush();
      ciclo = semesterToNumber(semesterMatch[1]);
      continue;
    }
    if (!ciclo || /^--\s*\d+\s+of\s+\d+/i.test(line) || /^(Subtotal|TOTAL|N[°ª]\s+C[oó]digo|C[ÓO]DIGO ASIGNATURA|PRIMER AÑO|SEGUNDO AÑO|TERCER AÑO|CUARTO AÑO|QUINTO AÑO|SEXTO AÑO|S[EÉ]TIMO AÑO)/i.test(line)) {
      continue;
    }

    const rowMatch = line.match(/^\d{1,2}\.\s+([A-Z]{1,5}\d{3,}[A-Z]?|[A-Z0-9]{5,})\s+(.+)$/i);
    if (rowMatch) {
      flush();
      current = { code: rowMatch[1], parts: [rowMatch[2]], raw: line };
      if (/\s+(Generales|Espec[ií]ficos|Especialidad)\s+Presencial\s+(Obligatorio|Electivo)\b/i.test(line) || /\s+\d+(?:\.\d+)?\s+\d{1,3}(?:\s+\d{1,3}){1,5}/.test(line)) {
        flush(line);
      }
      continue;
    }

    const unnumberedRowMatch = line.match(/^([A-Z0-9]*\d[A-Z0-9]{3,})\s+(.+)$/i);
    if (unnumberedRowMatch && /\s+(Generales|Espec[ií]ficos|Especialidad)\s+Presencial\s+(Obligatorio|Electivo)\b/i.test(line)) {
      flush();
      current = { code: unnumberedRowMatch[1], parts: [unnumberedRowMatch[2]], raw: line };
      flush(line);
      continue;
    }

    if (current) {
      current.parts.push(line);
      current.raw = `${current.raw} ${line}`;
      if (/\s+(Generales|Espec[ií]ficos|Especialidad)\s+Presencial\s+(Obligatorio|Electivo)\b/i.test(current.raw) || /\s+\d+(?:\.\d+)?\s+\d{1,3}(?:\s+\d{1,3}){1,5}/.test(current.raw)) {
        flush(current.raw);
      }
    }
  }

  flush();
  return courses;
}

function parseHtmlCurriculumCourses(html = '', url = '') {
  const parsers = [
    { parser: 'international_catalog_course_codes_v1', courses: parseInternationalCatalogCourses(html, url) },
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
    }
  }
  return pdfLinks.sort((a, b) => b.score - a.score)[0]?.url || null;
}

function parseCurriculumCourses(text = '', url = '', context = {}) {
  const domain = getDomain(url);
  const knownCourses = knownCurriculumByOfficialUrl(url, context);
  let courses = [];
  let parser = 'generic_html_malla_v1';

  if (/tec\.mx\/sites\/default\/files\/repositorio\/conocenos\/sacscoc\/catalogos\/profesional\/2017-eng\.pdf/i.test(url || '')) {
    return {
      parser: 'blocked_broad_institutional_catalog_v1',
      courses: [],
      status: 'requiere_revision',
    };
  }

  if (knownCourses.length && shouldPreferKnownCurriculum(url, context)) {
    return {
      parser: 'known_curriculum_map_v1',
      courses: knownCourses,
      status: 'parseado',
    };
  }

  courses = parseInlineOrdinalCycleCurriculum(text);
  if (courses.length >= 3) {
    parser = 'inline_ordinal_cycle_malla_v1';
  }

  if (courses.length < 3) {
    const catalogRows = parseInternationalCatalogCourses(text, url);
    if (catalogRows.length > courses.length) {
      courses = catalogRows;
      parser = 'international_catalog_course_codes_v1';
    }
  }

  if (courses.length < 3) {
    const planRows = parsePlainTextPlanRows(text);
    if (planRows.length > courses.length) {
      courses = planRows;
      parser = 'plain_text_plan_rows_v1';
    }
  }

  if (courses.length < 3) {
    const codeRows = parseMultilineCodeCreditRows(text);
    if (codeRows.length > courses.length) {
      courses = codeRows;
      parser = 'multiline_code_credit_rows_v1';
    }
  }

  if (courses.length < 3) {
    const numberedRows = parseNumberedCodeSemesterRows(text);
    if (numberedRows.length > courses.length) {
      courses = numberedRows;
      parser = 'numbered_code_semester_rows_v1';
    }
  }

  if (courses.length >= 3) {
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
      status: 'parseado',
    };
  }

  courses = parseLineBasedCurriculum(text);

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
  const curatedSources = getCuratedSourcesByBenchmarkType(
    career,
    programa.nombre_universidad,
    programa.tipo_benchmark
  );
  if (!curatedSources.length) return [];

  const registered = [];
  await setCandidatosDuplicado(programa.id_programa_benchmark);

  for (const source of curatedSources) {
    await upsertCuratedSource(programa.id_programa_benchmark, source);
    await upsertCuratedCandidate(programa.id_programa_benchmark, source);
    registered.push({
      url: source.url,
      title: source.titulo,
      tipo: source.tipoFuente,
      score: 100,
      detail: { curada: 100 },
      snippet: 'URL curada desde mapa base de benchmarking.',
    });
  }

  await updateProgramaUrlAndObservaciones(
    programa.id_programa_benchmark,
    curatedSources[0].url,
    `${curatedSources.length} fuente(s) curada(s) registradas. Requiere validacion humana.`
  );
  return registered;
}

async function discoverOfficialSources(idPrograma) {
  const programa = await getProgramaWithEquivalencia(idPrograma);
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
  await setCandidatosDuplicado(idPrograma);

  for (const item of scored.slice(0, 12)) {
    await upsertCandidate(idPrograma, item, domain);
  }

  const best = scored[0];
  if (!best) {
    await updateProgramaObservaciones(idPrograma, `No se encontro fuente exacta oficial para ${career} en ${domain}.`);
    return { ok: false, error: 'No se encontro fuente exacta oficial', candidates: [] };
  }

  await updateProgramaObservaciones(idPrograma, `${scored.slice(0, 12).length} candidatos encontrados. Requiere aprobacion de fuente.`);

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
  const existing = await findExistingBenchmarkSource(idPrograma, url);
  if (existing) return existing;

  const tipoFuente = inferSourceType(url, text);
  const insertId = await insertBenchmarkSource(idPrograma, tipoFuente, title, url, 'Registrada automaticamente al extraer evidencia.');
  if (insertId) return insertId;
  return await getCreatedBenchmarkSource(idPrograma, url);
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
  const idSnapshot = await insertSourceSnapshot({
    idBenchmarkSource,
    idPrograma,
    url,
    urlFinal,
    title,
    safeText,
    hash,
    parser,
    estadoParseo,
    cursosDetectados,
    observaciones,
  });
  return { idSnapshot, hash, text: safeText };
}

async function saveParseLog(args) {
  await insertParseLog(args);
}

async function replaceBenchmarkCourses(idPrograma, url, courses) {
  await dbReplaceBenchmarkCourses(idPrograma, url, courses);
}

async function persistExtraction({ idPrograma, url, urlFinal, title, text, rawHtml }) {
  let textForStorage = text;
  let titleForStorage = title;
  let urlFinalForStorage = urlFinal;
  const programa = await getProgramaWithEquivalencia(idPrograma);
  const parseContext = {
    career: programa?.nombre_oficial_sugerido || programa?.nombre_programa,
    programName: programa?.nombre_programa,
    university: programa?.nombre_universidad,
    title,
  };


  let parsed = null;
  if (rawHtml) {
    const htmlParsed = parseHtmlCurriculumCourses(rawHtml, urlFinalForStorage || url);
    if (htmlParsed) {
      parsed = { ...htmlParsed, status: 'parseado' };
    }
  }


  if (!parsed) {
    parsed = parseCurriculumCourses(textForStorage, urlFinalForStorage || url, parseContext);
  }


  if (!parsed.courses.length && rawHtml && url?.startsWith('http')) {
    const linkedPdfUrl = findCurriculumPdfUrl(rawHtml, urlFinalForStorage || url);
    if (linkedPdfUrl) {
      try {
        const pdf = await extractPageTextWithFetch(linkedPdfUrl);
        const pdfParsed = parseCurriculumCourses(pdf.text, pdf.finalUrl || linkedPdfUrl, {
          ...parseContext,
          title: pdf.title || titleForStorage,
        });
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

      }
    }
  }


  if (!parsed.courses.length && url?.startsWith('http')) {
    try {
      const fallback = await extractPageTextWithFetch(url);

      const fallbackHtmlParsed = fallback.rawHtml ? parseHtmlCurriculumCourses(fallback.rawHtml, fallback.finalUrl || url) : null;
      const fallbackParsed = fallbackHtmlParsed
        ? { ...fallbackHtmlParsed, parser: `${fallbackHtmlParsed.parser}_fetch_fallback`, status: 'parseado' }
        : parseCurriculumCourses(fallback.text, fallback.finalUrl || url, {
          ...parseContext,
          title: fallback.title || titleForStorage,
        });
      if (fallbackParsed.courses.length > parsed.courses.length) {
        textForStorage = fallback.text;
        titleForStorage = fallback.title || titleForStorage;
        urlFinalForStorage = fallback.finalUrl || urlFinalForStorage;
        parsed = fallbackParsed;
      }
    } catch {

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

  await updateBenchmarkSourceAfterExtraction(idBenchmarkSource, {
    estado: parsed.courses.length ? 'extraido' : 'pendiente_validacion',
    evidenciaResumen: parsed.courses.length
      ? `${parsed.courses.length} cursos detectados con ${parsed.parser}.`
      : `Texto capturado sin malla estructurada con ${parsed.parser}.`,
    snapshotHash: snapshot.hash,
  });

  await updateProgramaAfterExtraction(idPrograma, {
    textoOriginal: snapshot.text,
    url,
    observaciones: `${titleForStorage ? `Titulo: ${titleForStorage}. ` : ''}Parser: ${parsed.parser}. Cursos detectados: ${parsed.courses.length}.`,
  });

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
    await setScrapingStatus(idPrograma, 'error', 'URL inválida o ausente');
    return { ok: false, error: 'URL inválida o ausente' };
  }

  await setScrapingStatus(idPrograma, 'pendiente', 'Scraping iniciado...');

  const knownExtraction = await getPreferredKnownCurriculumExtraction(idPrograma, url);
  if (knownExtraction) {
    return await persistExtraction({
      idPrograma,
      url,
      urlFinal: knownExtraction.finalUrl,
      title: knownExtraction.title,
      text: knownExtraction.text,
      rawHtml: knownExtraction.rawHtml,
    });
  }

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
      await setScrapingStatus(idPrograma, 'error', `Error extracción PDF: ${msg}`);
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
      await setScrapingStatus(idPrograma, 'error', `Error extracción. Selenium: ${msg}. Fetch: ${fallbackMsg}`);
      return { ok: false, error: `Selenium: ${msg}. Fetch: ${fallbackMsg}` };
    }
  } finally {
    if (driver) {
      try { await driver.quit(); } catch {}
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }
}

async function scraperBatch(ids) {
  const results = [];
  for (const id of ids) {
    const row = await getProgramaUrl(id);
    if (!row) { results.push({ id, ok: false, error: 'Programa no encontrado' }); continue; }
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
}

export { scrapeProgramaUrl, scraperBatch, cargarTextoManual, discoverOfficialSources, parseCurriculumCourses, parseHtmlCurriculumCourses, extractPageTextWithFetch };
