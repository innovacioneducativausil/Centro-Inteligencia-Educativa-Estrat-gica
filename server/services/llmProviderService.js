import logger from '../logger.js';

const HF_URL     = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODEL   = 'Qwen/Qwen2.5-7B-Instruct:featherless-ai';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callProvider(url, headers, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(`${url} error ${r.status}: ${txt.substring(0, 200)}`);
    err.status = r.status;
    err.retryAfterMs = Number(r.headers.get('retry-after')) * 1000 || null;
    throw err;
  }
  const json = await r.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

const GROQ_MAX_RETRIES = 3;

/**
 * Reintenta hasta GROQ_MAX_RETRIES veces ante 429 (límite de tokens/minuto),
 * usando el header Retry-After de Groq cuando viene, o un backoff creciente
 * (8s, 16s, 24s) si no. Necesario porque cuando HuggingFace se queda sin
 * cuota, TODA la corrida cae en Groq y su tier gratuito (6000 TPM) se agota
 * rápido con muchos cursos seguidos — un solo reintento no alcanzaba.
 */
async function callGroqWithBackoff(systemPrompt, userPrompt, maxTokens) {
  const groqKey = process.env.GROQ_API_KEY;
  const body = {
    model: GROQ_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    max_tokens: maxTokens,
    temperature: 0.2,
  };
  const headers = { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' };

  for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
    try {
      return await callProvider(GROQ_URL, headers, body);
    } catch (err) {
      if (err.status !== 429 || attempt === GROQ_MAX_RETRIES) throw err;
      await sleep(err.retryAfterMs || attempt * 8000);
    }
  }
}

// Orden de intento: primero la key dedicada de este motor (HF_API_KEY_ANALISIS_CURSO
// — se prueba siempre primero, así que en cuanto se le resetee la cuota mensual
// vuelve a usarse sola, sin tocar código). Si esa está agotada (402), se prueban
// las demás keys de HF de la cuenta (compartidas con otras features) como respaldo
// temporal antes de caer a Groq.
const HF_KEY_ENV_VARS = [
  'HF_API_KEY_ANALISIS_CURSO',
  'HF_API_KEY_METRICS',
  'HF_API_KEY_ESCENARIOS',
  'HF_API_KEY_MAPPING',
  'HF_API_KEY_IMPORT3',
  'HF_API_KEY_IMPORT2',
  'HF_API_KEY_IMPORT',
  'HF_API_KEY',
];

/**
 * Llama al proveedor de IA compartido por los motores curriculares (Visión
 * 360 y Plan de acción). Prueba las keys de HuggingFace en orden (ver
 * HF_KEY_ENV_VARS), Groq como último respaldo. `context` (opcional) se usa
 * para loggear qué motor/curso está llamando.
 *
 * `providerState` es un objeto mutable que el LLAMADOR crea UNA VEZ por
 * corrida completa (ej. por carrera/malla) y reutiliza en cada llamada:
 * cada key de HF que responda 402 (cuota agotada) se marca ahí, así las
 * siguientes llamadas de esa misma corrida saltan directo a la próxima key
 * en vez de esperar un timeout que ya sabemos que va a fallar.
 */
async function callLLM(systemPrompt, userPrompt, { providerState = {}, maxTokens = 700, context = 'LLM' } = {}) {
  const groqKey = process.env.GROQ_API_KEY;

  for (const envVar of HF_KEY_ENV_VARS) {
    const hfKey = process.env[envVar];
    if (!hfKey || hfKey === 'hf_TU_TOKEN_AQUI' || providerState[envVar] === 'exhausted') continue;

    try {
      return await callProvider(
        HF_URL,
        { Authorization: `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
        {
          model: HF_MODEL,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: maxTokens,
          temperature: 0.2,
        }
      );
    } catch (err) {
      if (err.status === 402) {
        providerState[envVar] = 'exhausted';
        logger.warn(`[${context}] HuggingFace (${envVar}) sin cuota, probando siguiente key`, { context });
      } else {
        logger.warn(`[${context}] HuggingFace (${envVar}) falló: ${err.message}`, { context });
        break; // error distinto a cuota (red, modelo, etc.) — no tiene sentido rotar keys, ir directo a Groq
      }
    }
  }

  if (groqKey) return callGroqWithBackoff(systemPrompt, userPrompt, maxTokens);

  throw new Error('No hay proveedor de IA configurado (HF_API_KEY / GROQ_API_KEY)');
}

function safeParseJson(raw) {
  if (!raw) return null;
  const match = String(raw).trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

const PLACEHOLDER_ECHO = /maximo \d|máximo \d|solo si hay evidencia|frases cortas|no gen[eé]ricas|deja el array vac[ií]o/i;

/** Descarta texto que es eco literal de las instrucciones del prompt en vez de contenido real generado. */
function isRealText(value) {
  return typeof value === 'string' && value.trim().length > 0 && !PLACEHOLDER_ECHO.test(value);
}

export { callLLM, safeParseJson, isRealText, sleep, HF_MODEL, GROQ_MODEL };
