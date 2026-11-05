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

/** 'groq' por defecto si existe GROQ_API_KEY; 'hf' solo si se pide con LLM_PRIMARY_PROVIDER=hf. */
function primaryProvider() {
  const forced = process.env.LLM_PRIMARY_PROVIDER?.trim().toLowerCase();
  if (forced === 'hf' || forced === 'huggingface') return 'hf';
  if (forced === 'groq') return 'groq';
  return process.env.GROQ_API_KEY ? 'groq' : 'hf';
}

/**
 * Reintenta hasta GROQ_MAX_RETRIES veces ante 429 (límite de tokens/minuto),
 * usando el header Retry-After de Groq cuando viene, o un backoff creciente
 * (8s, 16s, 24s) si no. Necesario porque cuando HuggingFace se queda sin
 * cuota, TODA la corrida cae en Groq y su tier gratuito (6000 TPM) se agota
 * rápido con muchos cursos seguidos — un solo reintento no alcanzaba.
 */
async function callGroqWithBackoff(systemPrompt, userPrompt, maxTokens) {
  const groqKey = process.env.GROQ_API_KEY;
  // gpt-oss-120b es un modelo que razona: los tokens de razonamiento cuentan contra
  // max_tokens. Con max_tokens=700 y el esfuerzo por defecto se gastaba todo
  // razonando y el contenido volvia VACIO (finish_reason=length), asi ~90% de los
  // cursos fallaban. Esfuerzo bajo + margen para la respuesta lo evitan
  // (GROQ_REASONING_EFFORT permite cambiarlo sin tocar codigo).
  const body = {
    model: GROQ_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    max_tokens: Math.max(maxTokens, 1200),
    reasoning_effort: process.env.GROQ_REASONING_EFFORT?.trim() || 'low',
    temperature: 0.2,
  };
  const headers = { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' };

  for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
    try {
      return await callProvider(GROQ_URL, headers, body);
    } catch (err) {
      // Limite DIARIO de tokens (TPD): reintentar en segundos no sirve. Se propaga el
      // error (con retryAfterMs) para que quien llama decida esperar mas tiempo.
      const limiteDiario = /per day|\(TPD\)/i.test(err.message || '');
      if (err.status !== 429 || attempt === GROQ_MAX_RETRIES || limiteDiario) throw err;
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

  // Groq es el proveedor principal cuando hay GROQ_API_KEY: las keys de HF no
  // tienen credito y cada corrida perdia tiempo probando keys muertas.
  // LLM_PRIMARY_PROVIDER=hf devuelve el orden anterior (HF primero, Groq de respaldo).
  if (primaryProvider() === 'groq' && groqKey) {
    return callGroqWithBackoff(systemPrompt, userPrompt, maxTokens);
  }

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
      if (err.status === 402 || err.status === 401) {
        // 402 = cuota/credito agotado, 401 = key invalida o revocada: en ambos
        // casos esa key no sirve, se marca y se prueba la siguiente.
        providerState[envVar] = 'exhausted';
        logger.warn(`[${context}] HuggingFace (${envVar}) ${err.status === 401 ? 'key invalida' : 'sin cuota'}, probando siguiente key`, { context });
      } else {
        logger.warn(`[${context}] HuggingFace (${envVar}) falló: ${err.message}`, { context });
        break; // error distinto a cuota (red, modelo, etc.) — no tiene sentido rotar keys, ir directo a Groq
      }
    }
  }

  if (groqKey) return callGroqWithBackoff(systemPrompt, userPrompt, maxTokens);

  throw new Error('No hay proveedor de IA configurado (HF_API_KEY / GROQ_API_KEY)');
}

const PROBE_STATUS = { 200: 'ok', 401: 'key_invalida', 402: 'sin_credito', 429: 'limite_de_uso' };

async function probarKey(url, key, model) {
  if (!key) return 'no_definida';
  try {
    await callProvider(
      url,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      { model, messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 5 }
    );
    return 'ok';
  } catch (err) {
    return PROBE_STATUS[err.status] ?? (err.status ? `error_${err.status}` : 'sin_conexion');
  }
}

/**
 * Diagnostico: una llamada minima (5 tokens) a cada key de HuggingFace y a Groq.
 * Devuelve solo el estado de cada variable, nunca la key. Sirve para saber, sin
 * correr un analisis completo, que proveedor va a usar el motor y si responde.
 */
async function probarProveedores() {
  const hf = await Promise.all(HF_KEY_ENV_VARS.map(async variable => ({
    variable,
    estado: await probarKey(HF_URL, process.env[variable], HF_MODEL),
  })));
  const groq = await probarKey(GROQ_URL, process.env.GROQ_API_KEY, GROQ_MODEL);
  const groqPrimero = primaryProvider() === 'groq';
  const hfOk = hf.some(k => k.estado === 'ok');
  const usara = groqPrimero ? (groq === 'ok' ? 'groq' : (hfOk ? 'huggingface (respaldo)' : 'ninguno'))
    : hfOk ? 'huggingface' : (groq === 'ok' ? 'groq (respaldo)' : 'ninguno');
  return { proveedor_principal: groqPrimero ? 'groq' : 'huggingface', huggingface: hf, groq, proveedor_que_usara_el_motor: usara };
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

export { callLLM, probarProveedores, safeParseJson, isRealText, sleep, HF_MODEL, GROQ_MODEL };
