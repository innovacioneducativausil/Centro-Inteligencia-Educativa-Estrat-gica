// server/services/normalizacionIAService.js
// Usa la misma API de HuggingFace configurada en el proyecto (HF_API_KEY).
// Transforma texto libre de programas universitarios en datos estructurables.
// Regla: si el texto fuente no contiene un dato, se marca como "no_identificado".

import db_empl from '../db_empl.js';
import { extractPageTextWithFetch, parseCurriculumCourses } from './scrapingService.js';

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
  const [rows] = await db_empl.query(
    `SELECT pb.id_programa_benchmark, pb.nombre_programa, pb.fuente_texto_original,
            pb.url_programa, ub.nombre_universidad
     FROM programa_benchmark pb
     JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
     WHERE pb.id_programa_benchmark = ?`,
    [idPrograma]
  );
  if (!rows.length) throw new Error('Programa no encontrado');

  const prog = rows[0];
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
  let cursosDeterministicos = parseCurriculumCourses(textoCurricular, prog.url_programa).courses || [];
  if (!cursosDeterministicos.length && prog.url_programa?.startsWith('http')) {
    try {
      const fetched = await extractPageTextWithFetch(prog.url_programa);
      const fetchedCourses = parseCurriculumCourses(fetched.text, fetched.finalUrl || prog.url_programa).courses || [];
      if (fetchedCourses.length) {
        textoCurricular = fetched.text;
        cursosDeterministicos = fetchedCourses;
      }
    } catch {
      // Si la segunda lectura falla, se continua con el texto ya capturado.
    }
  }
  const cursosMap = new Map();
  for (const curso of cursosIA) {
    if (!curso || curso === 'no_identificado') continue;
    const nombre = String(curso).trim();
    if (!nombre) continue;
    cursosMap.set(nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), {
      nombre,
      ciclo: null,
      evidencia: 'Extraído por normalización IA',
    });
  }
  for (const curso of cursosDeterministicos) {
    const nombre = String(curso.nombreCurso || '').trim();
    if (!nombre) continue;
    cursosMap.set(nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), {
      nombre,
      ciclo: curso.ciclo || null,
      evidencia: curso.evidencia || 'Extraído por parser de malla',
    });
  }
  const cursos = Array.from(cursosMap.values());
  const tecnologias   = Array.isArray(parsed.tecnologias) ? parsed.tecnologias : [];
  const habilidadesTec= Array.isArray(parsed.habilidades_tecnicas) ? parsed.habilidades_tecnicas : [];
  const habilidadesBla= Array.isArray(parsed.habilidades_blandas) ? parsed.habilidades_blandas : [];
  const areas         = Array.isArray(parsed.areas_tematicas) ? parsed.areas_tematicas : [];

  const conn = await db_empl.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DELETE FROM competencia_benchmark WHERE id_programa_benchmark=?', [idPrograma]);
    for (const comp of competencias) {
      if (!comp || comp === 'no_identificado') continue;
      await conn.query(
        `INSERT INTO competencia_benchmark (id_programa_benchmark, nombre_competencia, tipo_competencia, fuente_url)
         VALUES (?, ?, 'tecnica', ?)`,
        [idPrograma, String(comp).substring(0, 299), prog.url_programa]
      );
    }
    for (const hab of habilidadesTec) {
      if (!hab || hab === 'no_identificado') continue;
      await conn.query(
        `INSERT INTO competencia_benchmark (id_programa_benchmark, nombre_competencia, tipo_competencia, fuente_url)
         VALUES (?, ?, 'tecnica', ?)`,
        [idPrograma, String(hab).substring(0, 299), prog.url_programa]
      );
    }
    for (const hab of habilidadesBla) {
      if (!hab || hab === 'no_identificado') continue;
      await conn.query(
        `INSERT INTO competencia_benchmark (id_programa_benchmark, nombre_competencia, tipo_competencia, fuente_url)
         VALUES (?, ?, 'blanda', ?)`,
        [idPrograma, String(hab).substring(0, 299), prog.url_programa]
      );
    }

    if (cursos.length) {
      await conn.query('DELETE FROM curso_benchmark WHERE id_programa_benchmark=?', [idPrograma]);
      if (textoCurricular !== prog.fuente_texto_original) {
        await conn.query(
          `UPDATE programa_benchmark
           SET fuente_texto_original=?, fecha_captura=NOW()
           WHERE id_programa_benchmark=?`,
          [textoCurricular.substring(0, 120000), idPrograma]
        );
      }
    }
    for (const curso of cursos) {
      await conn.query(
        `INSERT INTO curso_benchmark
         (id_programa_benchmark, nombre_curso, ciclo, area_formacion, descripcion_curso, competencias_detectadas_json, tecnologias_detectadas_json, fuente_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idPrograma,
          String(curso.nombre).substring(0, 299),
          curso.ciclo,
          areas[0] ?? null,
          curso.evidencia,
          JSON.stringify(competencias.filter(c => c !== 'no_identificado')),
          JSON.stringify(tecnologias.filter(t => t !== 'no_identificado')),
          prog.url_programa,
        ]
      );
    }

    const [[conteo]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM curso_benchmark WHERE id_programa_benchmark=?) AS cursos,
         (SELECT COUNT(*) FROM competencia_benchmark WHERE id_programa_benchmark=?) AS competencias`,
      [idPrograma, idPrograma]
    );
    const tieneEvidenciaEstructurada = Number(conteo?.cursos || 0) > 0 || Number(conteo?.competencias || 0) > 0;

    await conn.query(
      `UPDATE programa_benchmark
       SET perfil_egreso_texto = ?,
           estado_extraccion = ?,
           observaciones = ?,
           updated_at = NOW()
       WHERE id_programa_benchmark = ?`,
      [
        parsed.perfil_egreso_resumen !== 'no_identificado' ? parsed.perfil_egreso_resumen : prog.fuente_texto_original?.substring(0, 2000),
        tieneEvidenciaEstructurada ? 'verificado' : 'procesado',
        tieneEvidenciaEstructurada
          ? `Normalización completada. Cursos estructurados: ${Number(conteo?.cursos || 0)}. Competencias estructuradas: ${Number(conteo?.competencias || 0)}.`
          : 'Normalización sin cursos ni competencias estructuradas. Revisar fuente o pegar malla manualmente.',
        idPrograma,
      ]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    competencias: competencias.length,
    cursos: cursos.length,
    tecnologias: tecnologias.length,
    resumenPerfil: parsed.perfil_egreso_resumen,
    brechasPotenciales: parsed.brechas_potenciales_vs_mercado ?? [],
  };
}

export { normalizarPrograma };
