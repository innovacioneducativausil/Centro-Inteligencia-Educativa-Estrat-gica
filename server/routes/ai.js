import { serverError } from '../middleware/errorHandler.js';


import { Router } from 'express';
import { adminOrAnalyst } from '../middleware/roles.js';
import { isSafePublicHttpUrl } from '../utils/security.js';

const router = Router();


const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'UND_ERR_SOCKET', 'ENOTFOUND']);

async function fetchWithRetry(url, options, maxRetries = 3, baseDelayMs = 800) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const signal = AbortSignal.timeout(20000);
      return await fetch(url, { ...options, signal });
    } catch (err) {
      lastErr = err;
      const code = err.cause?.code || err.code || '';
      if (!RETRYABLE_CODES.has(code) || attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * attempt));
    }
  }
  throw lastErr;
}

const HF_MODEL_HEAVY  = 'Qwen/Qwen2.5-7B-Instruct:together';
const HF_MODEL_LIGHT  = 'Qwen/Qwen2.5-7B-Instruct:together';
const HF_URL          = 'https://router.huggingface.co/v1/chat/completions';

const RADAR_SYSTEM = `Eres un analista experto del RADAR Observatorio de Carreras, sistema de inteligencia prospectiva para educaciÃ³n superior universitaria (metodologÃ­a WEF Foresight / Horizon Scanning).
Tu rol: apoyar a directores acadÃ©micos y diseÃ±adores curriculares a anticipar cambios que afectan las carreras universitarias y el mercado laboral del futuro.
MetodologÃ­a que aplicas:
- SEÃ‘AL DE CAMBIO (weak signal): indicio temprano, parcial e incipiente, aÃºn no confirmado como tendencia. Evidencia fragmentaria de posibles disrupciones futuras.
- TENDENCIA: patrÃ³n sostenido de cambio confirmado por mÃºltiples fuentes en el tiempo, con direcciÃ³n e impulso identificables. Deriva de seÃ±ales que han ganado consistencia.
- ESCENARIO: simulaciÃ³n de futuro posible y plausible (no predicciÃ³n). Articula tendencias, seÃ±ales y wildcards en narrativa coherente para stress-testing estratÃ©gico.
Responde siempre en espaÃ±ol, con lenguaje ejecutivo, preciso y orientado a la acciÃ³n institucional universitaria.`;


router.post('/ai/generate', async (req, res) => {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey || apiKey === 'hf_TU_TOKEN_AQUI') {
    return res.status(503).json ({ error: 'HF_API_KEY no configurado en .env del servidor.' });
  }

  const { prompt, maxTokens = 600 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Falta el campo "prompt".' });
  if (typeof prompt !== 'string' || prompt.length > 20000) {
    return res.status(400).json({ error: 'El prompt debe ser texto y no superar 20000 caracteres.' });
  }
  const safeMaxTokens = Math.min(2000, Math.max(50, Number.parseInt(maxTokens, 10) || 600));

  try {
    const hfRes = await fetchWithRetry(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL_HEAVY,
        messages: [
          { role: 'system', content: RADAR_SYSTEM },
          { role: 'user',   content: prompt },
        ],
        max_tokens: safeMaxTokens,
        temperature: 0.5,
      }),
    });

    if (!hfRes.ok) {
      const err = await hfRes.json().catch(() => ({}));
      const msg = err?.error?.message || err?.error || `HuggingFace error ${hfRes.status}`;
      return res.status(hfRes.status).json({ error: String(msg) });
    }

    const data  = await hfRes.json();
    const text  = data.choices?.[0]?.message?.content?.trim() || '';
    res.json({ text });

  } catch (err) {
    console.error('[POST /ai/generate]', err);
    serverError(res, err);
  }
});


router.post('/ai/escenarios', async (req, res) => {
  const apiKey = process.env.HF_API_KEY_ESCENARIOS || process.env.HF_API_KEY;
  if (!apiKey || apiKey === 'hf_TU_TOKEN_AQUI') {
    return res.status(503).json({ error: 'HF_API_KEY_ESCENARIOS no configurado en .env del servidor.' });
  }

  const { prompt, maxTokens = 1200 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Falta el campo “prompt”.' });
  if (typeof prompt !== 'string' || prompt.length > 20000) {
    return res.status(400).json({ error: 'El prompt debe ser texto y no superar 20000 caracteres.' });
  }
  const safeMaxTokens = Math.min(2000, Math.max(50, Number.parseInt(maxTokens, 10) || 1200));

  try {
    const hfRes = await fetchWithRetry(HF_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: HF_MODEL_HEAVY,
        messages: [
          { role: 'system', content: RADAR_SYSTEM },
          { role: 'user',   content: prompt },
        ],
        max_tokens: safeMaxTokens,
        temperature: 0.5,
      }),
    });

    if (!hfRes.ok) {
      const err = await hfRes.json().catch(() => ({}));
      const msg = err?.error?.message || err?.error || `HuggingFace error ${hfRes.status}`;
      return res.status(hfRes.status).json({ error: String(msg) });
    }

    const data = await hfRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    res.json({ text });

  } catch (err) {
    console.error('[POST /ai/escenarios]', err);
    serverError(res, err);
  }
});


