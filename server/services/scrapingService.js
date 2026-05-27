// server/services/scrapingService.js
// Scraping responsable de páginas universitarias públicas con Selenium WebDriver.
// Requiere: npm install selenium-webdriver (en server/package.json)
// El ChromeDriver se gestiona automáticamente via Selenium Manager (v4.10+).

import db_empl from '../db_empl.js';

const DELAY_BETWEEN_REQUESTS_MS = 3000;
const PAGE_LOAD_TIMEOUT_MS = 20000;

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

export { scrapeProgramaUrl, scraperBatch, cargarTextoManual };
