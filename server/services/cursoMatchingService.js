import db from '../db_empl.js';
import { curricularPrisma } from '../prismaClient.js';

const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODEL = 'Qwen/Qwen2.5-7B-Instruct:featherless-ai';
const MATCH_BATCH_SIZE = 60;

const SYSTEM_PROMPT = `Eres un experto en analisis curricular universitario comparando mallas de distintas universidades y distintos idiomas.
Tu tarea es identificar pares de cursos EQUIVALENTES tematicamente entre dos listas (mismo contenido academico central, aunque el nombre sea distinto o este en otro idioma).
No fuerces coincidencias: si un curso no tiene equivalente claro, simplemente no lo incluyas en la respuesta.
Devuelve UNICAMENTE un array JSON valido, sin texto adicional, sin markdown.`;

function buildMatchPrompt(cursosUsil, cursosExternos, universidad) {
  const usilList = cursosUsil.map((c, i) => `${i + 1}. ${c.nombre_curso}`).join('\n');
  const extList = cursosExternos.map((c, i) => `${i + 1}. ${c.nombre_curso}`).join('\n');
  return `CURSOS DE LA MALLA USIL (Peru, en espanol), numerados:
${usilList}

CURSOS DE LA MALLA DE ${universidad}, numerados:
${extList}

Para cada curso de ${universidad} que tenga un equivalente tematico claro en la lista de USIL, devuelve el par con un puntaje de confianza (0-100, donde 100 es equivalencia casi exacta y 60 es equivalencia parcial/tematica).

Devuelve SOLO el array JSON, sin texto adicional:
[{"usil_idx": <numero de la lista USIL>, "externo_idx": <numero de la lista de ${universidad}>, "confianza": <0-100>}]`;
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
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`HF API error ${r.status}: ${txt.substring(0, 200)}`);
      }
      return await r.json();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) await new Promise(res => setTimeout(res, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

function safeParseJsonArray(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getCursosUsilVigentes(idCarreraUsil) {
  const malla = await curricularPrisma.malla_version.findFirst({
    where: { id_carrera: idCarreraUsil, es_vigente: true },
    include: { curso: { orderBy: [{ numero_ciclo: 'asc' }, { nro_orden: 'asc' }] } },
  });
  if (!malla) return [];
  return malla.curso.map(c => ({ id_curso: c.id_curso, nombre_curso: c.nombre_curso }));
}

async function getCursosExternos(idProgramaBenchmark) {
  const [rows] = await db.query(
    `SELECT id_curso_benchmark, nombre_curso FROM curso_benchmark WHERE id_programa_benchmark = ? ORDER BY nombre_curso`,
    [idProgramaBenchmark]
  );
  return rows;
}

async function getProgramaInfo(idProgramaBenchmark) {
  const [rows] = await db.query(
    `SELECT pb.id_programa_benchmark, pb.carrera_equivalente_id, ub.nombre_universidad
     FROM programa_benchmark pb
     JOIN universidad_benchmark ub ON ub.id_universidad_benchmark = pb.id_universidad_benchmark
     WHERE pb.id_programa_benchmark = ?`,
    [idProgramaBenchmark]
  );
  return rows[0] || null;
}

async function matchCursosInternacionales(idProgramaBenchmark) {
  const programa = await getProgramaInfo(idProgramaBenchmark);
  if (!programa) throw new Error('Programa no encontrado');
  if (!programa.carrera_equivalente_id) {
    throw new Error('El programa no tiene carrera USIL equivalente asignada');
  }

  const [cursosUsil, cursosExternos] = await Promise.all([
    getCursosUsilVigentes(programa.carrera_equivalente_id),
    getCursosExternos(idProgramaBenchmark),
  ]);

  if (!cursosUsil.length) throw new Error('No hay malla vigente cargada para esta carrera en USIL');
  if (!cursosExternos.length) throw new Error('No hay cursos extraidos para este programa. Ejecuta el scraping primero.');

  // Reset previous matches for this program before recomputing.
  await db.query(
    `UPDATE curso_benchmark SET id_curso_usil_match = NULL, match_confianza = NULL, match_metodo = NULL, match_calculado_en = NULL
     WHERE id_programa_benchmark = ?`,
    [idProgramaBenchmark]
  );

  let matched = 0;
  for (let batchStart = 0; batchStart < cursosExternos.length; batchStart += MATCH_BATCH_SIZE) {
    const batch = cursosExternos.slice(batchStart, batchStart + MATCH_BATCH_SIZE);

    const payload = {
      model: HF_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildMatchPrompt(cursosUsil, batch, programa.nombre_universidad) },
      ],
      max_tokens: 3000,
      temperature: 0.1,
    };

    const hfResp = await fetchWithRetry(payload);
    const rawContent = hfResp?.choices?.[0]?.message?.content ?? '';
    const pares = safeParseJsonArray(rawContent);

    for (const par of pares) {
      const usilIdx = Number(par.usil_idx) - 1;
      const extIdx = Number(par.externo_idx) - 1;
      const confianza = Math.max(0, Math.min(100, Math.round(Number(par.confianza) || 0)));
      const usil = cursosUsil[usilIdx];
      const ext = batch[extIdx];
      if (!usil || !ext || confianza < 50) continue;

      await db.query(
        `UPDATE curso_benchmark
         SET id_curso_usil_match = ?, match_confianza = ?, match_metodo = 'ia_semantica', match_calculado_en = NOW()
         WHERE id_curso_benchmark = ?`,
        [usil.id_curso, confianza, ext.id_curso_benchmark]
      );
      matched++;
    }
  }

  return {
    totalCursosUsil: cursosUsil.length,
    totalCursosExternos: cursosExternos.length,
    coincidenciasEncontradas: matched,
  };
}

export { matchCursosInternacionales };