router.post('/ai/metrics', async (req, res) => {
  const apiKey = process.env.HF_API_KEY_METRICS || process.env.HF_API_KEY;
  if (!apiKey || apiKey === 'hf_TU_TOKEN_AQUI') {
    return res.status(503).json({ error: 'HF_API_KEY no configurado en .env del servidor.' });
  }

  const { prompt, maxTokens = 120 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Falta el campo "prompt".' });
  if (typeof prompt !== 'string' || prompt.length > 12000) {
    return res.status(400).json({ error: 'El prompt debe ser texto y no superar 12000 caracteres.' });
  }
  const safeMaxTokens = Math.min(1000, Math.max(50, Number.parseInt(maxTokens, 10) || 120));

  try {
    const hfRes = await fetchWithRetry(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL_LIGHT,
        messages: [
          { role: 'system', content: RADAR_SYSTEM },
          { role: 'user',   content: prompt },
        ],
        max_tokens: safeMaxTokens,
        temperature: 0.2,
      }),
    });

    if (!hfRes.ok) {
      const err = await hfRes.json().catch(() => ({}));
      const msg = err?.error?.message || err?.error || `HuggingFace error ${hfRes.status}`;
      return res.status(hfRes.status).json({ error: String(msg) });
    }

    const data = await hfRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    res.json({ text });

  } catch (err) {
    console.error('[POST /ai/metrics]', err);
    serverError(res, err);
  }
});


