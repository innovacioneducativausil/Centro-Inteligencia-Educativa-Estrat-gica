// server/services/scrapingService.js
// Scraping responsable de páginas universitarias públicas con Selenium WebDriver.
// Requiere: npm install selenium-webdriver (en server/package.json)
// El ChromeDriver se gestiona automáticamente via Selenium Manager (v4.10+).

import db_empl from '../db_empl.js';

const DELAY_BETWEEN_REQUESTS_MS = 3000;
const PAGE_LOAD_TIMEOUT_MS = 20000;
const DISCOVERY_TIMEOUT_MS = 12000;

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
    return String(await res.text()).substring(0, 80000);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
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

function scoreCandidate(url, text, careerName) {
  const haystack = normalizeText(`${url} ${text}`);
  const tokens = careerTokens(careerName);
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
  };
  for (const token of tokens) if (haystack.includes(token)) detail.carrera += 8;
  for (const keyword of keywords) if (haystack.includes(normalizeText(keyword))) detail.curricular += 5;
  if (/malla|plan|perfil|competencia|pregrado|carrera/i.test(url)) detail.url += 12;
  if (/pdf/i.test(url)) detail.documento += 4;
  if (/blog|noticia|evento|news|admision|postula|contacto|campus/i.test(url)) detail.ruido -= 10;
  const total = Object.values(detail).reduce((sum, value) => sum + value, 0);
  return { total, detail };
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
    const text = await fetchText(url);
    if (!text || text.length < 200) continue;
    const score = scoreCandidate(url, text, career);
    const tipo = inferSourceType(url, text);
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().substring(0, 350) : null;
    const snippet = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
    if (score.total >= 15) scored.push({ url, score: score.total, detail: score.detail, tipo, title, snippet, textLength: text.length });
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
  const bodyText = await driver.executeScript(
    'return document.body ? document.body.innerText : ""'
  );
  const title = await driver.getTitle().catch(() => '');
  return { url, title, text: String(bodyText || '').substring(0, 30000) };
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

  let driver = null;
  try {
    driver = await buildDriver();
    await sleep(1000);

    const result = await extractPageText(driver, url);

    await db_empl.query(
      `UPDATE programa_benchmark
       SET fuente_texto_original=?, fecha_captura=NOW(), estado_extraccion='procesado', observaciones=?
       WHERE id_programa_benchmark=?`,
      [result.text, `Título: ${result.title}`, idPrograma]
    );

    return { ok: true, textLength: result.text.length, title: result.title };
  } catch (err) {
    const msg = String(err.message || err).substring(0, 500);
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

export { scrapeProgramaUrl, scraperBatch, cargarTextoManual, discoverOfficialSources };
