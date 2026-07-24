


import { getProgramaForNormalizacion, getCursosBenchmark, executeNormalizationTransaction } from '../repositories/empleabilidad/normalizacionRepository.js';
import { extractPageTextWithFetch, parseCurriculumCourses, parseHtmlCurriculumCourses } from './scrapingService.js';

const HF_URL   = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODEL = 'Qwen/Qwen2.5-7B-Instruct:together';

const SYSTEM_PROMPT = `Eres un experto en análisis curricular universitario.
Tu tarea es extraer información estructurada de textos públicos de páginas universitarias.
REGLA CRÍTICA: Solo extrae lo que está explícitamente en el texto fuente.
Si un dato no aparece en el texto, devuelve el valor "no_identificado" para campos string o [] para arrays.
NUNCA inventes datos, cursos, competencias ni tecnologías.
Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin markdown.`;

function buildPrompt(textoFuente, nombrePrograma) {
  return `Analiza el siguiente texto extraído de la página universitaria del programa "${nombrePrograma}".

TEXTO FUENTE (primeros 6000 caracteres):
${textoFuente.substring(0, 6000)}

Extrae y devuelve SOLO el siguiente JSON (sin markdown, sin comentarios):
{
  "competencias": ["lista de competencias declaradas, solo si están en el texto"],
  "cursos_equivalentes": ["nombres de cursos o materias mencionados"],
  "areas_tematicas": ["áreas de conocimiento identificadas"],
  "habilidades_tecnicas": ["habilidades técnicas explícitas"],
  "habilidades_blandas": ["habilidades blandas explícitas"],
  "tecnologias": ["tecnologías, herramientas o software mencionados"],
  "nivel_profundidad": "basico|intermedio|avanzado|no_identificado",
  "duracion_identificada": "texto de duración si se menciona, o no_identificado",
  "modalidad_identificada": "presencial|virtual|hibrido|no_identificado",
  "perfil_egreso_resumen": "resumen de máximo 3 oraciones del perfil de egreso, o no_identificado",
  "brechas_potenciales_vs_mercado": ["posibles gaps que se observan al leer el texto"]
}`;
}

async function fetchWithRetry(body, maxRetries = 2) {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey || apiKey === 'hf_TU_TOKEN_AQUI') {
    throw new Error('HF_API_KEY no configurado en .env');
  }
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await fetch(HF_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`HF API error ${r.status}: ${txt.substring(0, 200)}`);
      }
      return await r.json();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

function safeParseJson(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function normalizarPrograma(idPrograma) {
  const prog = await getProgramaForNormalizacion(idPrograma);
  if (!prog) throw new Error('Programa no encontrado');
  if (!prog.fuente_texto_original || prog.fuente_texto_original.trim().length < 30) {
    throw new Error('No hay texto fuente para normalizar. Ejecuta el scraping primero.');
  }

  const payload = {
    model: HF_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(prog.fuente_texto_original, prog.nombre_programa) },
    ],
    max_tokens: 1200,
    temperature: 0.1,
  };

  const hfResp = await fetchWithRetry(payload);
  const rawContent = hfResp?.choices?.[0]?.message?.content ?? '';
  const parsed = safeParseJson(rawContent);

  if (!parsed) {
    throw new Error(`No se pudo parsear la respuesta de IA. Respuesta cruda: ${rawContent.substring(0, 300)}`);
  }

  const competencias  = Array.isArray(parsed.competencias) ? parsed.competencias : [];
  const cursosIA      = Array.isArray(parsed.cursos_equivalentes) ? parsed.cursos_equivalentes : [];
  let textoCurricular = prog.fuente_texto_original;
  const parseContext = {
    career: prog.nombre_programa,
    programName: prog.nombre_programa,
  };
  let parsedCurriculum = parseCurriculumCourses(textoCurricular, prog.url_programa, parseContext);
  let cursosDeterministicos = parsedCurriculum.courses || [];
  if (prog.url_programa?.startsWith('http')) {
    try {
      const fetched = await extractPageTextWithFetch(prog.url_programa);
      let fetchedCourses = [];
      let shouldUseFetched = false;
      if (fetched.rawHtml) {
        const htmlParsed = parseHtmlCurriculumCourses(fetched.rawHtml);
        if (htmlParsed?.courses?.length) {
          fetchedCourses = htmlParsed.courses;
          shouldUseFetched = !cursosDeterministicos.length
            || parsedCurriculum.parser === 'generic_html_malla_v1'
            || fetchedCourses.length >= Math.floor(cursosDeterministicos.length * 0.7);
        }
      }
      if (!fetchedCourses.length) {
        const fetchedParsed = parseCurriculumCourses(fetched.text, fetched.finalUrl || prog.url_programa, {
          ...parseContext,
          title: fetched.title,
        });
        fetchedCourses = fetchedParsed.courses || [];
        shouldUseFetched = !cursosDeterministicos.length || fetchedCourses.length > cursosDeterministicos.length;
      }
      if (fetchedCourses.length && shouldUseFetched) {
        textoCurricular = fetched.text;
        cursosDeterministicos = fetchedCourses;
      }
    } catch {

    }
  }
  if (!cursosDeterministicos.length) {
    const cursosExtraidos = await getCursosBenchmark(idPrograma);
    if (cursosExtraidos.length) {
      cursosDeterministicos = cursosExtraidos.map(curso => ({
        nombreCurso: curso.nombre_curso,
        ciclo: curso.ciclo || null,
        evidencia: curso.descripcion_curso || `Preservado desde extraccion previa: ${curso.fuente_url || prog.url_programa}`,
      }));
    }
  }
  const cursosMap = new Map();
  if (cursosDeterministicos.length) {
    for (const curso of cursosDeterministicos) {
      const nombre = String(curso.nombreCurso || '').trim();
      if (!nombre) continue;
      cursosMap.set(nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), {
        nombre,
        ciclo: curso.ciclo || null,
        evidencia: curso.evidencia || 'Extraido por parser de malla',
        origen: 'parser',
      });
    }
  } else {
    for (const curso of cursosIA) {
      if (!curso || curso === 'no_identificado') continue;
      const nombre = String(curso).trim();
      if (!nombre) continue;
      cursosMap.set(nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), {
        nombre,
        ciclo: null,
        evidencia: 'Sugerido por normalizacion IA; requiere validacion manual',
        origen: 'ia',
      });
    }
  }
  const cursos = Array.from(cursosMap.values());
  const tecnologias   = Array.isArray(parsed.tecnologias) ? parsed.tecnologias : [];
  const habilidadesTec= Array.isArray(parsed.habilidades_tecnicas) ? parsed.habilidades_tecnicas : [];
  const habilidadesBla= Array.isArray(parsed.habilidades_blandas) ? parsed.habilidades_blandas : [];
  const areas         = Array.isArray(parsed.areas_tematicas) ? parsed.areas_tematicas : [];

  await executeNormalizationTransaction(idPrograma, {
    competencias,
    habilidadesTec,
    habilidadesBla,
    cursos,
    textoCurricular,
    prog,
    parsedResult: parsed,
  });

  return {
    competencias: competencias.length,
    cursos: cursos.length,
    tecnologias: tecnologias.length,
    resumenPerfil: parsed.perfil_egreso_resumen,
    brechasPotenciales: parsed.brechas_potenciales_vs_mercado ?? [],
  };
}

export { normalizarPrograma };