router.post('/ai/importar', async (req, res) => {
  const hfProviders = [
    { name: 'HF_API_KEY_IMPORT2', key: process.env.HF_API_KEY_IMPORT2 },
    { name: 'HF_API_KEY_IMPORT',  key: process.env.HF_API_KEY_IMPORT },
    { name: 'HF_API_KEY_IMPORT3', key: process.env.HF_API_KEY_IMPORT3 },
  ].filter(p => Boolean(p.key));
  const hfKey1  = process.env.HF_API_KEY_IMPORT2;
  const hfKey2  = process.env.HF_API_KEY_IMPORT;
  const hfKey3  = process.env.HF_API_KEY_IMPORT3;
  const groqKey = process.env.GROQ_API_KEY;
  if (hfProviders.length === 0 && !groqKey) {
    return res.status(503).json({ error: 'No hay API key configurada (HF_API_KEY_IMPORT, HF_API_KEY_IMPORT2, HF_API_KEY_IMPORT3 ni GROQ_API_KEY).' });
  }

  const { prompt, maxTokens = 3000 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Falta el campo "prompt".' });
  if (typeof prompt !== 'string' || prompt.length > 50000) {
    return res.status(400).json({ error: 'El prompt debe ser texto y no superar 50000 caracteres.' });
  }
  const safeMaxTokens = Math.min(4000, Math.max(200, Number.parseInt(maxTokens, 10) || 3000));

  const callProvider = async (url, headers, body) => {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  };

  const hfBody = (key) => ({
    model: HF_MODEL_HEAVY,
    messages: [{ role: 'system', content: RADAR_SYSTEM }, { role: 'user', content: prompt }],
    max_tokens: safeMaxTokens,
    temperature: 0.3,
  });


  if (hfKey1) {
    try {
      const text = await callProvider(HF_URL, { Authorization: `Bearer ${hfKey1}`, 'Content-Type': 'application/json' }, hfBody());
      console.log('[importar] âœ… HF_API_KEY_IMPORT2 OK');
      return res.json({ text });
    } catch (e) {
      console.warn('[importar] âš ï¸ HF_API_KEY_IMPORT2 fallÃ³:', e.message);
    }
  }


  if (hfKey2) {
    try {
      const text = await callProvider(HF_URL, { Authorization: `Bearer ${hfKey2}`, 'Content-Type': 'application/json' }, hfBody());
      console.log('[importar] âœ… HF_API_KEY_IMPORT OK');
      return res.json({ text });
    } catch (e) {
      console.warn('[importar] âš ï¸ HF_API_KEY_IMPORT fallÃ³:', e.message);
    }
  }


  if (hfKey3) {
    try {
      const text = await callProvider(HF_URL, { Authorization: `Bearer ${hfKey3}`, 'Content-Type': 'application/json' }, hfBody());
      console.log('[importar] OK HF_API_KEY_IMPORT3');
      return res.json({ text });
    } catch (e) {
      console.warn('[importar] HF_API_KEY_IMPORT3 fallo:', e.message);
    }
  }


  if (!groqKey) {
    return res.status(503).json({ error: 'HuggingFace fallÃ³ y no hay GROQ_API_KEY configurada.' });
  }
  const groqBody    = { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: RADAR_SYSTEM }, { role: 'user', content: prompt }], max_tokens: safeMaxTokens, temperature: 0.3 };
  const groqHeaders = { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' };
  const groqUrl     = 'https://api.groq.com/openai/v1/chat/completions';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = await callProvider(groqUrl, groqHeaders, groqBody);
      console.log(`[importar] âœ… Groq OK (intento ${attempt})`);
      return res.json({ text });
    } catch (groqErr) {
      const msg = groqErr.message || '';
      const tpmMatch = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (tpmMatch && attempt < 3) {
        const waitMs = Math.ceil(parseFloat(tpmMatch[1]) * 1000) + 2000;
        console.warn(`[importar] â³ Groq TPM limit, esperando ${waitMs}ms (intento ${attempt}/3)...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      console.error(`[importar] âŒ Groq tambiÃ©n fallÃ³ (intento ${attempt}):`, msg);
      return res.status(503).json({ error: `Todos los proveedores fallaron. Ãšltimo error: ${msg}` });
    }
  }
});


router.get('/ai/og-image', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || !(await isSafePublicHttpUrl(url))) {
    return res.json({ image: null });
  }

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RADAR-Scraper/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return res.json({ image: null });

    const html = await response.text();
    const pick = (...patterns) => {
      for (const pattern of patterns) {
        const m = html.match(pattern);
        if (m?.[1]) return m[1].trim();
      }
      return null;
    };
    const image = pick(
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<img[^>]+(?:data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i
    );

    return res.json({ image: image ? new URL(image, url).href : null });
  } catch {
    return res.json({ image: null });
  }
});

function htmlAttrDecode(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function toDateOnly(value) {
  if (!value) return null;
  const raw = htmlAttrDecode(String(value));
  const iso = raw.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function pickMeta(html, ...names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["']`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return htmlAttrDecode(match[1]);
    }
  }
  return null;
}

function pickArticleDate(html) {
  const direct = pickMeta(
    html,
    'article:published_time',
    'article:modified_time',
    'datePublished',
    'datepublished',
    'date',
    'pubdate',
    'publishdate',
    'publish_date',
    'DC.date.issued',
    'parsely-pub-date',
    'sailthru.date'
  );
  const fromMeta = toDateOnly(direct);
  if (fromMeta) return fromMeta;

  const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of jsonLdMatches) {
    const body = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    const dateMatch = body.match(/"datePublished"\s*:\s*"([^"]+)"/i)
      || body.match(/"dateCreated"\s*:\s*"([^"]+)"/i)
      || body.match(/"dateModified"\s*:\s*"([^"]+)"/i);
    const parsed = toDateOnly(dateMatch?.[1]);
    if (parsed) return parsed;
  }

  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  return toDateOnly(timeMatch?.[1]);
}

function pickArticleImage(html, baseUrl) {
  const image = pickMeta(
    html,
    'og:image:secure_url',
    'og:image',
    'twitter:image:src',
    'twitter:image',
    'image'
  ) || html.match(/<img[^>]+(?:data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i)?.[1];
  if (!image) return null;
  try { return new URL(htmlAttrDecode(image), baseUrl).href; } catch { return null; }
}


router.get('/ai/article-metadata', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || !(await isSafePublicHttpUrl(url))) {
    return res.json({ image: null, articleDate: null });
  }

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RADAR-Scraper/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return res.json({ image: null, articleDate: null });

    const html = await response.text();
    return res.json({
      image: pickArticleImage(html, url),
      articleDate: pickArticleDate(html),
    });
  } catch {
    return res.json({ image: null, articleDate: null });
  }
});

export default router;
